# Lambda Document Validation

Lambda en Python para validacion documental via Function URL.

Lambda desplegada: `Onboarding_validate_DanaConnect`.

Archivo fuente principal: `lambda_function.py`.
Handler configurado en AWS: `lambda_function.lambda_handler`.

## Referencias y persona natural (Mercantil)

- Slots nuevos para Venezuela: `referenciaPersonal`, `referenciaComercial`, `referenciaBancaria`.
- Las referencias se comprueban solo por formato: MIME permitido, limite de tamano y firma binaria
  PDF/JPEG/PNG/WEBP. No se certifican contenido, autenticidad, titularidad ni vigencia.
- La respuesta identifica este alcance con `validationScope: "file_format"`,
  `validityStatus: "unknown"` y `document_type_match: false`, aunque `status` sea `valid`.
- Solo `person_type: "natural"` con `slot: "referenciaBancaria"` solicita a Bedrock
  `extractedBankReference: {institution, product, balanceFigures}`. `institution` es el banco emisor,
  no el destinatario. `balanceFigures` conserva expresiones como "cuatro cifras bajas";
  no es el numero de cuenta ni un monto calculado. Datos ausentes o ilegibles quedan vacios.
- Solo persona natural de Venezuela con `slot: "documentoIdentidad"` devuelve ademas
  `extractedIdentity.birthDate` (YYYY-MM-DD) y `extractedIdentity.nationality`.
  No se inventa nacionalidad: "E" solo permite "Extranjera", no un pais concreto.
- Si falla la extraccion bancaria, el formato sigue aceptado con `status: "warning"` y los campos
  quedan disponibles para completarse manualmente en el frontend.
- El frontend ya envia las referencias a esta Lambda. Desplegar primero este `lambda_function.py`
  en la funcion existente. No se agregaron dependencias ni se realizo despliegue desde el repositorio.
- Configurar/verificar en DANAConnect los campos `REFERENCIA_PERSONAL`, `REFERENCIA_COMERCIAL`,
  `REFERENCIA_BANCARIA`, `FECHA_NACIMIENTO`, `NACIONALIDAD`, `INSTITUCION_BANCARIA`,
  `PRODUCTO_BANCARIO` y `CIFRAS_SALDO`, o sus equivalentes en `DANA_FIELD_MAP`/`DANA_FILE_FIELD_MAP`.

Pruebas sin llamadas a AWS:

```bash
python3 -m unittest discover -s lambda/document_validation -p 'test_*.py'
```

## Flujo

1. Recibe un archivo en base64 por `POST`.
2. Identifica el tipo de archivo (`pdf`, `jpeg`, `png`, `webp`).
3. Hace una clasificacion documental neutral con Amazon Bedrock usando `converse`.
4. Aplica guardrails por pais, nombre de archivo y tipo documental detectado.
5. Valida si el documento coincide con el `slot` esperado para el pais indicado.
6. Para Venezuela juridico, cuando el slot es `documentoConstitucion`, extrae texto con Amazon Textract
   usando S3 como almacenamiento temporal y solo luego usa Bedrock para estructurar posibles representantes
   legales o miembros de junta directiva desde ese OCR.
7. Filtra en backend cualquier representante que no tenga evidencia en el texto OCR.
8. Devuelve un JSON listo para integrar con el frontend.

## Variables de entorno

- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `MAX_FILE_BYTES` opcional, default `10485760`
- `DOCUMENT_BUCKET` bucket S3 temporal para OCR de PDFs con Textract. Ej: `dc-files-vzla-demo`
- `TEXTRACT_POLL_SECONDS` opcional, default `2`
- `TEXTRACT_MAX_WAIT_SECONDS` opcional, default `90`

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

- La clasificacion y validacion general siguen usando Bedrock. La extraccion de representantes/junta directiva
  desde actas venezolanas usa Textract + S3 para OCR y Bedrock solo estructura texto ya extraido.
- El bucket S3 debe permanecer privado, con ACLs deshabilitadas y bloqueo de acceso publico.
- La Lambda necesita permisos para `s3:PutObject`, `s3:DeleteObject`, `textract:StartDocumentTextDetection`,
  `textract:GetDocumentTextDetection` y `textract:DetectDocumentText`.
- Soporta estos paises en el handler actual: `ve`, `pe`, `bo`, `mx`, `ar`, `usa`.
- Soporta slots canonicos y aliases legacy:
  - `documentoFiscal` (`rif`, `ruc`, `nit`, `rfc`, `cuit`)
  - `documentoConstitucion` (`registroMercantil`, `actaConstitutiva`, `estatuto`, `contratoSocial`)
  - `facultadesRepresentante` (`poderNotarial`, `vigenciaPoder`, `actaDesignacionAutoridades`)
  - `documentoRepresentante` (`cedulaRepresentante`, `identificacionRepresentante`)
  - `documentoIdentidad`
  - `licenciaConducirFrente` (`driverLicenseFront`, `driversLicenseFront`, `licenseFront`)
  - `licenciaConducirReverso` (`driverLicenseBack`, `driversLicenseBack`, `licenseBack`)
  - `comprobanteDomicilio`
- La UI incluye Republica Dominicana (`do`), pero este handler todavia no la acepta en `SUPPORTED_COUNTRIES`.
- El payload de entrada está alineado con el frontend actual del portal.
- El `BEDROCK_MODEL_ID` debe apuntar a un inference profile o modelo ya habilitado en la cuenta.
- Si vas a usar Function URL desde el frontend, recuerda limitar CORS y proteger acceso antes de moverlo a productivo.
