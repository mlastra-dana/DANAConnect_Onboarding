# Lambda Document Validation

Lambda en Python para validacion documental via Function URL.

Lambda desplegada: `Onboarding_validate_DanaConnect`.

## Flujo

1. Recibe un archivo en base64 por `POST`.
2. Identifica el tipo de archivo (`pdf`, `jpeg`, `png`, `webp`).
3. Hace una clasificacion documental neutral con Amazon Bedrock usando `converse`.
4. Aplica guardrails por pais, nombre de archivo y tipo documental detectado.
5. Valida si el documento coincide con el `slot` esperado para el pais indicado.
6. Devuelve un JSON listo para integrar con el frontend.

## Variables de entorno

- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `MAX_FILE_BYTES` opcional, default `10485760`

Modelo usado en la demo:

- `anthropic.claude-3-haiku-20240307-v1:0`

## Request esperado

```json
{
  "file_name": "DNI ALBERTO LADO A.pdf",
  "content_type": "application/pdf",
  "file_base64": "<base64>",
  "country": "pe",
  "slot": "cedulaRepresentante"
}
```

## Response ejemplo

```json
{
  "ok": true,
  "file_name": "VIGENCIA DE PODER - DANACONNECT 2023.pdf",
  "country": "pe",
  "slot": "registroMercantil",
  "status": "valid",
  "summary": "El documento corresponde a una Vigencia de Poder emitida por SUNARP para DANACONNECT PERU S.A.C.",
  "warnings": [],
  "reasons": [],
  "uiStatus": {
    "state": "ok",
    "title": "Documento aceptado",
    "message": "El documento corresponde a una Vigencia de Poder emitida por SUNARP para DANACONNECT PERU S.A.C."
  }
}
```

## Notas

- Esta version no usa Textract ni S3; toda la validación se resuelve directamente con Bedrock.
- Soporta estos paises en el handler actual: `ve`, `pe`, `bo`, `mx`, `ar`.
- Soporta slots canonicos y aliases legacy:
  - `documentoFiscal` (`rif`, `ruc`, `nit`, `rfc`, `cuit`)
  - `documentoConstitucion` (`registroMercantil`, `actaConstitutiva`, `estatuto`, `contratoSocial`)
  - `facultadesRepresentante` (`poderNotarial`, `vigenciaPoder`, `actaDesignacionAutoridades`)
  - `documentoRepresentante` (`cedulaRepresentante`, `identificacionRepresentante`)
  - `documentoIdentidad`
  - `comprobanteDomicilio`
- La UI incluye Republica Dominicana (`do`), pero este handler todavia no la acepta en `SUPPORTED_COUNTRIES`.
- El payload de entrada está alineado con el frontend actual del portal.
- El `BEDROCK_MODEL_ID` debe apuntar a un inference profile o modelo ya habilitado en la cuenta.
- Si vas a usar Function URL desde el frontend, recuerda limitar CORS y proteger acceso antes de moverlo a productivo.
