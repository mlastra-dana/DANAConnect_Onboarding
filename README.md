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
- Selector de país al inicio con soporte para Venezuela (`ve`) y Perú (`pe`).
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
- Mensajes al usuario simplificados: éxito `Documento aceptado.` y errores de una sola línea.
- Pantalla final no técnica con checklist de recibidos y acciones `Copiar resumen`, `Abrir correo`, `Volver al inicio`.
- Correo amigable vía `mailto` a `mlastra@danaconnect.com` con resumen y link del portal.

## Stack

- React 18 + TypeScript + Vite
- TailwindCSS
- React Router
- pdfjs-dist
- zod
- lucide-react

## Lambda Demo

Se agregó una Lambda en Python para validación documental con Function URL:

- [handler.py](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/handler.py)
- [requirements.txt](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/requirements.txt)
- [README.md](/Users/marialastra/Documents/DANAConnect_Onboarding/lambda/document_validation/README.md)

Arquitectura final usada en la demo:

- El frontend en Amplify convierte el archivo a base64 y hace `POST` al Function URL.
- La Lambda valida el archivo directamente con Amazon Bedrock usando `converse`.
- Para PDFs usa `document`; para imágenes usa `image`.
- La respuesta vuelve ya mapeada a estados compatibles con la UI (`valid`, `warning`, `error`).
- El modelo actualmente utilizado para la demo es `us.anthropic.claude-3-7-sonnet-20250219-v1:0`.

Variable de entorno recomendada en Amplify:

```bash
VITE_DOCUMENT_VALIDATION_URL=https://uou6hka7wmyfgtirokika5bkme0wfwzj.lambda-url.us-east-1.on.aws/
```
