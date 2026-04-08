import base64
import io
import json
import logging
import os
import re
from typing import Any, Dict, List

import boto3
from botocore.config import Config
import pypdfium2 as pdfium


LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "SET_ME_TO_A_SONNET_4_MODEL")
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(10 * 1024 * 1024)))

TEXTRACT_CLIENT = boto3.client("textract", region_name=AWS_REGION, config=Config(retries={"max_attempts": 3}))
BEDROCK_CLIENT = boto3.client("bedrock-runtime", region_name=AWS_REGION, config=Config(retries={"max_attempts": 3}))

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
}

DOC_SLOT_LABELS = {
    ("ve", "rif"): "RIF",
    ("ve", "registroMercantil"): "Registro Mercantil / Acta",
    ("ve", "cedulaRepresentante"): "Cedula del representante",
    ("pe", "rif"): "RUC",
    ("pe", "registroMercantil"): "Vigencia de Poder o Partida Registral",
    ("pe", "cedulaRepresentante"): "DNI o Carnet de Extranjeria del representante",
}


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "POST").upper()

    if method == "OPTIONS":
        return response(200, {"ok": True})

    if method != "POST":
        return response(405, {"ok": False, "error": "Metodo no permitido"})

    try:
        payload = parse_json_body(event)
        file_name = require_string(payload, "file_name")
        content_type = normalize_content_type(require_string(payload, "content_type"))
        file_base64 = require_string(payload, "file_base64")
        country = normalize_country(payload.get("country"))
        slot = normalize_slot(payload.get("slot"))

        if content_type not in ALLOWED_MIME_TYPES:
            return response(400, {"ok": False, "error": f"Tipo de archivo no permitido: {content_type}"})

        file_bytes = base64.b64decode(file_base64, validate=True)
        if len(file_bytes) > MAX_FILE_BYTES:
            return response(400, {"ok": False, "error": f"Archivo excede el maximo permitido de {MAX_FILE_BYTES} bytes"})

        extracted = run_textract(file_bytes=file_bytes, file_name=file_name, content_type=content_type)
        analysis = run_sonnet_analysis(
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
            extracted=extracted,
        )

        final = build_validation_response(
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
            extracted=extracted,
            analysis=analysis,
        )
        return response(200, final)
    except ValueError as exc:
        return response(400, {"ok": False, "error": str(exc)})
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("document_validation_failed")
        return response(500, {"ok": False, "error": f"Error interno al validar documento: {exc}"})


def parse_json_body(event: Dict[str, Any]) -> Dict[str, Any]:
    raw_body = event.get("body")
    if raw_body is None:
      raise ValueError("Body requerido")

    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Body JSON invalido: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError("El body debe ser un objeto JSON")

    return payload


def require_string(payload: Dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} es requerido")
    return value.strip()


def normalize_country(value: Any) -> str:
    normalized = str(value or "ve").strip().lower()
    if normalized not in {"ve", "pe"}:
        raise ValueError("country debe ser 've' o 'pe'")
    return normalized


def normalize_slot(value: Any) -> str:
    normalized = str(value or "").strip()
    if normalized not in {"rif", "registroMercantil", "cedulaRepresentante"}:
        raise ValueError("slot invalido")
    return normalized


def normalize_content_type(value: str) -> str:
    return value.split(";")[0].strip().lower()


def run_textract(*, file_bytes: bytes, file_name: str, content_type: str) -> Dict[str, Any]:
    if content_type == "application/pdf":
        rendered_first_page = render_first_pdf_page_to_png(file_bytes)
        textract_response = TEXTRACT_CLIENT.detect_document_text(Document={"Bytes": rendered_first_page})
    else:
        textract_response = TEXTRACT_CLIENT.detect_document_text(Document={"Bytes": file_bytes})

    blocks = textract_response.get("Blocks", [])
    lines = [block.get("Text", "").strip() for block in blocks if block.get("BlockType") == "LINE" and block.get("Text")]
    words = [block.get("Text", "").strip() for block in blocks if block.get("BlockType") == "WORD" and block.get("Text")]
    pages = max([int(block.get("Page", 1)) for block in blocks] or [1])
    full_text = "\n".join(lines).strip()

    return {
        "raw": textract_response,
        "pages": pages,
        "line_count": len(lines),
        "word_count": len(words),
        "text": full_text,
        "excerpt": full_text[:6000],
        "has_text": bool(full_text),
    }
def render_first_pdf_page_to_png(file_bytes: bytes) -> bytes:
    try:
        pdf = pdfium.PdfDocument(file_bytes)
        if len(pdf) < 1:
            raise ValueError("El PDF no contiene paginas.")

        page = pdf[0]
        bitmap = page.render(scale=2.4)
        image = bitmap.to_pil()

        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"No se pudo convertir la primera pagina del PDF a imagen: {exc}") from exc


def run_sonnet_analysis(
    *,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
    extracted: Dict[str, Any],
) -> Dict[str, Any]:
    slot_label = DOC_SLOT_LABELS[(country, slot)]
    prompt = build_prompt(
        file_name=file_name,
        content_type=content_type,
        country=country,
        slot=slot,
        slot_label=slot_label,
        extracted=extracted,
    )

    bedrock_response = BEDROCK_CLIENT.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"temperature": 0, "topP": 0.9, "maxTokens": 900},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    parsed["_raw_model_text"] = text
    return parsed


def build_prompt(
    *,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
    slot_label: str,
    extracted: Dict[str, Any],
) -> str:
    rules = {
        "ve": {
            "rif": "Debe parecer un RIF venezolano.",
            "registroMercantil": "Debe parecer un Registro Mercantil o Acta mercantil venezolana.",
            "cedulaRepresentante": "Debe parecer una cedula venezolana del representante.",
        },
        "pe": {
            "rif": "Debe parecer un RUC peruano.",
            "registroMercantil": "Debe parecer una Vigencia de Poder o Partida Registral peruana.",
            "cedulaRepresentante": "Debe parecer un DNI o Carnet de Extranjeria del representante en Peru.",
        },
    }

    return f"""
Eres un validador documental para un onboarding empresarial.

Analiza un documento para el slot "{slot}" ({slot_label}) del pais "{country}".

Regla principal:
- {rules[country][slot]}

Tu respuesta DEBE ser JSON puro, sin markdown, con esta forma exacta:
{{
  "status": "valid" | "warning" | "error",
  "document_type_match": true | false,
  "confidence": number,
  "summary": "mensaje corto",
  "warnings": ["..."],
  "reasons": ["..."],
  "keywords_found": ["..."]
}}

Criterios:
- Usa "valid" cuando el documento coincide claramente.
- Usa "warning" cuando parece correcto pero la lectura es parcial, limitada o incompleta.
- Usa "error" cuando no coincide o no hay evidencia suficiente.
- No inventes texto no presente.
- Si el texto extraido es pobre, puedes apoyarte moderadamente en el nombre del archivo.

Datos del archivo:
- file_name: {file_name}
- content_type: {content_type}
- country: {country}
- slot: {slot}
- pages_detected: {extracted["pages"]}
- line_count: {extracted["line_count"]}
- word_count: {extracted["word_count"]}

Texto extraido por Textract:
<<<
{extracted["excerpt"] or "[sin texto extraido]"}
>>>
""".strip()


def extract_bedrock_text(result: Dict[str, Any]) -> str:
    output = result.get("output") or {}
    message = output.get("message") or {}
    content = message.get("content") or []
    parts: List[str] = []
    for item in content:
        if "text" in item and item["text"]:
            parts.append(item["text"])
    return "\n".join(parts).strip()


def parse_json_from_text(text: str) -> Dict[str, Any]:
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("El modelo no devolvio JSON interpretable")

    data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("El modelo devolvio un JSON invalido")
    return data


def build_validation_response(
    *,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
    extracted: Dict[str, Any],
    analysis: Dict[str, Any],
) -> Dict[str, Any]:
    status = normalize_status(analysis.get("status"))
    warnings = normalize_string_list(analysis.get("warnings"))
    reasons = normalize_string_list(analysis.get("reasons"))
    keywords_found = normalize_string_list(analysis.get("keywords_found"))
    summary = str(analysis.get("summary") or "").strip()
    confidence = normalize_confidence(analysis.get("confidence"))
    document_type_match = bool(analysis.get("document_type_match"))

    if status == "warning" and not warnings:
        warnings = ["La lectura del documento fue parcial. Puede requerir revision manual."]
    if status == "error" and not reasons:
        reasons = ["No fue posible confirmar que el archivo corresponda al documento solicitado."]
    if status in {"valid", "warning"} and not summary:
        summary = "Documento aceptado." if status == "valid" else "Documento aceptado con revision recomendada."
    if status == "error" and not summary:
        summary = "Documento rechazado."

    ui_title = {
        "valid": "Documento aceptado",
        "warning": "Aceptado con revision recomendada",
        "error": "Con errores",
    }[status]

    return {
        "ok": True,
        "file_name": file_name,
        "content_type": content_type,
        "country": country,
        "slot": slot,
        "status": status,
        "typeStatus": "error" if status == "error" else "review" if status == "warning" else "valid",
        "validityStatus": "unknown" if status == "error" else "warning" if status == "warning" else "ok",
        "summary": summary,
        "reasons": reasons,
        "warnings": warnings,
        "confidence": confidence,
        "document_type_match": document_type_match,
        "extracted": {
            "hasText": extracted["has_text"],
            "pages": extracted["pages"],
            "lineCount": extracted["line_count"],
            "wordCount": extracted["word_count"],
            "keywordsFound": keywords_found,
            "excerpt": extracted["excerpt"][:1500],
        },
        "uiStatus": {
            "state": "error" if status == "error" else "ok",
            "title": ui_title,
            "message": summary,
        },
        "providerDiagnostics": {
            "bedrockModelId": BEDROCK_MODEL_ID,
            "textractPages": extracted["pages"],
            "rawModelText": analysis.get("_raw_model_text", ""),
        },
    }


def normalize_status(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in {"valid", "warning", "error"}:
        return "error"
    return normalized


def normalize_confidence(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, score))


def normalize_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type,authorization",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }
