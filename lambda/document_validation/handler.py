import base64
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.config import Config


LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(10 * 1024 * 1024)))

BEDROCK_CLIENT = boto3.client(
    "bedrock-runtime",
    region_name=AWS_REGION,
    config=Config(retries={"max_attempts": 3}),
)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

SUPPORTED_COUNTRIES = {"ve", "pe", "bo", "mx", "ar"}

DETECTED_DOCUMENT_TYPES = {
    "documentoFiscal",
    "documentoConstitucion",
    "facultadesRepresentante",
    "documentoRepresentante",
    "documentoIdentidad",
    "comprobanteDomicilio",
    "desconocido",
    "otro",
}

INCOMPATIBLE_DETECTED_TYPES = {
    "documentoConstitucion": {
        "documentoFiscal",
        "documentoRepresentante",
        "documentoIdentidad",
        "comprobanteDomicilio",
    },
    "documentoFiscal": {
        "documentoConstitucion",
        "facultadesRepresentante",
        "documentoRepresentante",
        "documentoIdentidad",
        "comprobanteDomicilio",
    },
    "facultadesRepresentante": {
        "documentoFiscal",
        "documentoRepresentante",
        "documentoIdentidad",
        "comprobanteDomicilio",
    },
    "documentoRepresentante": {
        "documentoFiscal",
        "documentoConstitucion",
        "facultadesRepresentante",
        "comprobanteDomicilio",
    },
    "documentoIdentidad": {
        "documentoFiscal",
        "documentoConstitucion",
        "facultadesRepresentante",
        "comprobanteDomicilio",
    },
    "comprobanteDomicilio": {
        "documentoFiscal",
        "documentoConstitucion",
        "facultadesRepresentante",
        "documentoRepresentante",
        "documentoIdentidad",
    },
}

# Slots canonicos recomendados:
# - documentoFiscal: documento tributario/fiscal del pais. Ej: RIF, RUC, NIT, RFC/CSF.
# - documentoConstitucion: documento de constitucion o registro de persona juridica/moral.
# - facultadesRepresentante: poder, vigencia o documento que acredita facultades del representante.
# - documentoRepresentante: identificacion oficial del representante legal.
# - documentoIdentidad: identificacion oficial de una persona natural/fisica.
# - comprobanteDomicilio: comprobante de domicilio fiscal o residencial, segun el expediente.
#
# Aliases legacy para no romper el frontend actual:
# - rif -> documentoFiscal
# - registroMercantil -> documentoConstitucion
# - cedulaRepresentante -> documentoRepresentante
SLOT_ALIASES = {
    "rif": "documentoFiscal",
    "ruc": "documentoFiscal",
    "nit": "documentoFiscal",
    "rfc": "documentoFiscal",
    "documentoFiscal": "documentoFiscal",
    "constanciaFiscal": "documentoFiscal",
    "constanciaSituacionFiscal": "documentoFiscal",

    "registroMercantil": "documentoConstitucion",
    "actaConstitutiva": "documentoConstitucion",
    "constitucionEmpresa": "documentoConstitucion",
    "documentoConstitucion": "documentoConstitucion",

    "poderNotarial": "facultadesRepresentante",
    "facultadesRepresentante": "facultadesRepresentante",
    "vigenciaPoder": "facultadesRepresentante",

    "cedulaRepresentante": "documentoRepresentante",
    "documentoRepresentante": "documentoRepresentante",
    "identificacionRepresentante": "documentoRepresentante",

    "documentoIdentidad": "documentoIdentidad",
    "identificacionOficial": "documentoIdentidad",

    "comprobanteDomicilio": "comprobanteDomicilio",
    "domicilioFiscal": "comprobanteDomicilio",
    
    "cuit": "documentoFiscal",
    "constanciaCuit": "documentoFiscal",
    "constanciaCUIT": "documentoFiscal",
    "constanciaInscripcion": "documentoFiscal",

    "estatuto": "documentoConstitucion",
    "contratoSocial": "documentoConstitucion",
    "instrumentoConstitutivo": "documentoConstitucion",

    "actaDesignacionAutoridades": "facultadesRepresentante",
    "actaAutoridades": "facultadesRepresentante",
    "designacionAutoridades": "facultadesRepresentante",
}

DOC_SLOT_LABELS: Dict[Tuple[str, str], str] = {
    # Venezuela
    ("ve", "documentoFiscal"): "RIF",
    ("ve", "documentoConstitucion"): "Registro Mercantil / Acta Constitutiva",
    ("ve", "facultadesRepresentante"): "Poder o facultades del representante legal",
    ("ve", "documentoRepresentante"): "Cedula de identidad del representante",
    ("ve", "documentoIdentidad"): "Cedula de identidad",
    ("ve", "comprobanteDomicilio"): "Comprobante de domicilio",

    # Peru
    ("pe", "documentoFiscal"): "RUC",
    ("pe", "documentoConstitucion"): "Partida Registral o documento de constitucion",
    ("pe", "facultadesRepresentante"): "Vigencia de Poder",
    ("pe", "documentoRepresentante"): "DNI o Carnet de Extranjeria del representante",
    ("pe", "documentoIdentidad"): "DNI o Carnet de Extranjeria",
    ("pe", "comprobanteDomicilio"): "Comprobante de domicilio fiscal",

    # Bolivia
    ("bo", "documentoFiscal"): "NIT",
    ("bo", "documentoConstitucion"): "Matricula de Comercio o Testimonio de Constitucion",
    ("bo", "facultadesRepresentante"): "Poder del representante legal",
    ("bo", "documentoRepresentante"): "Cedula de Identidad del representante",
    ("bo", "documentoIdentidad"): "Cedula de Identidad",
    ("bo", "comprobanteDomicilio"): "Comprobante de domicilio",

    # Mexico
    ("mx", "documentoFiscal"): "Constancia de Situacion Fiscal / RFC",
    ("mx", "documentoConstitucion"): "Acta Constitutiva",
    ("mx", "facultadesRepresentante"): "Poder Notarial o facultades del representante legal",
    ("mx", "documentoRepresentante"): "Identificacion oficial vigente del representante legal",
    ("mx", "documentoIdentidad"): "Identificacion oficial vigente",
    ("mx", "comprobanteDomicilio"): "Comprobante de domicilio fiscal",

    # Argentina
    ("ar", "documentoFiscal"): "Constancia de CUIT",
    ("ar", "documentoConstitucion"): "Estatuto / Contrato social",
    ("ar", "facultadesRepresentante"): "Acta de designacion de autoridades o Poder",
    ("ar", "documentoRepresentante"): "DNI del representante legal",
    ("ar", "documentoIdentidad"): "DNI",
    ("ar", "comprobanteDomicilio"): "Comprobante de domicilio fiscal",
}

DOC_VALIDATION_RULES: Dict[str, Dict[str, str]] = {
    "ve": {
        "documentoFiscal": (
            "Debe parecer un RIF venezolano emitido por el SENIAT o una constancia fiscal "
            "donde sea visible el numero RIF."
        ),
        "documentoConstitucion": (
            "Debe parecer un Registro Mercantil venezolano, Acta Constitutiva, Documento Constitutivo, "
            "Estatutos Sociales, acta registrada o documento societario inscrito. "
            "Indicadores esperados: Registro Mercantil, Documento Constitutivo, Acta Constitutiva, "
            "Estatutos Sociales, Registro de Comercio, tomo, folio, numero, expediente, capital social, "
            "acciones, accionistas, junta directiva, administradores, objeto social, sellos registrales "
            "o firma de registrador. "
            "No debe aceptarse RIF, SENIAT, Registro Unico de Informacion Fiscal, comprobante fiscal "
            "ni constancia fiscal como documento constitutivo."
        ),
        "facultadesRepresentante": (
            "Debe parecer un poder, acta, documento mercantil o instrumento legal venezolano "
            "que acredite las facultades del representante legal."
        ),
        "documentoRepresentante": "Debe parecer una cedula de identidad venezolana del representante legal.",
        "documentoIdentidad": "Debe parecer una cedula de identidad venezolana de persona natural.",
        "comprobanteDomicilio": (
            "Debe parecer un comprobante de domicilio venezolano, recibo de servicio, "
            "constancia de residencia o documento equivalente."
        ),
    },
    "pe": {
        "documentoFiscal": "Debe parecer un RUC peruano o documento de SUNAT donde sea visible el numero RUC.",
        "documentoConstitucion": (
            "Debe parecer una Partida Registral, escritura publica, documento de constitucion peruano "
            "o documento societario registral."
        ),
        "facultadesRepresentante": (
            "Debe parecer una Vigencia de Poder peruana, partida registral o documento que acredite "
            "facultades del representante legal."
        ),
        "documentoRepresentante": "Debe parecer un DNI o Carnet de Extranjeria del representante en Peru.",
        "documentoIdentidad": "Debe parecer un DNI o Carnet de Extranjeria de persona natural en Peru.",
        "comprobanteDomicilio": "Debe parecer un comprobante de domicilio o domicilio fiscal peruano.",
    },
    "bo": {
        "documentoFiscal": "Debe parecer un NIT boliviano o documento tributario boliviano donde sea visible el NIT.",
        "documentoConstitucion": (
            "Debe parecer una Matricula de Comercio, Testimonio de Constitucion "
            "o documento mercantil boliviano."
        ),
        "facultadesRepresentante": (
            "Debe parecer un poder notarial, testimonio o documento boliviano que acredite "
            "facultades del representante legal."
        ),
        "documentoRepresentante": "Debe parecer una cedula de identidad boliviana del representante legal.",
        "documentoIdentidad": "Debe parecer una cedula de identidad boliviana de persona natural.",
        "comprobanteDomicilio": "Debe parecer un comprobante de domicilio boliviano.",
    },
    "mx": {
        "documentoFiscal": (
            "Debe parecer una Constancia de Situacion Fiscal mexicana emitida por el SAT, "
            "Cedula de Identificacion Fiscal o documento fiscal mexicano donde sea visible el RFC. "
            "Puede corresponder a persona fisica o persona moral segun el expediente. "
            "Indicadores esperados: SAT, RFC, Cedula de Identificacion Fiscal, regimen fiscal, "
            "domicilio fiscal, codigo QR."
        ),
        "documentoConstitucion": (
            "Debe parecer un Acta Constitutiva mexicana, escritura publica, instrumento notarial, "
            "documento de constitucion de sociedad, o documento con datos de notario/corredor publico. "
            "Indicadores esperados: denominacion o razon social, objeto social, socios/accionistas, "
            "notario, escritura, folio mercantil o Registro Publico de Comercio."
        ),
        "facultadesRepresentante": (
            "Debe parecer un Poder Notarial mexicano, instrumento notarial, acta o documento legal "
            "donde consten las facultades del representante legal. "
            "Indicadores esperados: poder, apoderado, representante legal, facultades, "
            "actos de administracion, notario, escritura."
        ),
        "documentoRepresentante": (
            "Debe parecer una identificacion oficial vigente mexicana o aceptada en Mexico "
            "del representante legal. Puede ser Credencial para Votar INE/IFE, pasaporte, "
            "cedula profesional, tarjeta de residencia u otro documento oficial. "
            "Indicadores esperados: INE, Instituto Nacional Electoral, pasaporte, cedula profesional, "
            "nombre, fotografia, numero de documento, vigencia."
        ),
        "documentoIdentidad": (
            "Debe parecer una identificacion oficial vigente de persona fisica en Mexico. "
            "Puede ser Credencial para Votar INE/IFE, pasaporte, cedula profesional, "
            "tarjeta de residencia u otro documento oficial. "
            "Indicadores esperados: INE, Instituto Nacional Electoral, pasaporte, cedula profesional, "
            "nombre, fotografia, numero de documento, vigencia."
        ),
        "comprobanteDomicilio": (
            "Debe parecer un comprobante de domicilio fiscal o residencial mexicano. "
            "Puede ser recibo de luz, agua, telefono, estado de cuenta, predial, contrato "
            "o constancia de domicilio. Indicadores esperados: domicilio, codigo postal, "
            "entidad federativa, municipio o alcaldia, fecha de emision, nombre o razon social."
        ),
    },
    "ar": {
        "documentoFiscal": (
            "Debe parecer una Constancia de CUIT argentina, constancia de inscripcion fiscal "
            "o documento tributario argentino donde sea visible la CUIT. "
            "Puede corresponder a persona humana/persona fisica o persona juridica segun el expediente. "
            "Indicadores esperados: ARCA, AFIP, CUIT, Clave Unica de Identificacion Tributaria, "
            "constancia de inscripcion, domicilio fiscal, actividad, impuestos, codigo QR."
        ),
        "documentoConstitucion": (
            "Debe parecer un Estatuto, Contrato Social, Acta Constitutiva, instrumento constitutivo "
            "o documento societario argentino que acredite la constitucion de una persona juridica. "
            "Indicadores esperados: estatuto, contrato social, sociedad anonima, S.A., S.R.L., SAS, "
            "asociacion civil, fundacion, denominacion o razon social, objeto social, capital social, "
            "socios, accionistas, administradores, organo de administracion, inscripcion registral, "
            "Registro Publico, IGJ, Direccion Provincial de Personas Juridicas, escritura, tomo, folio, matricula."
        ),
        "facultadesRepresentante": (
            "Debe parecer un Acta de designacion de autoridades, acta de asamblea, acta de directorio, "
            "poder, autorizacion o documento argentino que acredite las facultades del representante legal. "
            "Indicadores esperados: representante legal, presidente, gerente, apoderado, autoridades, "
            "designacion, mandato, facultades, poder, acta de asamblea, acta de directorio, escribano."
        ),
        "documentoRepresentante": (
            "Debe parecer un DNI argentino del representante legal o documento de identidad aceptado "
            "para acreditar identidad en Argentina. "
            "Indicadores esperados: Documento Nacional de Identidad, DNI, Republica Argentina, "
            "RENAPER, numero de documento, apellido, nombre, fecha de nacimiento, fecha de vencimiento, "
            "domicilio, CUIL, codigo QR o codigo de barras."
        ),
        "documentoIdentidad": (
            "Debe parecer un DNI argentino de persona humana/persona fisica o documento de identidad "
            "aceptado para acreditar identidad en Argentina. "
            "Indicadores esperados: Documento Nacional de Identidad, DNI, Republica Argentina, "
            "RENAPER, numero de documento, apellido, nombre, fecha de nacimiento, fecha de vencimiento, "
            "domicilio, CUIL, codigo QR o codigo de barras."
        ),
        "comprobanteDomicilio": (
            "Debe parecer un comprobante de domicilio fiscal o residencial argentino. "
            "Puede ser factura o recibo de servicio, impuesto, estado de cuenta, contrato, constancia "
            "de domicilio o documento equivalente. "
            "Indicadores esperados: domicilio, provincia, localidad, codigo postal, fecha de emision, "
            "nombre, razon social, CUIT o CUIL."
        ),
    },
}

IDENTITY_EXTRACTION_SLOTS = {"documentoIdentidad", "documentoRepresentante"}


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
        raw_slot = require_string(payload, "slot")
        slot = normalize_slot(raw_slot)
        expected_legal_representatives = (
            normalize_extracted_legal_representatives(payload.get("expected_legal_representatives"))
            if "expected_legal_representatives" in payload
            else None
        )

        if content_type not in ALLOWED_MIME_TYPES:
            return response(400, {"ok": False, "error": f"Tipo de archivo no permitido: {content_type}"})

        try:
            file_bytes = base64.b64decode(file_base64, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("file_base64 no es un Base64 valido") from exc

        if len(file_bytes) > MAX_FILE_BYTES:
            return response(400, {"ok": False, "error": f"Archivo excede el maximo permitido de {MAX_FILE_BYTES} bytes"})

        # 1) Clasificacion neutral: no se le dice al modelo que valide contra el slot.
        classification = run_bedrock_classification(
            file_bytes=file_bytes,
            file_name=file_name,
            content_type=content_type,
            country=country,
        )

        # 2) Guardrails por nombre como proteccion adicional.
        classification = apply_filename_safety_hints(
            file_name=file_name,
            country=country,
            classification=classification,
        )

        # 3) Rechazo deterministico si el tipo detectado es incompatible con el slot.
        classification_error = reject_incompatible_document_type(
            country=country,
            slot=slot,
            raw_slot=raw_slot,
            classification=classification,
        )

        if classification_error:
            final = build_validation_response(
                file_name=file_name,
                content_type=content_type,
                country=country,
                slot=slot,
                raw_slot=raw_slot,
                file_size=len(file_bytes),
                analysis=classification_error,
            )
            return response(200, final)

        # 4) Validacion contextual solo si no hubo incompatibilidad clara.
        analysis = run_bedrock_validation(
            file_bytes=file_bytes,
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
            raw_slot=raw_slot,
            classification=classification,
        )

        # 5) Conservamos la clasificacion neutral como fuente de verdad para el tipo documental.
        analysis["detected_document_type"] = normalize_detected_document_type(
            classification.get("detected_document_type")
        )
        analysis["detected_country"] = normalize_detected_country(
            classification.get("detected_country")
        )
        analysis["_raw_classifier_text"] = classification.get("_raw_classifier_text", "")
        analysis["classifier_summary"] = classification.get("summary", "")

        # 6) Guardrails finales por si la validacion intenta aprobar algo incompatible.
        analysis = apply_post_validation_guards(
            country=country,
            slot=slot,
            raw_slot=raw_slot,
            file_name=file_name,
            analysis=analysis,
        )
        analysis = apply_expected_legal_representative_guard(
            country=country,
            slot=slot,
            analysis=analysis,
            expected_legal_representatives=expected_legal_representatives,
        )

        final = build_validation_response(
            file_name=file_name,
            content_type=content_type,
            country=country,
            slot=slot,
            raw_slot=raw_slot,
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
    if normalized not in SUPPORTED_COUNTRIES:
        raise ValueError("country debe ser 've', 'pe', 'bo', 'mx' o 'ar'")
    return normalized


def normalize_slot(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("slot es requerido")

    normalized = SLOT_ALIASES.get(raw)
    if normalized:
        return normalized

    allowed = sorted(set(SLOT_ALIASES.keys()) | set(SLOT_ALIASES.values()))
    raise ValueError(f"slot invalido. Valores aceptados: {', '.join(allowed)}")


def normalize_content_type(value: str) -> str:
    return value.split(";")[0].strip().lower()


def normalize_detected_document_type(value: Any) -> str:
    detected = str(value or "").strip()
    if detected not in DETECTED_DOCUMENT_TYPES:
        return "desconocido"
    return detected


def normalize_detected_country(value: Any) -> str:
    detected = str(value or "").strip().lower()
    if detected in SUPPORTED_COUNTRIES:
        return detected
    return "desconocido"


def normalize_text_for_matching(value: Any) -> str:
    text = str(value or "").lower()
    text = (
        text.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


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


def run_bedrock_classification(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    country: str,
) -> Dict[str, Any]:
    prompt = build_classification_prompt(
        file_name=file_name,
        content_type=content_type,
        country=country,
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
        inferenceConfig={"temperature": 0, "topP": 0.9, "maxTokens": 900},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    parsed["_raw_classifier_text"] = text
    return parsed


def build_classification_prompt(
    *,
    file_name: str,
    content_type: str,
    country: str,
) -> str:
    return f"""
Eres un clasificador documental para onboarding empresarial multi-pais.

Analiza el archivo de forma neutral.

IMPORTANTE:
- No debes validar contra ningun slot esperado.
- No debes asumir que el documento es correcto.
- Tu unica tarea es identificar que tipo de documento es realmente.
- El nombre del archivo es solo una pista secundaria. La decision principal debe basarse en el contenido visual/documental.

Clasifica detected_document_type usando exactamente uno de estos valores:
- "documentoFiscal": RIF, RUC, NIT, RFC, CUIT, Constancia de CUIT, Constancia de Inscripcion, Constancia de Situacion Fiscal, Cedula de Identificacion Fiscal, documento tributario, SENIAT, SUNAT, SAT, SIN, ARCA, AFIP, comprobante fiscal.
- "documentoConstitucion": Registro Mercantil, Acta Constitutiva, Documento Constitutivo, Estatutos Sociales, Estatuto, Contrato Social, Partida Registral, Matricula de Comercio, Testimonio de Constitucion, escritura de constitucion, instrumento constitutivo, documento registral de sociedad.
- "facultadesRepresentante": poder, vigencia de poder, facultades, autorizacion legal, nombramiento, acta de designacion de autoridades, acta de asamblea, acta de directorio o documento que acredite facultades del representante.
- "documentoRepresentante": identificacion oficial del representante legal.
- "documentoIdentidad": identificacion oficial de persona natural, persona fisica o persona humana. Ej: DNI argentino, INE/IFE, pasaporte, cedula de identidad.
- "comprobanteDomicilio": recibo, constancia o comprobante de domicilio.
- "desconocido": no se puede determinar.
- "otro": es legible pero no corresponde a ninguno de los anteriores.

Reglas criticas:
- Si ves "SENIAT", "RIF", "Registro Unico de Informacion Fiscal", "Registro Único de Información Fiscal", "domicilio fiscal" o "comprobante digital RIF", clasifica como "documentoFiscal".
- Un RIF de una empresa NO es Registro Mercantil ni Acta Constitutiva, aunque tenga razon social, domicilio fiscal, fecha de inscripcion o datos de la empresa.
- Si ves "Registro Mercantil", "Documento Constitutivo", "Acta Constitutiva", "Estatutos Sociales", "Registro de Comercio", clausulas, capital social, acciones, accionistas, junta directiva, tomo, folio, expediente, sellos o firmas registrales, clasifica como "documentoConstitucion".
- Si el documento es antiguo, borroso, fotocopia o en blanco y negro, clasifica por los indicadores visuales que puedas reconocer.
- No inventes palabras. Si no estas seguro, usa "desconocido" o baja la confianza.
- Si ves "ARCA", "AFIP", "CUIT", "Clave Unica de Identificacion Tributaria", "Constancia de Inscripcion" o "Constancia de CUIT", clasifica como "documentoFiscal".
- Una Constancia de CUIT de una empresa NO es Estatuto, Contrato Social ni Acta Constitutiva, aunque tenga razon social, domicilio fiscal o actividad.
- Si ves "Estatuto", "Contrato Social", "Acta Constitutiva", "instrumento constitutivo", "Registro Publico", "IGJ", "Direccion Provincial de Personas Juridicas", "capital social", "socios", "accionistas", "administradores" u "objeto social", clasifica como "documentoConstitucion".
- Si ves "Acta de designacion de autoridades", "Acta de asamblea", "Acta de directorio", "Poder", "Apoderado", "Presidente", "Gerente", "Representante legal" o "facultades", clasifica como "facultadesRepresentante".
- Si ves "Documento Nacional de Identidad", "DNI", "RENAPER" o "Republica Argentina" en una identificacion personal, clasifica como "documentoIdentidad" o "documentoRepresentante" segun contexto visible.

Devuelve JSON puro, sin markdown, con esta forma exacta:
{{
  "detected_document_type": "documentoFiscal" | "documentoConstitucion" | "facultadesRepresentante" | "documentoRepresentante" | "documentoIdentidad" | "comprobanteDomicilio" | "desconocido" | "otro",
  "detected_country": "ve" | "pe" | "bo" | "mx" | "ar" | "desconocido",
  "confidence": number,
  "keywords_found": ["..."],
  "summary": "descripcion corta de lo que es el archivo"
}}

Datos:
- file_name: {file_name}
- content_type: {content_type}
- country_hint: {country}
""".strip()


def run_bedrock_validation(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
    raw_slot: str,
    classification: Dict[str, Any],
) -> Dict[str, Any]:
    slot_label = DOC_SLOT_LABELS[(country, slot)]
    prompt = build_prompt(
        file_name=file_name,
        content_type=content_type,
        country=country,
        slot=slot,
        raw_slot=raw_slot,
        slot_label=slot_label,
        classification=classification,
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
        inferenceConfig={"temperature": 0, "topP": 0.9, "maxTokens": 1600},
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
    raw_slot: str,
    slot_label: str,
    classification: Dict[str, Any],
) -> str:
    rule = DOC_VALIDATION_RULES[country][slot]
    detected_document_type = normalize_detected_document_type(classification.get("detected_document_type"))
    detected_country = normalize_detected_country(classification.get("detected_country"))
    classifier_summary = str(classification.get("summary") or "").strip()
    classifier_keywords = normalize_string_list(classification.get("keywords_found"))

    should_extract_identity = slot in IDENTITY_EXTRACTION_SLOTS
    should_extract_legal_representatives = country == "ve" and slot == "documentoConstitucion"

    extraction_rules = """
Si el slot es "documentoIdentidad" o "documentoRepresentante", adicionalmente intenta extraer esta salida minima:
- firstName
- lastName
- documentNumber
- rawText

Para Mexico:
- Si el documento es INE/IFE, documentNumber puede ser la clave de elector, OCR, CIC o numero visible mas confiable.
- Si el documento es pasaporte, documentNumber debe ser el numero de pasaporte.
- Si aparece CURP, incluyela en rawText y, si es el identificador principal visible, puedes usarla como documentNumber.

Para Argentina:
- Si el documento es DNI, documentNumber debe ser el numero de DNI visible.
- Si aparece CUIL, incluyelo en rawText, pero no lo uses como documentNumber salvo que no haya numero de DNI visible.
- Si el documento corresponde a DNI del representante legal, extrae los datos de la persona fisica del DNI.

Si no puedes determinar un campo con confianza razonable, devuelvelo como cadena vacia.
No inventes datos.
""".strip()

    no_extraction_rules = "No extraigas campos de identidad para este slot; devuelve extractedIdentity con strings vacios."
    legal_representative_rules = """
Para Venezuela y slot "documentoConstitucion", adicionalmente identifica representantes legales, administradores, directores,
presidentes, gerentes, apoderados o personas con facultad visible para representar u obligar a la sociedad.

Devuelve extractedLegalRepresentatives como una lista de personas con:
- firstName
- lastName
- documentNumber
- role
- rawText

Reglas para extractedLegalRepresentatives:
- Incluye solo personas naturales mencionadas dentro del documento constitutivo/registral.
- Prioriza personas mencionadas junto a cargos o frases como representante legal, presidente, director, gerente, administrador,
  junta directiva, autorizado para representar, obligado por su firma o facultado para actuar por la sociedad.
- documentNumber debe ser la cedula visible si aparece, por ejemplo V-12345678 o E-12345678. Si no aparece, devuelve cadena vacia.
- rawText debe contener la frase corta visible que justifica la extraccion.
- No inventes nombres, cedulas ni cargos.
- Si no puedes identificar representantes legales con confianza razonable, devuelve una lista vacia.
""".strip()
    no_legal_representative_rules = "Devuelve extractedLegalRepresentatives como lista vacia."

    return f"""
Eres un validador documental para un onboarding empresarial multi-pais.

Analiza un unico archivo y determina si corresponde al documento esperado.

Documento esperado:
- country: "{country}"
- slot canonico esperado: "{slot}"
- slot recibido: "{raw_slot}"
- label: "{slot_label}"

Clasificacion neutral previa:
- detected_document_type: "{detected_document_type}"
- detected_country: "{detected_country}"
- classifier_summary: "{classifier_summary}"
- classifier_keywords: {json.dumps(classifier_keywords, ensure_ascii=False)}

Regla principal del slot esperado:
- {rule}

Criterios obligatorios:
1. Tu decision debe validar si el tipo documental real coincide con el slot esperado.
2. No apruebes un documento solo porque pertenece a la misma empresa.
3. Si el tipo documental detectado es incompatible con el slot esperado, responde status="error" y document_type_match=false.
4. Si el tipo documental coincide con el slot esperado, document_type_match=true.
5. Si coincide pero el archivo es viejo, borroso, parcial, recortado, incompleto o dificil de leer, responde status="warning", no status="error".
6. Usa status="valid" solo cuando el tipo documental coincide claramente y no hay observaciones importantes.
7. No inventes palabras, campos ni indicadores.

Reglas especiales Venezuela / documentoConstitucion:
- Si el slot esperado es "documentoConstitucion", acepta Registro Mercantil, Acta Constitutiva, Documento Constitutivo, Estatutos Sociales, acta registrada o documento societario inscrito.
- Para Venezuela, un RIF, SENIAT, Registro Unico de Informacion Fiscal, comprobante fiscal o constancia fiscal NO es Registro Mercantil ni Acta Constitutiva.
- Si ves "SENIAT" o "Registro Unico de Informacion Fiscal (RIF)" y no ves contenido constitutivo/registral, responde status="error", document_type_match=false.

Reglas especiales Argentina:
- Para Argentina, una Constancia de CUIT, constancia de inscripcion, AFIP o ARCA es documentoFiscal, no documentoConstitucion.
- Si el slot esperado es "documentoConstitucion", acepta Estatuto, Contrato Social, Acta Constitutiva, instrumento constitutivo, inscripcion registral o documento societario argentino.
- Si el slot esperado es "facultadesRepresentante", acepta Acta de designacion de autoridades, acta de asamblea, acta de directorio, poder o documento que acredite representantes/autoridades.
- Si el slot esperado es "documentoIdentidad" o "documentoRepresentante", acepta DNI argentino o documento de identidad personal, segun corresponda.

Instrucciones:
- Evalua el archivo completo de forma visual y documental.
- No inventes texto ni campos.
- El nombre del archivo es solo una pista secundaria.
- {extraction_rules if should_extract_identity else no_extraction_rules}
- {legal_representative_rules if should_extract_legal_representatives else no_legal_representative_rules}

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
  }},
  "extractedLegalRepresentatives": [
    {{
      "firstName": "",
      "lastName": "",
      "documentNumber": "",
      "role": "",
      "rawText": ""
    }}
  ]
}}

Reglas adicionales:
- confidence debe estar entre 0 y 1.
- Si status="valid", document_type_match debe ser true.
- Si status="error", document_type_match debe ser false.
- warnings solo aplica cuando hay dudas, calidad baja, vencimiento, documento de prueba o revision recomendada.
- reasons explica por que se rechaza, por que se acepta o por que hay observaciones.
- keywords_found debe incluir palabras o conceptos visibles relevantes si existen.
- Si el archivo esta vacio o completamente ilegible, responde "error".
- Si el archivo es parcialmente legible pero tiene indicadores fuertes del documento esperado, responde "warning".
- Si el slot no requiere extraccion de identidad, devuelve extractedIdentity con strings vacios.
- Si el slot no requiere extraccion de representantes legales, devuelve extractedLegalRepresentatives como lista vacia.

Datos del archivo:
- file_name: {file_name}
- content_type: {content_type}
- expected_country: {country}
- expected_slot: {slot}
""".strip()


def apply_filename_safety_hints(
    *,
    file_name: str,
    country: str,
    classification: Dict[str, Any],
) -> Dict[str, Any]:
    name = normalize_text_for_matching(file_name)
    current = normalize_detected_document_type(classification.get("detected_document_type"))

    if country == "ve":
        # Proteccion fuerte: un archivo llamado RIF casi seguro no debe pasar como Registro Mercantil.
        rif_name_patterns = [
            " rif ",
            "seniat",
            "registro unico informacion fiscal",
            "registro unico de informacion fiscal",
        ]

        padded_name = f" {name} "
        if any(pattern in padded_name for pattern in rif_name_patterns):
            classification["detected_document_type"] = "documentoFiscal"
            classification["detected_country"] = classification.get("detected_country") or "ve"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.85)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["RIF"]))
            classification["summary"] = classification.get("summary") or "El archivo parece corresponder a un RIF."

        # Ayuda suave para actas antiguas cuando el clasificador no pudo leer bien.
        constitution_name_patterns = [
            " acta ",
            "acta constitutiva",
            "registro mercantil",
            "documento constitutivo",
            "estatutos",
        ]

        if current in {"desconocido", "otro"} and any(pattern in padded_name for pattern in constitution_name_patterns):
            classification["detected_document_type"] = "documentoConstitucion"
            classification["detected_country"] = classification.get("detected_country") or "ve"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["Acta", "Registro Mercantil"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder a un documento constitutivo."

    if country == "ar":
        padded_name = f" {name} "

        fiscal_name_patterns = [
            " cuit ",
            "constancia cuit",
            "constancia de cuit",
            "constancia inscripcion",
            "constancia de inscripcion",
            "afip",
            "arca",
        ]

        if any(pattern in padded_name for pattern in fiscal_name_patterns):
            classification["detected_document_type"] = "documentoFiscal"
            classification["detected_country"] = classification.get("detected_country") or "ar"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.85)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["CUIT"]))
            classification["summary"] = classification.get("summary") or "El archivo parece corresponder a una Constancia de CUIT."

        constitution_name_patterns = [
            " estatuto ",
            "contrato social",
            "acta constitutiva",
            "instrumento constitutivo",
            "inscripcion societaria",
            "registro publico",
            "igj",
        ]

        if current in {"desconocido", "otro"} and any(pattern in padded_name for pattern in constitution_name_patterns):
            classification["detected_document_type"] = "documentoConstitucion"
            classification["detected_country"] = classification.get("detected_country") or "ar"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["Estatuto", "Contrato Social"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder a un documento constitutivo."

        powers_name_patterns = [
            "poder",
            "acta autoridades",
            "acta de autoridades",
            "designacion autoridades",
            "designacion de autoridades",
            "acta asamblea",
            "acta de asamblea",
            "acta directorio",
            "acta de directorio",
        ]

        if current in {"desconocido", "otro"} and any(pattern in padded_name for pattern in powers_name_patterns):
            classification["detected_document_type"] = "facultadesRepresentante"
            classification["detected_country"] = classification.get("detected_country") or "ar"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["Poder", "Acta de autoridades"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder a facultades del representante."

        identity_name_patterns = [
            " dni ",
            "documento nacional de identidad",
            "renaper",
        ]

        if current in {"desconocido", "otro"} and any(pattern in padded_name for pattern in identity_name_patterns):
            classification["detected_document_type"] = "documentoIdentidad"
            classification["detected_country"] = classification.get("detected_country") or "ar"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["DNI"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder a un DNI argentino."

    return classification


def reject_incompatible_document_type(
    *,
    country: str,
    slot: str,
    raw_slot: str,
    classification: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    detected = normalize_detected_document_type(classification.get("detected_document_type"))

    if detected not in INCOMPATIBLE_DETECTED_TYPES.get(slot, set()):
        return None

    expected_label = DOC_SLOT_LABELS.get((country, slot), slot)

    if country == "ve" and slot == "documentoConstitucion" and detected == "documentoFiscal":
        summary = "El archivo corresponde a un RIF, no a un Registro Mercantil o Acta Constitutiva."
        reasons = [
            "El documento fue clasificado como documento fiscal.",
            "El apartado Registro Mercantil requiere un Acta Constitutiva, Documento Constitutivo, Estatutos Sociales o Registro Mercantil.",
            "Un RIF/SENIAT no debe aceptarse como documento constitutivo.",
        ]
    elif country == "ar" and slot == "documentoConstitucion" and detected == "documentoFiscal":
        summary = "El archivo corresponde a una Constancia de CUIT, no a un Estatuto o Contrato social."
        reasons = [
            "El documento fue clasificado como documento fiscal.",
            "El apartado Estatuto / Contrato social requiere un documento constitutivo o societario.",
            "Una Constancia de CUIT/AFIP/ARCA no debe aceptarse como documento constitutivo.",
        ]
    elif country == "ar" and slot == "facultadesRepresentante" and detected == "documentoConstitucion":
        summary = "El archivo parece ser constitutivo, pero no acredita por si solo las facultades actuales del representante."
        reasons = [
            "El documento fue clasificado como documento constitutivo.",
            "El apartado de facultades requiere Acta de designacion de autoridades, acta de asamblea/directorio o Poder.",
        ]
    else:
        summary = f"El archivo corresponde a otro tipo de documento, no a {expected_label}."
        reasons = [
            f"Tipo documental detectado: {detected}.",
            f"Tipo documental esperado: {slot}.",
        ]

    return {
        "status": "error",
        "detected_document_type": detected,
        "detected_country": normalize_detected_country(classification.get("detected_country")),
        "document_type_match": False,
        "confidence": max(normalize_confidence(classification.get("confidence")), 0.85),
        "summary": summary,
        "warnings": [],
        "reasons": reasons,
        "keywords_found": normalize_string_list(classification.get("keywords_found")),
        "extractedIdentity": {
            "firstName": "",
            "lastName": "",
            "documentNumber": "",
            "rawText": "",
        },
        "extractedLegalRepresentatives": [],
        "_raw_classifier_text": classification.get("_raw_classifier_text", ""),
        "_raw_model_text": "",
    }


def apply_post_validation_guards(
    *,
    country: str,
    slot: str,
    raw_slot: str,
    file_name: str,
    analysis: Dict[str, Any],
) -> Dict[str, Any]:
    detected = normalize_detected_document_type(analysis.get("detected_document_type"))

    # Guardrail critico: RIF/SENIAT no puede aprobarse en Registro Mercantil.
    if country == "ve" and slot == "documentoConstitucion" and detected == "documentoFiscal":
        analysis["status"] = "error"
        analysis["document_type_match"] = False
        analysis["confidence"] = max(normalize_confidence(analysis.get("confidence")), 0.90)
        analysis["summary"] = "El archivo corresponde a un RIF, no a un Registro Mercantil o Acta Constitutiva."
        analysis["warnings"] = []
        analysis["reasons"] = [
            "El documento fue clasificado como documento fiscal.",
            "El apartado Registro Mercantil requiere un Acta Constitutiva, Documento Constitutivo, Estatutos Sociales o Registro Mercantil.",
            "Un RIF/SENIAT no debe aceptarse como documento constitutivo.",
        ]
        keywords = normalize_string_list(analysis.get("keywords_found"))
        analysis["keywords_found"] = sorted(set(keywords + ["RIF", "documentoFiscal"]))
        return analysis

    # Guardrail para actas viejas: si ya se clasifico como constitucion, no debe quedar como error
    # salvo que el modelo haya detectado algo realmente incompatible.
    if country == "ve" and slot == "documentoConstitucion" and detected == "documentoConstitucion":
        if normalize_status(analysis.get("status")) == "error":
            analysis["status"] = "warning"
            analysis["document_type_match"] = True
            analysis["summary"] = (
                "El archivo parece corresponder a un Registro Mercantil o Acta Constitutiva, "
                "pero requiere revision por calidad o legibilidad."
            )
            analysis["warnings"] = [
                "El documento parece corresponder al tipo solicitado, pero la calidad o legibilidad requiere revision manual."
            ]
            analysis["reasons"] = [
                "El clasificador detecto un documento constitutivo o registral.",
                "El documento puede ser antiguo, borroso o parcialmente legible.",
            ]
        else:
            analysis["document_type_match"] = True

    # Guardrail Argentina: CUIT/ARCA/AFIP no puede aprobarse como Estatuto / Contrato social.
    if country == "ar" and slot == "documentoConstitucion" and detected == "documentoFiscal":
        analysis["status"] = "error"
        analysis["document_type_match"] = False
        analysis["confidence"] = max(normalize_confidence(analysis.get("confidence")), 0.90)
        analysis["summary"] = "El archivo corresponde a una Constancia de CUIT, no a un Estatuto o Contrato social."
        analysis["warnings"] = []
        analysis["reasons"] = [
            "El documento fue clasificado como documento fiscal.",
            "El apartado Estatuto / Contrato social requiere un documento constitutivo o societario.",
            "Una Constancia de CUIT/AFIP/ARCA no debe aceptarse como documento constitutivo.",
        ]
        keywords = normalize_string_list(analysis.get("keywords_found"))
        analysis["keywords_found"] = sorted(set(keywords + ["CUIT", "documentoFiscal"]))
        return analysis

    # Guardrail Argentina: documento constitutivo antiguo o parcialmente legible.
    if country == "ar" and slot == "documentoConstitucion" and detected == "documentoConstitucion":
        if normalize_status(analysis.get("status")) == "error":
            analysis["status"] = "warning"
            analysis["document_type_match"] = True
            analysis["summary"] = (
                "El archivo parece corresponder a un Estatuto, Contrato social o documento constitutivo, "
                "pero requiere revision por calidad o legibilidad."
            )
            analysis["warnings"] = [
                "El documento parece corresponder al tipo solicitado, pero la calidad o legibilidad requiere revision manual."
            ]
            analysis["reasons"] = [
                "El clasificador detecto un documento constitutivo o societario.",
                "El documento puede ser antiguo, borroso o parcialmente legible.",
            ]
        else:
            analysis["document_type_match"] = True

    # Guardrail Argentina: facultades del representante.
    if country == "ar" and slot == "facultadesRepresentante" and detected == "facultadesRepresentante":
        if normalize_status(analysis.get("status")) == "error":
            analysis["status"] = "warning"
            analysis["document_type_match"] = True
            analysis["summary"] = (
                "El archivo parece corresponder a un acta de designacion de autoridades, poder "
                "o documento de facultades, pero requiere revision manual."
            )
            analysis["warnings"] = [
                "El documento parece acreditar facultades del representante, pero la calidad o contenido requiere revision manual."
            ]
            analysis["reasons"] = [
                "El clasificador detecto un documento de facultades del representante.",
            ]
        else:
            analysis["document_type_match"] = True

    return analysis


def apply_expected_legal_representative_guard(
    *,
    country: str,
    slot: str,
    analysis: Dict[str, Any],
    expected_legal_representatives: Optional[List[Dict[str, str]]],
) -> Dict[str, Any]:
    if country != "ve" or slot != "documentoRepresentante" or expected_legal_representatives is None:
        return analysis

    if normalize_status(analysis.get("status")) == "error":
        return analysis

    if not expected_legal_representatives:
        analysis["status"] = "error"
        analysis["document_type_match"] = False
        analysis["summary"] = "Primero cargue un Registro Mercantil / Acta Constitutiva donde se identifique el representante legal."
        analysis["warnings"] = []
        analysis["reasons"] = [
            "No se recibieron representantes legales extraidos del documento constitutivo.",
            "La cedula del representante debe validarse contra una persona que aparezca como representante legal en el acta.",
        ]
        return analysis

    identity = normalize_extracted_identity(analysis.get("extractedIdentity"))
    identity_text = " ".join(
        item
        for item in [
            identity.get("firstName", ""),
            identity.get("lastName", ""),
            identity.get("documentNumber", ""),
            identity.get("rawText", ""),
        ]
        if item
    )

    if any(
        legal_representative_matches(identity=identity, identity_text=identity_text, representative=representative)
        for representative in expected_legal_representatives
    ):
        return analysis

    analysis["status"] = "error"
    analysis["document_type_match"] = False
    analysis["summary"] = (
        "La persona de esta cedula no aparece como representante legal en el Registro Mercantil / Acta Constitutiva cargado."
    )
    analysis["warnings"] = []
    analysis["reasons"] = normalize_string_list(analysis.get("reasons")) + [
        "La identidad extraida de la cedula no coincide con los representantes legales extraidos del acta.",
    ]
    return analysis


def legal_representative_matches(
    *,
    identity: Dict[str, str],
    identity_text: str,
    representative: Dict[str, str],
) -> bool:
    representative_text = " ".join(
        item
        for item in [
            representative.get("firstName", ""),
            representative.get("lastName", ""),
            representative.get("documentNumber", ""),
            representative.get("role", ""),
            representative.get("rawText", ""),
        ]
        if item
    )

    return (
        document_numbers_match(identity.get("documentNumber"), representative.get("documentNumber"))
        or document_number_appears_in_text(representative.get("documentNumber"), identity_text)
        or document_number_appears_in_text(identity.get("documentNumber"), representative_text)
        or names_match(identity_text, representative_text)
    )


def document_numbers_match(left: Optional[str], right: Optional[str]) -> bool:
    left_variants = identity_number_variants(left)
    right_variants = identity_number_variants(right)
    return any(left_value in right_variants for left_value in left_variants)


def document_number_appears_in_text(document_number: Optional[str], text: str) -> bool:
    text_variants = identity_number_variants(text)
    return any(
        any(document_variant in text_variant for text_variant in text_variants)
        for document_variant in identity_number_variants(document_number)
    )


def identity_number_variants(value: Optional[str]) -> List[str]:
    normalized = normalize_text_for_matching(value).upper()
    compact = re.sub(r"[^A-Z0-9]", "", normalized)
    digits = re.sub(r"\D", "", normalized)
    return list(dict.fromkeys(item for item in [compact, digits] if len(item) >= 5))


def names_match(identity_text: str, representative_text: str) -> bool:
    identity_tokens = significant_name_tokens(identity_text)
    representative_tokens = set(significant_name_tokens(representative_text))
    if len(identity_tokens) < 2 or len(representative_tokens) < 2:
        return False

    matched = [token for token in identity_tokens if token in representative_tokens]
    return len(matched) >= 2


def significant_name_tokens(value: str) -> List[str]:
    ignored = {
        "CEDULA",
        "IDENTIDAD",
        "VENEZOLANO",
        "VENEZOLANA",
        "REPUBLICA",
        "BOLIVARIANA",
        "PRESIDENTE",
        "DIRECTOR",
        "REPRESENTANTE",
        "LEGAL",
    }
    tokens = normalize_text_for_matching(value).upper().split()
    return [token for token in tokens if len(token) >= 3 and token not in ignored]


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
    raw_slot: str,
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
    extracted_legal_representatives = normalize_extracted_legal_representatives(
        analysis.get("extractedLegalRepresentatives")
    )
    detected_document_type = normalize_detected_document_type(analysis.get("detected_document_type"))
    detected_country = normalize_detected_country(analysis.get("detected_country"))

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
        "rawSlot": raw_slot,
        "slotLabel": DOC_SLOT_LABELS.get((country, slot), slot),
        "status": status,
        "typeStatus": "error" if status == "error" else "review" if status == "warning" else "valid",
        "validityStatus": "unknown" if status == "error" else "warning" if status == "warning" else "ok",
        "summary": summary,
        "reasons": reasons,
        "warnings": warnings,
        "confidence": confidence,
        "document_type_match": document_type_match,
        "detectedDocumentType": detected_document_type,
        "detectedCountry": detected_country,
        "analysis": {
            "keywordsFound": keywords_found,
            "fileSizeBytes": file_size,
            "detectedDocumentType": detected_document_type,
            "detectedCountry": detected_country,
        },
        "extractedIdentity": extracted_identity,
        "extractedLegalRepresentatives": extracted_legal_representatives,
        "uiStatus": {
            "state": "error" if status == "error" else "warning" if status == "warning" else "ok",
            "title": ui_title,
            "message": summary,
        },
        "providerDiagnostics": {
            "bedrockModelId": BEDROCK_MODEL_ID,
            "rawClassifierText": analysis.get("_raw_classifier_text", ""),
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


def normalize_extracted_legal_representatives(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []

    representatives: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue

        representative = {
            "firstName": str(item.get("firstName") or "").strip(),
            "lastName": str(item.get("lastName") or "").strip(),
            "documentNumber": str(item.get("documentNumber") or "").strip(),
            "role": str(item.get("role") or "").strip(),
            "rawText": str(item.get("rawText") or "").strip(),
        }
        if any(representative.values()):
            representatives.append(representative)

    return representatives


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
