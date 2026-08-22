import base64
import smtplib
import json
import logging
import os
import re
import uuid
import time
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import boto3
from botocore.config import Config


LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(10 * 1024 * 1024)))
DOCUMENT_BUCKET = os.environ.get("DOCUMENT_BUCKET", "").strip()
TEXTRACT_POLL_SECONDS = int(os.environ.get("TEXTRACT_POLL_SECONDS", "2"))
TEXTRACT_MAX_WAIT_SECONDS = int(os.environ.get("TEXTRACT_MAX_WAIT_SECONDS", "90"))
DEFAULT_SMTP_HOST = "cloudsmtp.danaconnect.com"
DEFAULT_SMTP_PORT = 587
DEFAULT_FILE_UPLOAD_URL = "https://appserv.danaconnect.com/dana/conversation/http/rest/file/upload"
HANDLER_VERSION = "2026-08-21-email-upload-v1"
DEFAULT_FIELD_LIMITS = {
    "APELLIDOS": 100,
    "DOCUMENTO_CONSTITUCION": 250,
    "DOCUMENTO_FISCAL": 250,
    "DOCUMENTO_IDENTIDAD": 250,
    "DOCUMENTO_REPRESENTANTE": 255,
    "EMAIL": 100,
    "FACULTADES_REPRESENTANTE": 250,
    "LICENCIA_BACK": 250,
    "LICENCIA_FRONT": 250,
    "NOMBRES": 100,
    "NOMBRE_CLIENTE": 100,
    "NOMBRE_EMPRESA": 100,
    "NUMERO_IDENTIFICACION": 100,
    "PAIS": 50,
    "REPRESENTANTE_LEGAL": 250,
    "TIPO_PERSONA": 100,
}
DEFAULT_FILE_FIELD_MAP = {
    "rif": "DOCUMENTO_FISCAL",
    "documentoFiscal": "DOCUMENTO_FISCAL",
    "registroMercantil": "DOCUMENTO_CONSTITUCION",
    "documentoConstitucion": "DOCUMENTO_CONSTITUCION",
    "actaDesignacionAutoridades": "FACULTADES_REPRESENTANTE",
    "facultadesRepresentante": "FACULTADES_REPRESENTANTE",
    "cedulaRepresentante": "DOCUMENTO_REPRESENTANTE",
    "documentoRepresentante": "DOCUMENTO_REPRESENTANTE",
    "documentoIdentidad": "DOCUMENTO_IDENTIDAD",
    "licenciaConducirFrente": "LICENCIA_FRONT",
    "licenciaConducirReverso": "LICENCIA_BACK",
}

BEDROCK_CLIENT = boto3.client(
    "bedrock-runtime",
    region_name=AWS_REGION,
    config=Config(retries={"max_attempts": 3}),
)
S3_CLIENT = boto3.client("s3", region_name=AWS_REGION, config=Config(retries={"max_attempts": 3}))
TEXTRACT_CLIENT = boto3.client("textract", region_name=AWS_REGION, config=Config(retries={"max_attempts": 3}))

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

SUPPORTED_COUNTRIES = {"ve", "pe", "bo", "mx", "ar", "usa"}

PLACEHOLDER_WORDS = {"ejemplo", "placeholder", "sample", "dummy", "ficticio", "inventado"}

DETECTED_DOCUMENT_TYPES = {
    "documentoFiscal",
    "documentoConstitucion",
    "facultadesRepresentante",
    "documentoRepresentante",
    "documentoIdentidad",
    "licenciaConducirFrente",
    "licenciaConducirReverso",
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
        "licenciaConducirFrente",
        "licenciaConducirReverso",
    },
    "licenciaConducirFrente": {
        "documentoFiscal",
        "documentoConstitucion",
        "facultadesRepresentante",
        "documentoRepresentante",
        "documentoIdentidad",
        "comprobanteDomicilio",
        "licenciaConducirReverso",
    },
    "licenciaConducirReverso": {
        "documentoFiscal",
        "documentoConstitucion",
        "facultadesRepresentante",
        "documentoRepresentante",
        "documentoIdentidad",
        "comprobanteDomicilio",
        "licenciaConducirFrente",
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

    "licenciaConducirFrente": "licenciaConducirFrente",
    "driverLicenseFront": "licenciaConducirFrente",
    "driversLicenseFront": "licenciaConducirFrente",
    "licenseFront": "licenciaConducirFrente",

    "licenciaConducirReverso": "licenciaConducirReverso",
    "driverLicenseBack": "licenciaConducirReverso",
    "driversLicenseBack": "licenciaConducirReverso",
    "licenseBack": "licenciaConducirReverso",

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
    ("ve", "documentoRepresentante"): "Cedula de identidad del representante o miembro de junta directiva",
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

    # Estados Unidos
    ("usa", "licenciaConducirFrente"): "Driver License - front",
    ("usa", "licenciaConducirReverso"): "Driver License - back",
    ("usa", "documentoIdentidad"): "Driver License or state ID",
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
        "documentoRepresentante": (
            "Debe parecer una cedula de identidad venezolana de una persona natural que el acta indique como "
            "representante legal, miembro de junta directiva, organo de administracion o autoridad societaria."
        ),
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
    "usa": {
        "licenciaConducirFrente": (
            "Debe parecer el frente de una licencia de conducir de Estados Unidos. "
            "Indicadores esperados: texto Driver License o Commercial Driver License, nombre y apellido, fotografia, "
            "estado emisor, DL/ID number o numero de licencia, fecha de nacimiento, fecha de expiracion, direccion, clase, "
            "sexo, estatura, color de ojos o fecha de emision. Debe corresponder al lado frontal con fotografia y datos personales."
        ),
        "licenciaConducirReverso": (
            "Debe parecer el reverso de una licencia de conducir de Estados Unidos. "
            "Indicadores esperados: codigo de barras PDF417 o barcode, banda magnetica, restricciones, endorsements, clase, "
            "texto de condiciones de manejo, organ donor, instrucciones o datos impresos del reverso. "
            "Debe corresponder al lado posterior; no aceptes el frente como reverso."
        ),
        "documentoIdentidad": (
            "Debe parecer una licencia de conducir estadounidense o identificacion estatal con fotografia y datos personales."
        ),
        "documentoFiscal": "No aplica para este flujo de persona natural en Estados Unidos.",
        "documentoConstitucion": "No aplica para este flujo de persona natural en Estados Unidos.",
        "facultadesRepresentante": "No aplica para este flujo de persona natural en Estados Unidos.",
        "documentoRepresentante": "No aplica para este flujo de persona natural en Estados Unidos.",
        "comprobanteDomicilio": "No aplica para este flujo de persona natural en Estados Unidos.",
    },
}

IDENTITY_EXTRACTION_SLOTS = {"documentoIdentidad", "documentoRepresentante", "licenciaConducirFrente"}


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "POST").upper()

    if method == "OPTIONS":
        return response(200, {"ok": True})

    if method != "POST":
        return response(405, {"ok": False, "error": "Metodo no permitido"})

    try:
        payload = parse_json_body(event)
        action = str(payload.get("action") or "").strip()
        if action in {"sendEmail", "send_email"}:
            return response(200, send_cloud_smtp_email(payload))
        if action in {"previewEmail", "preview_email"}:
            return response(200, preview_cloud_smtp_email(payload))

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
            expected_legal_representatives=expected_legal_representatives,
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
        if country == "ve" and slot == "documentoConstitucion" and analysis["detected_document_type"] == "documentoConstitucion":
            representative_extraction = run_legal_representative_extraction(
                file_bytes=file_bytes,
                file_name=file_name,
                content_type=content_type,
            )
            analysis["extractedLegalRepresentatives"] = representative_extraction["representatives"]
            analysis["representativeExtractionDiagnostics"] = representative_extraction["diagnostics"]

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
        if country != "ve" or slot != "documentoRepresentante":
            analysis["legalRepresentativeMatch"] = None
        LOGGER.info(
            "document_validation_result country=%s slot=%s status=%s extracted_legal_representatives=%s expected_legal_representatives=%s legal_representative_match=%s",
            country,
            slot,
            normalize_status(analysis.get("status")),
            len(normalize_extracted_legal_representatives(analysis.get("extractedLegalRepresentatives"))),
            "not_sent" if expected_legal_representatives is None else len(expected_legal_representatives),
            analysis.get("legalRepresentativeMatch"),
        )
        LOGGER.info(
            "document_validation_extraction_debug %s",
            json.dumps(
                build_extraction_debug_payload(
                    country=country,
                    slot=slot,
                    analysis=analysis,
                    expected_legal_representatives=expected_legal_representatives,
                ),
                ensure_ascii=False,
            ),
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


def optional_env(name: str) -> Optional[str]:
    value = os.environ.get(name)
    if value and value.strip():
        return value.strip()
    return None


def required_env(name: str) -> str:
    value = optional_env(name)
    if not value:
        raise ValueError(f"Falta variable de entorno: {name}")
    return value


def parse_json_object_env(name: str) -> Dict[str, Any]:
    raw = optional_env(name)
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} invalido: JSON invalido") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{name} debe ser un objeto JSON")
    return value


def normalize_field_name(value: Any) -> str:
    name = str(value or "").strip()
    name = (
        name.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
        .replace("Á", "A")
        .replace("É", "E")
        .replace("Í", "I")
        .replace("Ó", "O")
        .replace("Ú", "U")
        .replace("Ñ", "N")
    )
    return re.sub(r"[^A-Za-z0-9_]", "", name)


def normalize_field_value(name: str, value: Any) -> str:
    text = str(value or "").strip()
    if text.startswith("s3://"):
        return text
    limit = DEFAULT_FIELD_LIMITS.get(name)
    if limit:
        return text[:limit]
    return text


def resolve_smtp_user(id_company: str) -> str:
    explicit_user = optional_env("DANA_SMTP_USER")
    if explicit_user:
        return explicit_user
    login = required_env("DANA_SMTP_LOGIN")
    return f"{login}@{id_company}"


def resolve_smtp_recipient(id_company: str) -> str:
    explicit_to = optional_env("DANA_SMTP_TO")
    if explicit_to:
        return explicit_to
    id_conversation = required_env("DANA_ID_CONVERSATION")
    return f"{id_conversation}@{id_company}.email-platform.com"


def build_start_conversation_with_data(data: Any) -> str:
    if not isinstance(data, dict):
        raise ValueError("data es requerido para activar conversaciones por SMTP")

    field_map = parse_json_object_env("DANA_FIELD_MAP")
    static_data = parse_json_object_env("DANA_STATIC_DATA")
    merged_data = {**static_data, **data}
    params: Dict[str, str] = {"command": "StartConversationWithData"}

    for key, value in merged_data.items():
        if value is None:
            continue
        field_name = normalize_field_name(field_map.get(key, key))
        if not field_name:
            continue
        params[field_name] = normalize_field_value(field_name, value)

    if len(params) <= 1:
        raise ValueError("data no contiene campos para enviar a DANAConnect")

    return urlencode(params)


def resolve_file_field(document_type: str, requested_field: str) -> str:
    env_map = parse_json_object_env("DANA_FILE_FIELD_MAP")
    mapped = env_map.get(document_type) or requested_field or DEFAULT_FILE_FIELD_MAP.get(document_type)
    return normalize_field_name(mapped)


def resolve_file_upload_user(id_company: str) -> str:
    explicit_user = optional_env("DANA_FILE_UPLOAD_USER")
    if explicit_user:
        return explicit_user
    return resolve_smtp_user(id_company)


def resolve_file_upload_password() -> str:
    return optional_env("DANA_FILE_UPLOAD_PASS") or required_env("DANA_SMTP_PASS")


def encode_multipart_file(*, field_name: str, file_name: str, content_type: str, file_bytes: bytes) -> Tuple[bytes, str]:
    boundary = f"----DanaConnectBoundary{uuid.uuid4().hex}"
    safe_file_name = file_name.replace('"', "")
    parts = [
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="{field_name}"; filename="{safe_file_name}"\r\n'.encode("utf-8"),
        f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n".encode("utf-8"),
        file_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(parts), boundary


def upload_file_to_danaconnect(file_item: Dict[str, Any], *, id_company: str) -> Dict[str, Any]:
    file_name = str(file_item.get("fileName") or file_item.get("file_name") or "").strip()
    content_type = str(file_item.get("contentType") or file_item.get("content_type") or "application/octet-stream").strip()
    file_base64 = str(file_item.get("fileBase64") or file_item.get("file_base64") or "").strip()

    if not file_name:
        raise ValueError("Cada archivo debe incluir fileName")
    if not file_base64:
        raise ValueError(f"El archivo {file_name} no incluye fileBase64")

    try:
        file_bytes = base64.b64decode(file_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"fileBase64 invalido para {file_name}") from exc

    body, boundary = encode_multipart_file(
        field_name="file",
        file_name=file_name,
        content_type=content_type,
        file_bytes=file_bytes,
    )

    upload_url = optional_env("DANA_FILE_UPLOAD_URL") or DEFAULT_FILE_UPLOAD_URL
    username = resolve_file_upload_user(id_company)
    password = resolve_file_upload_password()
    auth = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")

    request = Request(
        upload_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "X-DEBUG": "1",
        },
    )

    with urlopen(request, timeout=int(optional_env("DANA_FILE_UPLOAD_TIMEOUT_SECONDS") or 30)) as result:
        response_body = result.read().decode("utf-8")

    parsed = json.loads(response_body)
    file_id = str(parsed.get("fileID") or "").strip()
    if not file_id:
        raise ValueError(f"File Upload API no devolvio fileID para {file_name}")

    return {
        "fileID": file_id,
        "fileName": parsed.get("fileName") or file_name,
        "idCompany": parsed.get("idCompany") or id_company,
        "requestID": parsed.get("requestID"),
    }


def upload_files_and_merge_data(payload: Dict[str, Any], *, id_company: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    data = dict(payload.get("data") or {})
    files = payload.get("files")
    uploaded_files: List[Dict[str, Any]] = []

    if not isinstance(files, list) or not files:
        return data, uploaded_files

    for item in files:
        if not isinstance(item, dict):
            continue
        document_type = str(item.get("documentType") or item.get("document_type") or "").strip()
        requested_field = str(item.get("field") or "").strip()
        field_name = resolve_file_field(document_type, requested_field)
        if not field_name:
            continue

        uploaded = upload_file_to_danaconnect(item, id_company=id_company)
        data[field_name] = uploaded["fileID"]
        uploaded_files.append({
            "documentType": document_type,
            "field": field_name,
            **uploaded,
        })

    return data, uploaded_files


def get_cloud_smtp_config(*, require_password: bool = True) -> Dict[str, Any]:
    id_company = required_env("DANA_ID_COMPANY")
    return {
        "host": optional_env("DANA_SMTP_HOST") or DEFAULT_SMTP_HOST,
        "port": int(optional_env("DANA_SMTP_PORT") or DEFAULT_SMTP_PORT),
        "user": resolve_smtp_user(id_company),
        "password": required_env("DANA_SMTP_PASS") if require_password else optional_env("DANA_SMTP_PASS"),
        "from": required_env("DANA_FROM"),
        "to": resolve_smtp_recipient(id_company),
        "cc": optional_env("DANA_CC"),
        "bcc": optional_env("DANA_BCC"),
        "mode": (optional_env("DANA_SMTP_MODE") or "conversation").lower(),
    }


def build_cloud_smtp_body(payload: Dict[str, Any], mode: str) -> str:
    if mode == "plain":
        return str(payload.get("body") or "").strip()
    return build_start_conversation_with_data(payload.get("data"))


def preview_cloud_smtp_email(payload: Dict[str, Any]) -> Dict[str, Any]:
    config = get_cloud_smtp_config(require_password=False)
    subject = str(payload.get("subject") or "")
    body = build_cloud_smtp_body(payload, config["mode"])
    return {
        "ok": True,
        "handlerVersion": HANDLER_VERSION,
        "to": config["to"],
        "from": config["from"],
        "cc": config["cc"],
        "bcc": config["bcc"],
        "subject": subject,
        "mode": config["mode"],
        "body": body,
    }


def send_cloud_smtp_email(payload: Dict[str, Any]) -> Dict[str, Any]:
    config = get_cloud_smtp_config(require_password=True)
    subject = str(payload.get("subject") or "").strip()
    if not subject:
        raise ValueError("subject es requerido")

    merged_data, uploaded_files = upload_files_and_merge_data(payload, id_company=required_env("DANA_ID_COMPANY"))
    payload = {**payload, "data": merged_data}
    body = build_cloud_smtp_body(payload, config["mode"])
    if not body:
        raise ValueError("body es requerido")

    LOGGER.info(
        "cloud_smtp_command_ready to=%s from=%s uploaded_files=%s body=%s",
        config["to"],
        config["from"],
        json.dumps(uploaded_files, ensure_ascii=False),
        body,
    )

    message = EmailMessage()
    message["From"] = config["from"]
    message["To"] = config["to"]
    if config["cc"]:
        message["Cc"] = config["cc"]
    if config["bcc"]:
        message["Bcc"] = config["bcc"]
    message["Subject"] = subject
    message.set_content(body)

    recipients = [config["to"]]
    if config["cc"]:
        recipients.extend([item.strip() for item in config["cc"].split(",") if item.strip()])
    if config["bcc"]:
        recipients.extend([item.strip() for item in config["bcc"].split(",") if item.strip()])

    try:
        with smtplib.SMTP(config["host"], config["port"], timeout=int(optional_env("DANA_SMTP_TIMEOUT_SECONDS") or 15)) as smtp:
            smtp.starttls()
            smtp.login(config["user"], config["password"])
            smtp.send_message(message, to_addrs=recipients)
    except smtplib.SMTPDataError as exc:
        return {
            "ok": False,
            "handlerVersion": HANDLER_VERSION,
            "stage": "smtp_send",
            "to": config["to"],
            "mode": config["mode"],
            "smtpCode": exc.smtp_code,
            "smtpError": exc.smtp_error.decode("utf-8", errors="replace")
            if isinstance(exc.smtp_error, bytes)
            else str(exc.smtp_error),
            "uploadedFiles": uploaded_files,
            "body": body,
        }

    return {
        "ok": True,
        "handlerVersion": HANDLER_VERSION,
        "to": config["to"],
        "mode": config["mode"],
        "uploadedFiles": uploaded_files,
    }


def normalize_country(value: Any) -> str:
    normalized = str(value or "ve").strip().lower()
    if normalized not in SUPPORTED_COUNTRIES:
        raise ValueError("country debe ser 've', 'pe', 'bo', 'mx', 'ar' o 'usa'")
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
        inferenceConfig={"temperature": 0, "maxTokens": 900},
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
- "licenciaConducirFrente": frente de una driver license estadounidense, con foto, nombre, direccion, fecha de nacimiento, DL/ID number, fecha de expiracion, estado emisor o texto Driver License.
- "licenciaConducirReverso": reverso de una driver license estadounidense, con barcode/PDF417, banda magnetica, restricciones, endorsements, clase o texto administrativo del reverso.
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
- Si ves "DRIVER LICENSE", "DL", "ID", una fotografia, nombre/direccion/DOB/EXP y el estado emisor de Estados Unidos, clasifica como "licenciaConducirFrente".
- Si ves un barcode PDF417 grande, banda magnetica, restricciones, endorsements o texto administrativo sin fotografia principal, clasifica como "licenciaConducirReverso".

Devuelve JSON puro, sin markdown, con esta forma exacta:
{{
  "detected_document_type": "documentoFiscal" | "documentoConstitucion" | "facultadesRepresentante" | "documentoRepresentante" | "documentoIdentidad" | "licenciaConducirFrente" | "licenciaConducirReverso" | "comprobanteDomicilio" | "desconocido" | "otro",
  "detected_country": "ve" | "pe" | "bo" | "mx" | "ar" | "usa" | "desconocido",
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
    expected_legal_representatives: Optional[List[Dict[str, str]]] = None,
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
        expected_legal_representatives=expected_legal_representatives,
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
        inferenceConfig={"temperature": 0, "maxTokens": 1600},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    parsed["_raw_model_text"] = text
    return parsed


def run_legal_representative_extraction(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
) -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {
        "provider": "textract+bedrock",
        "bucketConfigured": bool(DOCUMENT_BUCKET),
        "textractPages": 0,
        "textractLines": 0,
        "bedrockCandidates": 0,
        "confirmedRepresentatives": 0,
    }

    try:
        ocr_result = extract_document_text_with_textract(
            file_bytes=file_bytes,
            file_name=file_name,
            content_type=content_type,
        )
        diagnostics["textractPages"] = ocr_result["pageCount"]
        diagnostics["textractLines"] = len(ocr_result["lines"])
        diagnostics["textractProvider"] = ocr_result["provider"]

        if not ocr_result["text"].strip():
            diagnostics["error"] = "textract_empty_text"
            return {"representatives": [], "diagnostics": diagnostics}

        candidates = run_bedrock_legal_representative_extraction_from_ocr(
            ocr_text=build_representative_ocr_context(ocr_result["lines"]),
        )
        diagnostics["bedrockCandidates"] = len(candidates)
        confirmed = filter_representatives_by_ocr_evidence(
            candidates,
            ocr_text=ocr_result["text"],
        )
        diagnostics["confirmedRepresentatives"] = len(confirmed)

        LOGGER.info(
            "representative_textract_extraction file=%s pages=%s lines=%s candidates=%s confirmed=%s",
            file_name,
            diagnostics["textractPages"],
            diagnostics["textractLines"],
            diagnostics["bedrockCandidates"],
            diagnostics["confirmedRepresentatives"],
        )
        return {"representatives": confirmed, "diagnostics": diagnostics}
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("representative_textract_extraction_failed")
        diagnostics["error"] = str(exc)
        return {"representatives": [], "diagnostics": diagnostics}


def extract_document_text_with_textract(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
) -> Dict[str, Any]:
    if content_type == "application/pdf" or file_name.lower().endswith(".pdf"):
        if not DOCUMENT_BUCKET:
            raise ValueError("DOCUMENT_BUCKET es requerido para OCR de PDFs con Textract")
        return extract_pdf_text_with_textract(
            file_bytes=file_bytes,
            file_name=file_name,
        )

    return extract_image_text_with_textract(file_bytes=file_bytes)


def extract_pdf_text_with_textract(*, file_bytes: bytes, file_name: str) -> Dict[str, Any]:
    key = build_document_bucket_key(file_name)
    try:
        S3_CLIENT.put_object(
            Bucket=DOCUMENT_BUCKET,
            Key=key,
            Body=file_bytes,
            ContentType="application/pdf",
        )
        start_response = TEXTRACT_CLIENT.start_document_text_detection(
            DocumentLocation={
                "S3Object": {
                    "Bucket": DOCUMENT_BUCKET,
                    "Name": key,
                }
            }
        )
        job_id = start_response["JobId"]
        blocks = wait_for_textract_text_detection(job_id)
        lines = textract_lines_from_blocks(blocks)
        return {
            "provider": "textract:start_document_text_detection",
            "lines": lines,
            "pageCount": max([line["page"] for line in lines], default=0),
            "text": "\n".join(line["text"] for line in lines),
        }
    finally:
        try:
            S3_CLIENT.delete_object(Bucket=DOCUMENT_BUCKET, Key=key)
        except Exception:  # noqa: BLE001
            LOGGER.warning("document_bucket_cleanup_failed bucket=%s key=%s", DOCUMENT_BUCKET, key)


def extract_image_text_with_textract(*, file_bytes: bytes) -> Dict[str, Any]:
    result = TEXTRACT_CLIENT.detect_document_text(Document={"Bytes": file_bytes})
    lines = textract_lines_from_blocks(result.get("Blocks") or [])
    return {
        "provider": "textract:detect_document_text",
        "lines": lines,
        "pageCount": max([line["page"] for line in lines], default=1),
        "text": "\n".join(line["text"] for line in lines),
    }


def build_document_bucket_key(file_name: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", file_name.strip() or "documento.pdf").strip("-")
    if not safe_name:
        safe_name = "documento.pdf"
    return f"document-validation/{uuid.uuid4().hex}/{safe_name[:180]}"


def wait_for_textract_text_detection(job_id: str) -> List[Dict[str, Any]]:
    deadline = time.time() + TEXTRACT_MAX_WAIT_SECONDS

    while time.time() < deadline:
        result = TEXTRACT_CLIENT.get_document_text_detection(JobId=job_id)
        status = str(result.get("JobStatus") or "")
        if status == "SUCCEEDED":
            blocks = list(result.get("Blocks") or [])
            next_token = result.get("NextToken")
            while next_token:
                page = TEXTRACT_CLIENT.get_document_text_detection(JobId=job_id, NextToken=next_token)
                blocks.extend(page.get("Blocks") or [])
                next_token = page.get("NextToken")
            return blocks

        if status in {"FAILED", "PARTIAL_SUCCESS"}:
            message = str(result.get("StatusMessage") or status)
            raise ValueError(f"Textract no pudo leer el documento: {message}")

        time.sleep(max(1, TEXTRACT_POLL_SECONDS))

    raise TimeoutError("Textract no termino dentro del tiempo maximo configurado")


def textract_lines_from_blocks(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []
    for block in blocks:
        if block.get("BlockType") != "LINE":
            continue
        text = str(block.get("Text") or "").strip()
        if not text:
            continue
        lines.append(
            {
                "page": int(block.get("Page") or 1),
                "text": text,
                "confidence": float(block.get("Confidence") or 0.0),
            }
        )
    return lines


def build_representative_ocr_context(lines: List[Dict[str, Any]]) -> str:
    pages: Dict[int, List[str]] = {}
    for line in lines:
        pages.setdefault(int(line["page"]), []).append(str(line["text"]))

    chunks: List[str] = []
    for page in sorted(pages):
        page_text = "\n".join(pages[page])
        if page_has_representative_keywords(page_text):
            chunks.append(f"[PAGINA {page}]\n{page_text}")

    if not chunks:
        for page in sorted(pages):
            chunks.append(f"[PAGINA {page}]\n" + "\n".join(pages[page]))

    text = "\n\n".join(chunks)
    return text[:120000]


def page_has_representative_keywords(text: str) -> bool:
    normalized = normalize_text_for_matching(text)
    keywords = [
        "junta directiva",
        "administracion",
        "administrador",
        "presidente",
        "director",
        "directores",
        "gerente",
        "representante legal",
        "representacion",
        "facultado",
        "facultades",
        "obligar a la sociedad",
        "cedula de identidad",
    ]
    return any(keyword in normalized for keyword in keywords)


def run_bedrock_legal_representative_extraction_from_ocr(*, ocr_text: str) -> List[Dict[str, str]]:
    prompt = f"""
Eres un extractor estricto de representantes y autoridades societarias venezolanas.

Recibiras texto OCR producido por Amazon Textract. El OCR puede tener errores menores, pero tu respuesta debe basarse
exclusivamente en el texto provisto. No tienes permitido usar memoria, intuicion, ejemplos ni el nombre del archivo.

Extrae solo personas naturales que aparezcan en el OCR como:
- representante legal,
- miembro de junta directiva,
- presidente,
- director,
- gerente,
- administrador,
- autoridad societaria,
- apoderado,
- persona facultada para representar u obligar a la sociedad.

Reglas criticas:
- No inventes nombres, apellidos, cedulas ni cargos.
- Si un dato no aparece en el OCR, devuelvelo como cadena vacia.
- Si documentNumber tiene valor, ese numero debe aparecer en rawText.
- rawText debe ser un fragmento breve del OCR donde aparezcan juntos o cercanos el nombre, cargo y cedula si existe.
- Excluye accionistas, comisarios, regentes, abogados, registradores, notarios o terceros si no tienen cargo de administracion/representacion.
- Si no hay evidencia textual suficiente, devuelve lista vacia.

Devuelve JSON puro, sin markdown, con esta forma exacta:
{{
  "representatives": [
    {{
      "firstName": "",
      "lastName": "",
      "documentNumber": "",
      "role": "",
      "rawText": ""
    }}
  ]
}}

Texto OCR:
{ocr_text}
""".strip()

    bedrock_response = BEDROCK_CLIENT.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"temperature": 0, "maxTokens": 1800},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    return normalize_extracted_legal_representatives(parsed.get("representatives"))


def filter_representatives_by_ocr_evidence(
    representatives: List[Dict[str, str]],
    *,
    ocr_text: str,
) -> List[Dict[str, str]]:
    normalized_ocr = normalize_text_for_matching(ocr_text)
    confirmed: List[Dict[str, str]] = []

    for representative in normalize_extracted_legal_representatives(representatives):
        if not representative_has_allowed_role(representative):
            continue

        document_number = representative.get("documentNumber", "")
        if document_number and not document_number_appears_in_text(document_number, ocr_text):
            continue

        name_text = " ".join(
            item
            for item in [representative.get("firstName", ""), representative.get("lastName", "")]
            if item
        )
        name_tokens = significant_name_tokens(name_text)
        if not name_tokens:
            continue

        matched_name_tokens = [
            token for token in name_tokens
            if normalize_text_for_matching(token) in normalized_ocr
        ]
        minimum_matches = 2 if document_number else 3
        if len(matched_name_tokens) < min(minimum_matches, len(name_tokens)):
            continue

        confirmed.append(representative)

    return dedupe_legal_representatives(confirmed)


def representative_has_allowed_role(representative: Dict[str, str]) -> bool:
    role_text = normalize_text_for_matching(
        " ".join(
            item
            for item in [representative.get("role", ""), representative.get("rawText", "")]
            if item
        )
    )
    allowed = [
        "representante legal",
        "junta directiva",
        "administracion",
        "administrador",
        "presidente",
        "director",
        "gerente",
        "apoderado",
        "facultado",
        "representacion",
        "obligar a la sociedad",
    ]
    denied = ["comisario", "regente", "registrador", "notario", "abogado"]
    return any(item in role_text for item in allowed) and not any(item in role_text for item in denied)


def dedupe_legal_representatives(representatives: List[Dict[str, str]]) -> List[Dict[str, str]]:
    deduped: List[Dict[str, str]] = []
    seen: set[str] = set()

    for representative in representatives:
        number_variants = identity_number_variants(representative.get("documentNumber"))
        key = number_variants[0] if number_variants else normalize_text_for_matching(
            f"{representative.get('firstName', '')} {representative.get('lastName', '')} {representative.get('role', '')}"
        )
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(representative)

    return deduped


def run_bedrock_legal_representative_extraction(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
) -> List[Dict[str, str]]:
    first_pass = run_bedrock_legal_representative_extraction_pass(
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
        prompt=LEGAL_REPRESENTATIVE_EXTRACTION_PROMPT,
    )
    second_pass = run_bedrock_legal_representative_extraction_pass(
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
        prompt=LEGAL_REPRESENTATIVE_CONFIRMATION_PROMPT,
    )
    candidates = consensus_legal_representatives(first_pass, second_pass)
    if not candidates:
        return []

    return run_bedrock_legal_representative_verification(
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
        candidates=candidates,
    )


LEGAL_REPRESENTATIVE_EXTRACTION_PROMPT = """
Eres un extractor estricto de datos de documentos societarios venezolanos.

Tu unica tarea es leer el archivo adjunto y extraer personas naturales que aparezcan VISUALMENTE en el documento
como representantes legales, miembros de junta directiva, organo de administracion, autoridades societarias
o personas con cargos/facultades de representacion de la sociedad.

Incluye solo personas que aparezcan junto a cargos o frases como presidente, director, vicepresidente, secretario,
tesorero, gerente, administrador, miembro de junta directiva, organo de administracion, autoridad societaria,
representante legal, facultado para representar, facultado para obligar a la sociedad, obligado por su firma,
apoderado o autorizado para actuar por la sociedad.

Reglas obligatorias:
- No inventes nombres, apellidos, cedulas ni cargos.
- No uses datos de ejemplo, muestras, placeholders ni valores ficticios.
- No completes datos por intuicion.
- No uses el nombre del archivo como fuente de nombres.
- Si una cedula no es visible, documentNumber debe ser cadena vacia.
- rawText debe ser una frase breve copiada o resumida del texto visible donde aparezca la persona, su cargo/facultad
  y la cedula si documentNumber tiene valor.
- Si no puedes leer representantes, miembros de junta directiva o autoridades societarias con confianza razonable,
  devuelve una lista vacia.

Devuelve JSON puro, sin markdown, con esta forma exacta:
{
  "representatives": []
}

Si encuentras representantes, usa objetos con esta forma:
{
  "firstName": "",
  "lastName": "",
  "documentNumber": "",
  "role": "",
  "rawText": ""
}
""".strip()


LEGAL_REPRESENTATIVE_CONFIRMATION_PROMPT = """
Lee el documento societario venezolano adjunto de forma independiente.

Extrae unicamente personas naturales que el documento designe o mencione visualmente como parte de la administracion,
junta directiva, representantes legales, autoridades societarias o personas con facultades de representacion.

Criterios estrictos:
- Devuelve solo personas cuyo nombre completo veas en el documento.
- El cargo debe aparecer visualmente cerca del nombre o en la misma disposicion/seccion.
- Si devuelves documentNumber, ese numero debe verse asociado a esa misma persona.
- No uses ejemplos, no inventes, no completes nombres ni cedulas.
- No uses datos de memoria ni datos de otro documento.
- Si el documento es borroso o no puedes confirmar nombres reales, devuelve lista vacia.

Devuelve JSON puro con esta forma exacta:
{
  "representatives": [
    {
      "firstName": "",
      "lastName": "",
      "documentNumber": "",
      "role": "",
      "rawText": ""
    }
  ]
}
""".strip()


def run_bedrock_legal_representative_extraction_pass(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    prompt: str,
) -> List[Dict[str, str]]:
    user_content = build_bedrock_user_content(
        prompt=prompt,
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
    )

    bedrock_response = BEDROCK_CLIENT.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": user_content}],
        inferenceConfig={"temperature": 0, "maxTokens": 1200},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    return normalize_extracted_legal_representatives(parsed.get("representatives"))


def run_bedrock_legal_representative_verification(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    candidates: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    candidates_json = json.dumps(candidates, ensure_ascii=False)
    prompt = f"""
Eres un verificador estricto de extracciones de documentos societarios venezolanos.

Recibiras una lista de candidatos extraidos previamente del mismo documento adjunto. Tu unica tarea es confirmar
si cada candidato aparece VISUALMENTE en el documento como representante legal, miembro de junta directiva,
organo de administracion, autoridad societaria o persona con cargo/facultad de representacion.

Candidatos a verificar:
{candidates_json}

Reglas obligatorias:
- No agregues candidatos nuevos.
- No corrijas nombres por intuicion.
- No confirmes un candidato si no puedes ubicar visualmente su nombre en el documento.
- Si el candidato trae documentNumber, solo confirmalo si ese numero tambien aparece visualmente asociado a esa persona.
- Si el candidato no trae documentNumber, solo confirmalo si el nombre completo y el cargo aparecen visualmente en la misma seccion.
- evidenceQuote debe contener la frase visible que respalda nombre, cargo y cedula cuando exista cedula.
- Si tienes duda, excluye el candidato.

Devuelve JSON puro, sin markdown, con esta forma exacta:
{{
  "confirmedRepresentatives": []
}}

Si confirmas candidatos, usa objetos con esta forma:
{{
  "firstName": "",
  "lastName": "",
  "documentNumber": "",
  "role": "",
  "rawText": ""
}}
""".strip()

    user_content = build_bedrock_user_content(
        prompt=prompt,
        file_bytes=file_bytes,
        file_name=file_name,
        content_type=content_type,
    )

    bedrock_response = BEDROCK_CLIENT.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": user_content}],
        inferenceConfig={"temperature": 0, "maxTokens": 1200},
    )

    text = extract_bedrock_text(bedrock_response)
    parsed = parse_json_from_text(text)
    return normalize_extracted_legal_representatives(parsed.get("confirmedRepresentatives"))


def consensus_legal_representatives(
    first_pass: List[Dict[str, str]],
    second_pass: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    confirmed: List[Dict[str, str]] = []
    used_second_indexes: set[int] = set()

    for first in first_pass:
        for index, second in enumerate(second_pass):
            if index in used_second_indexes:
                continue
            if legal_representative_candidate_agrees(first, second):
                confirmed.append(merge_legal_representative_candidates(first, second))
                used_second_indexes.add(index)
                break

    return normalize_extracted_legal_representatives(confirmed)


def legal_representative_candidate_agrees(left: Dict[str, str], right: Dict[str, str]) -> bool:
    left_number_variants = identity_number_variants(left.get("documentNumber"))
    right_number_variants = identity_number_variants(right.get("documentNumber"))
    if left_number_variants and right_number_variants:
        return document_numbers_match(left.get("documentNumber"), right.get("documentNumber"))

    left_text = " ".join(
        item
        for item in [
            left.get("firstName", ""),
            left.get("lastName", ""),
            left.get("role", ""),
            left.get("rawText", ""),
        ]
        if item
    )
    right_text = " ".join(
        item
        for item in [
            right.get("firstName", ""),
            right.get("lastName", ""),
            right.get("role", ""),
            right.get("rawText", ""),
        ]
        if item
    )

    if not names_match(left_text, right_text):
        return False

    left_role = normalize_text_for_matching(left.get("role"))
    right_role = normalize_text_for_matching(right.get("role"))
    return not left_role or not right_role or left_role in right_text or right_role in left_text


def merge_legal_representative_candidates(left: Dict[str, str], right: Dict[str, str]) -> Dict[str, str]:
    return {
        "firstName": left.get("firstName") or right.get("firstName") or "",
        "lastName": left.get("lastName") or right.get("lastName") or "",
        "documentNumber": left.get("documentNumber") or right.get("documentNumber") or "",
        "role": left.get("role") or right.get("role") or "",
        "rawText": left.get("rawText") or right.get("rawText") or "",
    }


def build_prompt(
    *,
    file_name: str,
    content_type: str,
    country: str,
    slot: str,
    raw_slot: str,
    slot_label: str,
    classification: Dict[str, Any],
    expected_legal_representatives: Optional[List[Dict[str, str]]] = None,
) -> str:
    rule = DOC_VALIDATION_RULES[country][slot]
    detected_document_type = normalize_detected_document_type(classification.get("detected_document_type"))
    detected_country = normalize_detected_country(classification.get("detected_country"))
    classifier_summary = str(classification.get("summary") or "").strip()
    classifier_keywords = normalize_string_list(classification.get("keywords_found"))

    should_extract_identity = slot in IDENTITY_EXTRACTION_SLOTS
    should_extract_legal_representatives = False
    should_match_expected_representative = (
        country == "ve"
        and slot == "documentoRepresentante"
        and expected_legal_representatives is not None
    )
    expected_legal_representatives_json = json.dumps(
        expected_legal_representatives or [],
        ensure_ascii=False,
    )

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

Para Estados Unidos:
- Si el documento es el frente de una driver license, firstName y lastName deben salir de los campos visibles de nombre.
- documentNumber debe ser el DL/ID number o numero de licencia mas confiable visible.
- rawText debe incluir el estado emisor, DOB y EXP si son visibles.
- No extraigas datos de identidad desde el reverso salvo que esten impresos de forma legible y confiable.

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
- documentNumber debe ser la cedula visible si aparece. Si no aparece, devuelve cadena vacia.
- rawText debe contener la frase corta visible que justifica la extraccion.
- No inventes nombres, cedulas ni cargos.
- No uses datos de ejemplo, placeholders, muestras o valores ficticios.
- Cada persona devuelta debe aparecer de forma visible en el documento. Si no puedes copiar una frase visible que la justifique, excluyela.
- Si no puedes identificar representantes legales con confianza razonable, devuelve una lista vacia.
""".strip()
    no_legal_representative_rules = "Devuelve extractedLegalRepresentatives como lista vacia."
    legal_representative_match_rules = f"""
Para Venezuela y slot "documentoRepresentante", valida tambien si la cedula visible pertenece a una de las
personas esperadas extraidas previamente del Registro Mercantil / Acta Constitutiva. Estas personas pueden ser
representantes legales, miembros de junta directiva, organo de administracion o autoridades societarias con cargo visible.

Representantes legales esperados:
{expected_legal_representatives_json}

Reglas para legalRepresentativeMatch:
- Compara solo contra la persona visible en la cedula cargada, no contra el nombre del archivo.
- Primero compara cedula/documentNumber ignorando puntos, espacios, guiones y prefijos V/E.
- Si el numero no se puede leer completo, compara nombres y apellidos visibles contra los representantes esperados.
- legalRepresentativeMatch debe ser true si la cedula corresponde razonablemente a cualquiera de las personas esperadas.
- legalRepresentativeMatch debe ser false si la persona visible no corresponde a ninguno o si no puedes leer datos suficientes.
- matchedRepresentativeRole debe ser el cargo esperado que coincide, si existe.
- matchedRepresentativeEvidence debe explicar brevemente que nombre o cedula visible coincide.
- visibleIdentityEvidence debe incluir solo datos visibles en la cedula cargada: nombres, apellidos y numero de cedula leidos.
- No copies representantes esperados dentro de visibleIdentityEvidence.
""".strip()
    no_legal_representative_match_rules = """
Devuelve legalRepresentativeMatch como null, matchedRepresentativeRole como cadena vacia, matchedRepresentativeEvidence como cadena vacia y visibleIdentityEvidence como cadena vacia.
""".strip()

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

Reglas especiales Estados Unidos:
- Si el slot esperado es "licenciaConducirFrente", acepta solo el frente de una driver license estadounidense con fotografia y datos personales visibles.
- Si el slot esperado es "licenciaConducirReverso", acepta solo el reverso de una driver license estadounidense con barcode/PDF417, banda magnetica, restricciones, endorsements o texto administrativo del reverso.
- Si el usuario carga el frente en el slot de reverso, responde status="error", document_type_match=false.
- Si el usuario carga el reverso en el slot de frente, responde status="error", document_type_match=false.
- Si el documento parece una driver license estadounidense pero esta recortado, borroso o parcialmente legible, usa "warning".

Instrucciones:
- Evalua el archivo completo de forma visual y documental.
- No inventes texto ni campos.
- El nombre del archivo es solo una pista secundaria.
- {extraction_rules if should_extract_identity else no_extraction_rules}
- {legal_representative_rules if should_extract_legal_representatives else no_legal_representative_rules}
- {legal_representative_match_rules if should_match_expected_representative else no_legal_representative_match_rules}

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
  ],
  "legalRepresentativeMatch": null,
  "matchedRepresentativeRole": "",
  "matchedRepresentativeEvidence": "",
  "visibleIdentityEvidence": ""
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
- Si no se recibieron representantes legales esperados para comparar, devuelve legalRepresentativeMatch null.

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

    if country == "usa":
        padded_name = f" {name} "

        front_name_patterns = [
            "front",
            "frente",
            "driver license front",
            "drivers license front",
            "licencia frente",
        ]
        back_name_patterns = [
            "back",
            "reverse",
            "reverso",
            "driver license back",
            "drivers license back",
            "licencia reverso",
        ]

        if current in {"desconocido", "otro", "documentoIdentidad"} and any(pattern in padded_name for pattern in front_name_patterns):
            classification["detected_document_type"] = "licenciaConducirFrente"
            classification["detected_country"] = classification.get("detected_country") or "usa"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["Driver License", "front"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder al frente de una licencia de conducir."

        if current in {"desconocido", "otro", "documentoIdentidad"} and any(pattern in padded_name for pattern in back_name_patterns):
            classification["detected_document_type"] = "licenciaConducirReverso"
            classification["detected_country"] = classification.get("detected_country") or "usa"
            classification["confidence"] = max(normalize_confidence(classification.get("confidence")), 0.70)
            keywords = normalize_string_list(classification.get("keywords_found"))
            classification["keywords_found"] = sorted(set(keywords + ["Driver License", "back", "barcode"]))
            classification["summary"] = classification.get("summary") or "El archivo podria corresponder al reverso de una licencia de conducir."

    return classification


def reject_incompatible_document_type(
    *,
    country: str,
    slot: str,
    raw_slot: str,
    classification: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    detected = normalize_detected_document_type(classification.get("detected_document_type"))

    if country == "usa" and slot in {"licenciaConducirFrente", "licenciaConducirReverso"} and detected == "documentoIdentidad":
        return None

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
    elif country == "usa" and slot == "licenciaConducirFrente" and detected == "licenciaConducirReverso":
        summary = "El archivo corresponde al reverso de la licencia, no al frente."
        reasons = [
            "El documento fue clasificado como reverso de una licencia de conducir.",
            "Este apartado requiere el frente de la licencia con fotografia y datos personales.",
        ]
    elif country == "usa" and slot == "licenciaConducirReverso" and detected == "licenciaConducirFrente":
        summary = "El archivo corresponde al frente de la licencia, no al reverso."
        reasons = [
            "El documento fue clasificado como frente de una licencia de conducir.",
            "Este apartado requiere el reverso de la licencia con barcode o datos posteriores.",
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

        if not normalize_extracted_legal_representatives(analysis.get("extractedLegalRepresentatives")):
            analysis["status"] = "warning"
            analysis["document_type_match"] = True
            analysis["summary"] = (
                "El documento parece corresponder a un Registro Mercantil o Acta Constitutiva, "
                "pero no se pudieron extraer representantes legales o miembros de junta directiva con confianza."
            )
            warnings = normalize_string_list(analysis.get("warnings"))
            analysis["warnings"] = sorted(
                set(
                    warnings
                    + [
                        "No se identificaron representantes legales o miembros de junta directiva legibles para validar la cedula.",
                    ]
                )
            )

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

    if not expected_legal_representatives:
        analysis["status"] = "error"
        analysis["document_type_match"] = False
        analysis["summary"] = (
            "Primero cargue un Registro Mercantil / Acta Constitutiva donde se identifiquen representantes legales "
            "o miembros de junta directiva."
        )
        analysis["warnings"] = []
        analysis["reasons"] = [
            "No se recibieron representantes legales ni miembros de junta directiva extraidos del documento constitutivo.",
            "La cedula debe validarse contra una persona que aparezca como representante legal o miembro de junta directiva en el acta.",
        ]
        return analysis

    identity = normalize_extracted_identity(analysis.get("extractedIdentity"))
    evidence_text = build_representative_match_evidence_text(identity=identity, analysis=analysis)
    detected_document_type = normalize_detected_document_type(analysis.get("detected_document_type"))
    incompatible_detected_types = INCOMPATIBLE_DETECTED_TYPES.get("documentoRepresentante", set())

    if detected_document_type in incompatible_detected_types:
        return analysis

    identity_text = " ".join(
        item
        for item in [
            identity.get("firstName", ""),
            identity.get("lastName", ""),
            identity.get("documentNumber", ""),
            identity.get("rawText", ""),
            evidence_text,
        ]
        if item
    )

    for representative in expected_legal_representatives:
        if legal_representative_matches(identity=identity, identity_text=identity_text, representative=representative):
            analysis["legalRepresentativeMatch"] = True
            if not str(analysis.get("matchedRepresentativeRole") or "").strip():
                analysis["matchedRepresentativeRole"] = representative.get("role", "")
            if not str(analysis.get("matchedRepresentativeEvidence") or "").strip():
                analysis["matchedRepresentativeEvidence"] = (
                    "La identidad extraida coincide con una persona esperada del acta."
                )
            if normalize_status(analysis.get("status")) == "error":
                analysis["status"] = "valid"
                analysis["document_type_match"] = True
                analysis["summary"] = "Documento aceptado."
                analysis["warnings"] = normalize_string_list(analysis.get("warnings"))
            return analysis

    if normalize_status(analysis.get("status")) == "error":
        return analysis

    analysis["legalRepresentativeMatch"] = False
    analysis["status"] = "error"
    analysis["document_type_match"] = False
    analysis["summary"] = (
        "La persona de esta cedula no aparece como representante legal ni miembro de junta directiva en el Registro Mercantil / Acta Constitutiva cargado."
    )
    analysis["warnings"] = []
    analysis["reasons"] = normalize_string_list(analysis.get("reasons")) + [
        "La identidad extraida de la cedula no coincide con las personas extraidas del acta.",
    ]
    return analysis


def build_representative_match_evidence_text(*, identity: Dict[str, str], analysis: Dict[str, Any]) -> str:
    return " ".join(
        item
        for item in [
            identity.get("rawText", ""),
            str(analysis.get("visibleIdentityEvidence") or ""),
            str(analysis.get("summary") or ""),
            str(analysis.get("matchedRepresentativeEvidence") or ""),
            " ".join(normalize_string_list(analysis.get("keywords_found"))),
            str(analysis.get("classifier_summary") or ""),
        ]
        if item
    )


def legal_representative_matches(
    *,
    identity: Dict[str, str],
    identity_text: str,
    representative: Dict[str, str],
) -> bool:
    identity_number_variants_list = identity_number_variants(identity.get("documentNumber"))
    representative_number_variants_list = identity_number_variants(representative.get("documentNumber"))
    if identity_number_variants_list and representative_number_variants_list:
        return document_numbers_match(identity.get("documentNumber"), representative.get("documentNumber"))

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
        document_number_appears_in_text(representative.get("documentNumber"), identity_text)
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


def build_extraction_debug_payload(
    *,
    country: str,
    slot: str,
    analysis: Dict[str, Any],
    expected_legal_representatives: Optional[List[Dict[str, str]]],
) -> Dict[str, Any]:
    identity = normalize_extracted_identity(analysis.get("extractedIdentity"))
    extracted_representatives = normalize_extracted_legal_representatives(
        analysis.get("extractedLegalRepresentatives")
    )
    expected_representatives = (
        normalize_extracted_legal_representatives(expected_legal_representatives)
        if expected_legal_representatives is not None
        else None
    )

    return {
        "country": country,
        "slot": slot,
        "status": normalize_status(analysis.get("status")),
        "detectedDocumentType": normalize_detected_document_type(analysis.get("detected_document_type")),
        "detectedCountry": normalize_detected_country(analysis.get("detected_country")),
        "legalRepresentativeMatch": (
            analysis.get("legalRepresentativeMatch")
            if isinstance(analysis.get("legalRepresentativeMatch"), bool)
            else None
        ),
        "extractedIdentity": truncate_debug_identity(identity),
        "visibleIdentityEvidence": truncate_debug_text(analysis.get("visibleIdentityEvidence")),
        "matchedRepresentativeRole": truncate_debug_text(analysis.get("matchedRepresentativeRole")),
        "matchedRepresentativeEvidence": truncate_debug_text(analysis.get("matchedRepresentativeEvidence")),
        "extractedLegalRepresentatives": [
            truncate_debug_representative(representative)
            for representative in extracted_representatives
        ],
        "expectedLegalRepresentatives": (
            [
                truncate_debug_representative(representative)
                for representative in expected_representatives
            ]
            if expected_representatives is not None
            else "not_sent"
        ),
        "representativeExtractionDiagnostics": analysis.get("representativeExtractionDiagnostics") or {},
        "reasons": [truncate_debug_text(reason) for reason in normalize_string_list(analysis.get("reasons"))],
        "warnings": [truncate_debug_text(warning) for warning in normalize_string_list(analysis.get("warnings"))],
    }


def truncate_debug_identity(identity: Dict[str, str]) -> Dict[str, str]:
    return {
        "firstName": truncate_debug_text(identity.get("firstName")),
        "lastName": truncate_debug_text(identity.get("lastName")),
        "documentNumber": truncate_debug_text(identity.get("documentNumber")),
        "rawText": truncate_debug_text(identity.get("rawText"), limit=500),
    }


def truncate_debug_representative(representative: Dict[str, str]) -> Dict[str, str]:
    return {
        "firstName": truncate_debug_text(representative.get("firstName")),
        "lastName": truncate_debug_text(representative.get("lastName")),
        "documentNumber": truncate_debug_text(representative.get("documentNumber")),
        "role": truncate_debug_text(representative.get("role")),
        "rawText": truncate_debug_text(representative.get("rawText"), limit=500),
    }


def truncate_debug_text(value: Any, *, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


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
    legal_representative_match = analysis.get("legalRepresentativeMatch")
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
        "legalRepresentativeMatch": legal_representative_match if isinstance(legal_representative_match, bool) else None,
        "matchedRepresentativeRole": str(analysis.get("matchedRepresentativeRole") or "").strip(),
        "matchedRepresentativeEvidence": str(analysis.get("matchedRepresentativeEvidence") or "").strip(),
        "visibleIdentityEvidence": str(analysis.get("visibleIdentityEvidence") or "").strip(),
        "uiStatus": {
            "state": "error" if status == "error" else "warning" if status == "warning" else "ok",
            "title": ui_title,
            "message": summary,
        },
        "providerDiagnostics": {
            "bedrockModelId": BEDROCK_MODEL_ID,
            "representativeExtraction": analysis.get("representativeExtractionDiagnostics") or {},
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
        if representative["documentNumber"] and not document_number_appears_in_text(
            representative["documentNumber"],
            representative["rawText"],
        ):
            continue
        if is_placeholder_legal_representative(representative):
            continue
        if any(representative.values()):
            representatives.append(representative)

    return representatives


def is_placeholder_legal_representative(representative: Dict[str, str]) -> bool:
    text = normalize_text_for_matching(
        " ".join(
            item
            for item in [
                representative.get("firstName", ""),
                representative.get("lastName", ""),
                representative.get("documentNumber", ""),
                representative.get("rawText", ""),
            ]
            if item
        )
    )
    compact = re.sub(r"[^a-z0-9]", "", text)

    if not text:
        return False

    if any(word in text for word in PLACEHOLDER_WORDS):
        return True

    return is_obvious_sample_identity_number(representative.get("documentNumber", ""))


def is_obvious_sample_identity_number(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    if len(digits) < 6:
        return False

    if len(set(digits)) == 1:
        return True

    ascending = "012345678901234567890"
    descending = "987654321098765432109"
    return digits in ascending or digits in descending


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
