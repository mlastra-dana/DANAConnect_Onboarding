# DanaConnect Onboarding Portal

Portal de onboarding documental construido con React + Vite, rebrandeado a estilo DanaConnect.

## Ejecutar local

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173/onboarding/demo-001`  
API local de correo: `http://localhost:8787`

## Cambios principales

- Re-brand completo con acento naranja DanaConnect (`#DD5736`) y tipografía Inter.
- Home con hero naranja full-bleed, un solo CTA principal y 3 feature cards.
- Selector de país al inicio con soporte UI para Venezuela (`ve`), Perú (`pe`), Bolivia (`bo`), México (`mx`), Argentina (`ar`), República Dominicana (`do`) y Estados Unidos (`usa`).
- Flujo actualizado: `Bienvenida -> Documentos -> Biometría -> Revisión -> Final`.
- Navbar limpia con logo, enlaces clave y botón `Salir` visible durante todo el onboarding.
- Reset global al usar `Inicio`, `Salir` o `Volver al inicio` (archivos, previews, validaciones y envío).
- Uploads unificados con `FileUploadCard`, drag & drop y selector de archivo confiable.
- Botón `X` en todos los adjuntos para limpiar archivo + preview + estado de validación.
- Soporte de segundo representante opcional en layout responsivo de 2 columnas en desktop.
- Validación documental remota vía Lambda + Bedrock, reemplazando la validación local heurística para la demo.
- Validación documental multi-país por slot:
  - `ve`: RIF, Registro Mercantil / Acta, Cédula del representante
  - `pe`: RUC, Vigencia de Poder / Partida Registral, DNI o CE del representante
  - `bo`: NIT, Matrícula de Comercio / Testimonio de Constitución, CI del representante
  - `mx`: Constancia de Situación Fiscal, Acta Constitutiva, Poder Notarial, identificación oficial
  - `ar`: CUIT, Estatuto / Contrato social, facultades del representante, DNI
  - `usa`: licencia de conducir para persona natural, frente y reverso
- Mensajes al usuario simplificados: éxito `Documento aceptado.` y errores de una sola línea.
- Pantalla final no técnica con checklist de recibidos y acciones `Copiar resumen`, `Abrir correo`, `Volver al inicio`.
- Envío final vía backend usando DANAConnect Cloud SMTP con activación de conversación por `StartConversationWithData`.

## Stack

- React 18 + TypeScript + Vite
- TailwindCSS
- React Router
- pdfjs-dist
- zod
- lucide-react

## Lambda Demo

Se agregó una Lambda en Python para validación documental con Function URL:

- Nombre desplegado: `Onboarding_validate_DanaConnect`
- [lambda_function.py](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/lambda_function.py)
- [requirements.txt](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/requirements.txt)
- [README.md](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/README.md)

Arquitectura final usada en la demo:

- El frontend en Amplify convierte el archivo a base64 y hace `POST` al Function URL.
- La Lambda clasifica y valida el archivo directamente con Amazon Bedrock usando `converse`.
- Para PDFs usa `document`; para imágenes usa `image`.
- La respuesta vuelve ya mapeada a estados compatibles con la UI (`valid`, `warning`, `error`).
- El modelo por defecto en el handler sincronizado es `anthropic.claude-3-haiku-20240307-v1:0`.

Variable de entorno recomendada en Amplify:

```bash
VITE_DOCUMENT_VALIDATION_URL=https://uou6hka7wmyfgtirokika5bkme0wfwzj.lambda-url.us-east-1.on.aws/
VITE_EMAIL_SEND_URL=https://uou6hka7wmyfgtirokika5bkme0wfwzj.lambda-url.us-east-1.on.aws/
```

## Envío por DANAConnect Cloud SMTP

El backend local expone `POST /api/send-email` para desarrollo. En producción, el mismo `lambda_function.py` desplegado en AWS puede enviar el correo si recibe `action: "sendEmail"`. Para activar una conversación, el cuerpo SMTP se arma como una sola línea:

```text
command=StartConversationWithData&companyName=...&country=...&summary=...
```

El destinatario se arma como `DANA_ID_CONVERSATION@DANA_ID_COMPANY.email-platform.com`, salvo que se defina `DANA_SMTP_TO`.

Variables requeridas:

```bash
DANA_ID_COMPANY=your_id_company
DANA_ID_CONVERSATION=your_conversation_id
DANA_SMTP_LOGIN=your_danaconnect_login
DANA_SMTP_PASS=your_danaconnect_password
DANA_FROM=danademo_comercial@danaconnect.com
```

Opcionales:

- `DANA_SMTP_USER`: úsalo si ya tienes el usuario completo, por ejemplo `smtp@idcompany`.
- `DANA_SMTP_TO`: destinatario completo, por ejemplo `577010@simpletv.email-platform.com`.
- `DANA_CC` / `DANA_BCC`: copias para pruebas internas.
- `DANA_SMTP_HOST`: default `cloudsmtp.danaconnect.com`.
- `DANA_SMTP_PORT`: default `587`.
- `DANA_SMTP_REQUIRE_TLS`: default `true`.
- `DANA_STATIC_DATA`: campos fijos requeridos por la conversación que no salen del portal.
- `DANA_FIELD_MAP`: mapea nombres locales a códigos reales de campos DANAConnect.

Para revisar el comando sin enviar SMTP, usa `POST /api/send-email/preview` con el mismo payload de `/api/send-email`.

En AWS Lambda configura estas variables de entorno:

```bash
DANA_ID_COMPANY=venturestars
DANA_ID_CONVERSATION=601944
DANA_SMTP_LOGIN=mlastra
DANA_SMTP_PASS=<secreto>
DANA_FROM=danademo_comercial@danaconnect.com
DANA_SMTP_TO=601944@venturestars.email-platform.com
DANA_SMTP_MODE=conversation
```

El frontend llama a `VITE_EMAIL_SEND_URL` con:

```json
{
  "action": "sendEmail",
  "subject": "...",
  "data": {
    "EMAIL": "destino@empresa.com",
    "NOMBRE_CLIENTE": "...",
    "NOMBRE_EMPRESA": "...",
    "PAIS": "...",
    "REPRESENTANTE_LEGAL": "...",
    "DOCUMENTO_FISCAL": "...",
    "DOCUMENTO_CONSTITUCION": "...",
    "FACULTADES_REPRESENTANTE": "...",
    "DOCUMENTO_REPRESENTANTE": "...",
    "DOCUMENTO_IDENTIDAD": "...",
    "LICENCIA_FRONT": "...",
    "LICENCIA_BACK": "...",
    "NOMBRES": "...",
    "APELLIDOS": "...",
    "NUMERO_IDENTIFICACION": "...",
    "TIPO_PERSONA": "..."
  }
}
```

### Carga de documentos antes de iniciar conversación

La misma Lambda también sube los archivos recibidos en `files` usando el File Upload API de DANAConnect antes de enviar el SMTP. El API devuelve `fileID` (`s3://...`) y la Lambda lo coloca en el campo de conversación correspondiente.

Variables opcionales para File Upload:

```bash
DANA_FILE_UPLOAD_URL=https://appserv.danaconnect.com/dana/conversation/http/rest/file/upload
DANA_FILE_UPLOAD_USER=mlastra@venturestars
DANA_FILE_UPLOAD_PASS=<secreto>
DANA_FILE_FIELD_MAP={"rif":"DOCUMENTO_FISCAL","documentoFiscal":"DOCUMENTO_FISCAL","registroMercantil":"DOCUMENTO_CONSTITUCION","documentoConstitucion":"DOCUMENTO_CONSTITUCION","actaDesignacionAutoridades":"FACULTADES_REPRESENTANTE","facultadesRepresentante":"FACULTADES_REPRESENTANTE","cedulaRepresentante":"DOCUMENTO_REPRESENTANTE","documentoRepresentante":"DOCUMENTO_REPRESENTANTE","documentoIdentidad":"DOCUMENTO_IDENTIDAD","licenciaConducirFrente":"LICENCIA_FRONT","licenciaConducirReverso":"LICENCIA_BACK"}
```

Si `DANA_FILE_UPLOAD_USER` / `DANA_FILE_UPLOAD_PASS` no se configuran, la Lambda usa las mismas credenciales SMTP. Los campos destino deben tener longitud suficiente para guardar el `fileID` (`s3://...`).
