import base64
import json
import logging
import os
import re
from typing import Any, Dict, List

import boto3
from botocore.config import Config


LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-3-7-sonnet-20250219-v1:0")
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(10 * 1024 * 1024)))

BEDROCK_CLIENT = boto3.client("bedrock-runtime", region_name=AWS_REGION, config=Config(retries={"max_attempts": 3}))

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

DOC_SLOT_LABELS = {
    ("ve", "rif"): "RIF",
    ("ve", "registroMercantil"): "Registro Mercantil / Acta",
    ("ve", "cedulaRepresentante"): "Cedula del representante",
    ("ve", "documentoIdentidad"): "Cedula de identidad",
    ("pe", "rif"): "RUC",
    ("pe", "registroMercantil"): "Vigencia de Poder o Partida Registral",
    ("pe", "cedulaRepresentante"): "DNI o Carnet de Extranjeria del representante",
    ("pe", "documentoIdentidad"): "DNI o Carnet de Extranjeria",
    ("bo", "rif"): "NIT",
    ("bo", "registroMercantil"): "Matricula de Comercio o Testimonio de Constitucion",
    ("bo", "cedulaRepresentante"): "Cedula de Identidad del representante",
    ("bo", "documentoIdentidad"): "Cedula de Identidad",
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

        analysis = run_bedrock_validation(
            file_bytes=file_bytes,
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
        )

        final = build_validation_response(
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
            file_size=len(file_bytes),
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
    if normalized not in {"ve", "pe", "bo"}:
        raise ValueError("country debe ser 've', 'pe' o 'bo'")
    return normalized


def normalize_slot(value: Any) -> str:
    normalized = str(value or "").strip()
    if normalized not in {"rif", "registroMercantil", "cedulaRepresentante", "documentoIdentidad"}:
        raise ValueError("slot invalido")
    return normalized


def normalize_content_type(value: str) -> str:
    return value.split(";")[0].strip().lower()


def mime_to_bedrock_format(content_type: str, file_name: str) -> str:
    if content_type == "application/pdf" or file_name.lower().endswith(".pdf"):
        return "pdf"
    if content_type == "image/png":
        return "png"
    if content_type == "image/webp":
        return "webp"
    return "jpeg"


def build_bedrock_user_content(
    *,
    prompt: str,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
) -> List[Dict[str, Any]]:
    if content_type == "application/pdf":
        return [
            {"text": prompt},
            {
                "document": {
                    "format": "pdf",
                    "name": sanitize_document_name(file_name),
                    "source": {"bytes": file_bytes},
                }
            },
        ]

    return [
        {"text": prompt},
        {
            "image": {
                "format": mime_to_bedrock_format(content_type, file_name),
                "source": {"bytes": file_bytes},
            }
        },
    ]


def sanitize_document_name(file_name: str) -> str:
    base_name = (file_name or "documento").strip()

    if "." in base_name:
        base_name = base_name.rsplit(".", 1)[0]

    base_name = re.sub(r"[^A-Za-z0-9\s\-\(\)\[\]]+", " ", base_name)
    base_name = re.sub(r"\s+", " ", base_name).strip()

    if not base_name:
        base_name = "documento"

    return base_name[:200]


def run_bedrock_validation(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
) -> Dict[str, Any]:
    slot_label = DOC_SLOT_LABELS[(country, slot)]
    prompt = build_prompt(
        file_name=file_name,
        content_type=content_type,
        country=country,
        slot=slot,
        slot_label=slot_label,
    )

    user_content = build_bedrock_user_content(
        prompt=prompt,
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
    )

    bedrock_response = BEDROCK_CLIENT.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": user_content}],
        inferenceConfig={"temperature": 0, "topP": 0.9, "maxTokens": 1200},
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
) -> str:
    rules = {
        "ve": {
            "rif": "Debe parecer un RIF venezolano.",
            "registroMercantil": "Debe parecer un Registro Mercantil, Acta constitutiva o documento mercantil venezolano.",
            "cedulaRepresentante": "Debe parecer una cedula venezolana del representante.",
            "documentoIdentidad": "Debe parecer una cedula venezolana de persona natural.",
        },
        "pe": {
            "rif": "Debe parecer un RUC peruano.",
            "registroMercantil": "Debe parecer una Vigencia de Poder o Partida Registral peruana.",
            "cedulaRepresentante": "Debe parecer un DNI o Carnet de Extranjeria del representante en Peru.",
            "documentoIdentidad": "Debe parecer un DNI o Carnet de Extranjeria de persona natural en Peru.",
        },
        "bo": {
            "rif": "Debe parecer un NIT boliviano.",
            "registroMercantil": "Debe parecer una Matricula de Comercio, Testimonio de Constitucion o documento mercantil boliviano.",
            "cedulaRepresentante": "Debe parecer una cedula de identidad boliviana del representante.",
            "documentoIdentidad": "Debe parecer una cedula de identidad boliviana de persona natural.",
        },
    }

    extraction_rules = """
Si el slot es "documentoIdentidad", adicionalmente intenta extraer esta salida minima:
- firstName
- lastName
- documentNumber
- rawText

Si no puedes determinar un campo con confianza razonable, devuelvelo como cadena vacia.
No inventes datos.
""".strip()

    return f"""
Eres un validador documental para un onboarding empresarial.

Analiza un unico archivo y determina si corresponde al documento esperado.

Documento esperado:
- slot: "{slot}"
- label: "{slot_label}"
- country: "{country}"

Regla principal:
- {rules[country][slot]}

Instrucciones:
- Evalua el archivo completo de forma visual y documental.
- No inventes texto ni campos.
- No hace falta extraer datos estructurados salvo para documentoIdentidad.
- Tu trabajo principal es validar si el archivo coincide o no con el tipo documental esperado.
- Si el archivo parece correcto pero es parcial, borroso, incompleto o ambiguo, usa "warning".
- Si claramente no corresponde, usa "error".
- Si corresponde claramente, usa "valid".
- {extraction_rules if slot == "documentoIdentidad" else 'No extraigas campos de identidad para otros slots.'}

Tu respuesta DEBE ser JSON puro, sin markdown, con esta forma exacta:
{{
  "status": "valid" | "warning" | "error",
  "document_type_match": true | false,
  "confidence": number,
  "summary": "mensaje corto para UI",
  "warnings": ["..."],
  "reasons": ["..."],
  "keywords_found": ["..."],
  "extractedIdentity": {{
    "firstName": "",
    "lastName": "",
    "documentNumber": "",
    "rawText": ""
  }}
}}

Reglas adicionales:
- confidence debe estar entre 0 y 1.
- warnings solo aplica cuando hay dudas, calidad baja o revision recomendada.
- reasons explica por que se rechaza o por que hay observaciones.
- keywords_found debe incluir palabras o conceptos visibles relevantes si existen.
- Si el documento no coincide con el slot solicitado, document_type_match debe ser false.
- Si el archivo esta vacio, ilegible o no permite determinar el tipo, responde "error" o "warning" segun el caso.
- Si el slot no es documentoIdentidad, devuelve extractedIdentity con strings vacios.

Datos del archivo:
- file_name: {file_name}
- content_type: {content_type}
- country: {country}
- slot: {slot}
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
    file_size: int,
    analysis: Dict[str, Any],
) -> Dict[str, Any]:
    status = normalize_status(analysis.get("status"))
    warnings = normalize_string_list(analysis.get("warnings"))
    reasons = normalize_string_list(analysis.get("reasons"))
    keywords_found = normalize_string_list(analysis.get("keywords_found"))
    summary = str(analysis.get("summary") or "").strip()
    confidence = normalize_confidence(analysis.get("confidence"))
    document_type_match = bool(analysis.get("document_type_match"))
    extracted_identity = normalize_extracted_identity(analysis.get("extractedIdentity"))

    if status == "warning" and not warnings:
        warnings = ["La validacion no fue concluyente. Se recomienda revision manual."]
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
        "analysis": {
            "keywordsFound": keywords_found,
            "fileSizeBytes": file_size,
        },
        "extractedIdentity": extracted_identity,
        "uiStatus": {
            "state": "error" if status == "error" else "ok",
            "title": ui_title,
            "message": summary,
        },
        "providerDiagnostics": {
            "bedrockModelId": BEDROCK_MODEL_ID,
            "rawModelText": analysis.get("_raw_model_text", ""),
        },
    }


def normalize_extracted_identity(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {"firstName": "", "lastName": "", "documentNumber": "", "rawText": ""}
    return {
        "firstName": str(value.get("firstName") or "").strip(),
        "lastName": str(value.get("lastName") or "").strip(),
        "documentNumber": str(value.get("documentNumber") or "").strip(),
        "rawText": str(value.get("rawText") or "").strip(),
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
