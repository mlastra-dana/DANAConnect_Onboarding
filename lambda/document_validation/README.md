# Lambda Document Validation

Lambda en Python para validacion documental via Function URL.

Lambda desplegada: `Onboarding_validate_DanaConnect`.

Archivo fuente principal: `lambda_function.py`.
Handler configurado en AWS: `lambda_function.lambda_handler`.

## Diagnostico de StartConversation

Los diagnosticos se escriben desde la Lambda en CloudWatch, no en la lista de auditoria.
Despues de desplegar `lambda_function.py`, buscar estos eventos:

- `dana_start_requested`: proyecto y cantidad de campos enviados, sin sus valores.
- `dana_conversation_http`: ruta y estado HTTP de la respuesta.
- `dana_conversation_response`: estructura JSON y mensajes/codigos de servicio;
  omite valores de registros y oculta credenciales, valores enviados y correos.
- `dana_start_result`: proyecto, `id_result`, estado de confirmacion y `confirmed`.

Solo se acepta exito con `wsResult.resultDescription: "OK"` y un `idResult` entero
no negativo. Un HTTP 200 por si solo no confirma StartConversation. No se registran
tokens OAuth, credenciales ni valores arbitrarios de registros de la respuesta.
La confirmacion de la API no verifica por separado la escritura en la lista de DANA.
Auditoria usa el proyecto `207867`; el envio final usa `204507`. Un fallo de auditoria
se registra sin impedir la validacion documental. No se reintenta automaticamente.

## Referencias (compatibilidad del backend)

Main no muestra referencias ni campos bancarios y no los envia al onboarding. El backend
conserva estos slots por compatibilidad con la demo bancaria; lo siguiente describe ese uso.

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
- El frontend de la demo bancaria envia las referencias a esta Lambda. Desplegar primero este `lambda_function.py`
  en la funcion existente. No se agregaron dependencias ni se realizo despliegue desde el repositorio.
- En la demo bancaria, para persona natural, referencias, nacimiento, nacionalidad y datos bancarios se conservan
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
  El inicio de conversaciones de main usa REST; SMTP queda solo como compatibilidad para clientes antiguos.
- Para ver numeros reales se debe desplegar esta version de la Lambda y publicar el frontend.

### Auditoria en DANA (proyecto 207867)

- Configurar `DANA_TOKEN_AUDIT_PROJECT_ID=207867` para habilitarla. Sin esa variable no hay envios de auditoria.
- Usa OAuth y un POST JSON a `/api/2.0/rest/conversation/ProjectID/207867/start/data`,
  igual que la Lambda de referencia Validoc. No usa SMTP ni agrega el campo `command` al JSON.
- Inicia una conversacion separada por intento de validacion, sin adjuntos, CC/BCC,
  datos estaticos ni mapeos de campos del onboarding. DANA escribe la fecha.
- Se envia al terminar la validacion de cada archivo, antes de responder al frontend. No espera
  a otros documentos ni al boton Continuar. El envio final del onboarding no repite esta auditoria.
- En main, Venezuela mantiene RIF y cedula para persona natural, y RIF/Registro Mercantil
  para juridica (con representantes y asamblea opcional). Las referencias y los datos bancarios
  no se muestran ni se envian desde este frontend; pertenecen a la demo bancaria.
- Campos: `AUDIT_ID`, `ONBOARDING_ID`, `DOCUMENT`, `FILENAME`, `LAMBDA_NAME`, `MODEL_ID`,
  `LLAMADAS`, `RESULTADO_DOCUMENT`, `TOKEN_INPUT`, `TOKEN_OUTPUT`, `TOKENS_TOTALES`.
- `RESULTADO_DOCUMENT` usa valid/warning/error y agrega `_medicion_parcial` o
  `_medicion_no_disponible` cuando corresponde. Consumo desconocido se envia vacio, no cero.
- `ONBOARDING_ID` es un UUID generado por el frontend y conservado para la solicitud;
  `AUDIT_ID` es un UUID generado por el backend por intento. Clientes antiguos pueden enviar
  auditorias sin `ONBOARDING_ID` hasta publicar el frontend actualizado.
- Se considera aceptada una respuesta HTTP exitosa con JSON sin rechazo explicito; verificar
  la insercion en DANA durante la prueba de despliegue. Configurar unicidad en DANA si se requiere
  deduplicacion por `AUDIT_ID`.
- Un fallo se registra como `token_audit_failed` sin cambiar el resultado de la validacion;
  no hay reintentos automaticos ni garantia de entrega. `DANA_TIMEOUT_SECONDS` (default 20)
  limita cada llamada HTTP y agrega latencia a la respuesta. Revisar CloudWatch para detectar perdidas.

### Envio Final REST (proyecto 204507)

- El frontend usa `action: "submitOnboarding"` contra la Function URL de validacion o
  `VITE_ONBOARDING_SUBMIT_URL` si esta configurada. Ya no usa `/api/send-email` ni `VITE_EMAIL_SEND_URL`.
- Configurar `DANA_ONBOARDING_PROJECT_ID=204507` (tambien es el default). El proyecto de auditoria
  es independiente y no se permite usar su ID como destino del expediente.
- Primero valida OAuth, luego sube los adjuntos y finalmente hace POST JSON a
  `/api/2.0/rest/conversation/ProjectID/204507/start/data` con los campos existentes y sus fileID.
- Conserva `DANA_FIELD_MAP`, `DANA_STATIC_DATA`, limites y mapeos de documentos solo en el envio
  final. No mezcla esos campos con la auditoria. CC/BCC SMTP no se aplican por REST: las notificaciones
  se configuran en la conversacion DANA.
- Los errores distinguen `oauth`, `file_upload` y `start_conversation`. Un HTTP 507 del servicio
  de archivos aun debe resolverse en DANA; cambiar SMTP por REST no elimina el almacenamiento.
- Un error HTTP de autenticacion limpia el token en cache. No se reintentan automaticamente
  los POST de conversaciones para evitar duplicados. Si se reintenta un envio final desde el portal,
  los adjuntos podrian subirse otra vez; ante un timeout de respuesta comprobar DANA antes de reintentar.

### Configuracion REST

- En Lambda: `DANA_CLIENT_ID`, `DANA_CLIENT_SECRET`, `DANA_OAUTH_SCOPE=conversation:access2api`.
  OAuth usa client_credentials, autenticacion Basic y token en cache con vencimiento.
  `DANA_OAUTH_AUTH_METHOD=body` permite credenciales en el formulario; si no hay client ID/secret,
  admite el grant password con `DANA_USERNAME`/`DANA_PASSWORD`, igual que el ejemplo.
- Opcionales: `DANA_BASE_URL=https://appserv.danaconnect.com`,
  `DANA_TOKEN_URL=https://auth.danaconnect.com/oauth2/token`, `DANA_ACCESS_TOKEN` para un token
  configurado manualmente (sin renovacion automatica), `DANA_TIMEOUT_SECONDS=20`.
- Para archivos: `DANA_ID_COMPANY`, `DANA_USERNAME` y `DANA_PASSWORD`. Se mantienen los overrides
  `DANA_FILE_UPLOAD_USER`/`DANA_FILE_UPLOAD_PASS`; SMTP es el ultimo fallback para clientes antiguos.
- Los secretos pertenecen solo al backend, nunca a variables `VITE_*`, repositorio ni logs.
  Configurar credenciales de la cuenta Venture Stars; no copiar las de otra cuenta del ejemplo.
- Desplegar primero esta Lambda y sus variables, luego publicar el frontend. Las acciones antiguas
  `sendEmail`/`previewEmail` se conservan para compatibilidad, pero el nuevo frontend no las utiliza.

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
