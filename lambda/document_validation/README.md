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
- Para persona natural, referencias, nacimiento, nacionalidad y datos bancarios se conservan
  en el portal y no se agregan al comando SMTP ni a los adjuntos de DANAConnect.
  Se mantiene el contrato de envio anterior; no requiere campos nuevos en la conversacion.
- Para persona juridica, verificar los campos `REFERENCIA_COMERCIAL` y `REFERENCIA_BANCARIA`,
  o sus equivalentes en `DANA_FIELD_MAP`/`DANA_FILE_FIELD_MAP`.

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

- Las respuestas de validacion incluyen `tokenUsage`: `modelId`, `inputTokens`, `outputTokens`,
  `totalTokens`, `callCount`, `measuredCallCount` y `complete`. Suma las metricas devueltas por
  todas las llamadas Converse de esa solicitud, incluso si despues falla la validacion.
- El frontend muestra ese consumo por documento en la carga y en el resumen. Corresponde a la
  ultima validacion, no al acumulado de reintentos. Sin metricas se muestra consumo no disponible;
  `complete: false` indica una medicion parcial. Cero llamadas confirma que no se uso Bedrock.
- Se registra `bedrock_token_usage` por llamada en CloudWatch, sin contenido del documento.
  No incluye cobros de Textract/S3/Lambda ni consumos de intentos internos del SDK sin respuesta.
  No se modifica el contrato SMTP del envio del onboarding.
- Para ver numeros reales se debe desplegar esta version de la Lambda y publicar el frontend.

### Auditoria en DANA (proyecto 207867)

- Configurar `DANA_TOKEN_AUDIT_PROJECT_ID=207867` para habilitarla. Sin esa variable no hay envios de auditoria.
- Reutiliza host, puerto, usuario, password y remitente SMTP existentes. El destinatario es
  `207867@<DANA_ID_COMPANY>.email-platform.com`, independientemente del destinatario del onboarding.
- Envia un `StartConversationWithData` separado por intento de validacion, sin adjuntos, CC/BCC,
  datos estaticos ni mapeos de campos del onboarding. DANA escribe la fecha.
- Campos: `AUDIT_ID`, `ONBOARDING_ID`, `DOCUMENT`, `FILENAME`, `LAMBDA_NAME`, `MODEL_ID`,
  `LLAMADAS`, `RESULTADO_DOCUMENT`, `TOKEN_INPUT`, `TOKEN_OUTPUT`, `TOKENS_TOTALES`.
- `RESULTADO_DOCUMENT` usa valid/warning/error y agrega `_medicion_parcial` o
  `_medicion_no_disponible` cuando corresponde. Consumo desconocido se envia vacio, no cero.
- `ONBOARDING_ID` es un UUID generado por el frontend y conservado para la solicitud;
  `AUDIT_ID` es un UUID generado por el backend por intento. Clientes antiguos pueden enviar
  auditorias sin `ONBOARDING_ID` hasta publicar el frontend actualizado.
- Una respuesta SMTP aceptada confirma entrega al servidor, no la insercion final en la lista.
  Configurar unicidad en DANA si se requiere deduplicacion por `AUDIT_ID`.
- Un fallo se registra como `token_audit_failed` sin cambiar el resultado de la validacion;
  no hay reintentos automaticos ni garantia de entrega. La conexion SMTP usa timeout de 5 segundos
  por operacion y agrega latencia a la respuesta. Revisar CloudWatch para detectar perdidas.

- La clasificacion y validacion general siguen usando Bedrock. La extraccion de representantes/junta directiva
  desde actas venezolanas usa Textract + S3 para OCR y Bedrock solo estructura texto ya extraido.
- El bucket S3 debe permanecer privado, con ACLs deshabilitadas y bloqueo de acceso publico.
- La Lambda necesita permisos para `s3:PutObject`, `s3:DeleteObject`, `textract:StartDocumentTextDetection`,
  `textract:GetDocumentTextDetection` y `textract:DetectDocumentText`.
- Soporta estos paises en el handler actual: `ve`, `pe`, `bo`, `mx`, `ar`, `cl`, `usa`.
- Chile (`cl`) admite solo persona natural: `documentoIdentidad` (frente obligatorio) y `documentoIdentidadReverso` (opcional). Acepta cedulas chilenas de nacionales y extranjeros; extrae `extractedIdentity.run` (RUN/RUT con digito verificador) y `extractedIdentity.documentNumber` (campo NUMERO DOCUMENTO) por separado. El reverso recibe `expected_identity` del frente y compara los datos visibles/MRZ; las discrepancias se rechazan y una comparacion inconclusa requiere revision manual. El reverso nunca prellena el formulario. No se decodifica el QR ni se consulta autenticidad oficial.
- El envio conserva RUN en `NUMERO_IDENTIFICACION`, numero de documento en `NUMERO_DOCUMENTO`, frente en `DOCUMENTO_IDENTIDAD` y reverso en `DOCUMENTO_IDENTIDAD_REVERSO`. Configurar este ultimo campo en la lista/conversacion destino antes de usarlo. Si se adjunta un reverso, debe estar aceptado para continuar; al cambiar el frente se conserva el adjunto pero se exige repetir su comparacion.
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
