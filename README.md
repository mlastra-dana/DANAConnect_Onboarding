# Perfilab Onboarding (React + Tailwind + Vite)

Validador autogestionado tipo "portero inteligente" para onboarding empresarial.

## Stack

- React 18 + TypeScript + Vite
- TailwindCSS
- React Router (`BrowserRouter`)
- `xlsx` (lectura de Excel)
- `pdfjs-dist` (preview y extracción básica de texto en PDF)
- `tesseract.js` (OCR cliente)
- `zod` (validaciones)
- `lucide-react` (iconos)

## Ejecutar local

1. Instalar dependencias:

```bash
npm install
```

2. Levantar entorno dev:

```bash
npm run dev
```

Esto levanta:

- Frontend Vite
- API local de correo en `http://localhost:8787`

Antes de ejecutar, cree `.env` basado en `.env.example` para configurar Cloud SMTP.

3. Abrir:

- `http://localhost:5173/onboarding/demo-001`
- También soporta `http://localhost:5173/onboarding?companyId=demo-001`

## Flujo funcional

1. Bienvenida (resolución por tenant registry)
2. Documentos (RIF, Registro Mercantil, Cédula)
3. Excel (.xlsx)
4. Revisión y envío

Gating:

- No se avanza a Excel sin 3 documentos válidos
- No se avanza a revisión sin Excel 100% válido
- No se puede enviar si no está todo verde

## Tenants / Personalización

Editar [`src/data/tenants.ts`](/Users/marialastra/Documents/Perfilab_Onboarding/src/data/tenants.ts).

Cada tenant define:

- `name`
- `brandColor`
- `slaHours` (horas en pantalla de éxito)
- `whatsAppNumber`

## Reglas de validación

### Documentos

Archivo: [`src/lib/validators/documentValidators.ts`](/Users/marialastra/Documents/Perfilab_Onboarding/src/lib/validators/documentValidators.ts)

- Tipos permitidos: PDF/JPG/PNG/WEBP
- Tamaño máximo: 10MB
- Calidad imagen: lado mayor >= 1200px
- PDF: detección páginas + resolución canvas primera página
- Cédula:
  - Keywords OCR configurables
  - Regex de identificación
  - Fecha de vencimiento (si se detecta)
  - Si no parece identificación, no permite continuar

### Excel

Archivo: [`src/lib/validators/excelValidators.ts`](/Users/marialastra/Documents/Perfilab_Onboarding/src/lib/validators/excelValidators.ts)

- `cedula`: regex `^(V|E|J)-?\d{5,10}$`
- Cédula sin puntos/comas/letras extra
- `nombre`: máximo 40 caracteres
- `email`: formato válido si existe
- `telefono`: solo dígitos y mínimo 7 caracteres
- Requeridos: `cedula`, `nombre`

## Persistencia

- Estado por empresa en `localStorage`
- Clave base: `onboarding_portal_state:{companyId}`
- Envíos simulados: `onboarding_submission:{companyId}:{registrationId}`

## AWS Amplify

- `amplify.yml` incluido con:
  - install: `npm ci`
  - build: `npm run build`
  - artifacts: `dist`
  - cache: `node_modules`

Archivo de apoyo:

- [`amplify-redirects.md`](/Users/marialastra/Documents/Perfilab_Onboarding/amplify-redirects.md)

Asegura regla de rewrite SPA a `/index.html` (`200`).

## Supuestos / Limitaciones OCR (cliente)

- OCR depende de calidad, iluminación, inclinación y compresión.
- PDF escaneado puede requerir re-subida más nítida.
- En móvil de baja gama OCR puede ser más lento.
- Demo sin backend: procesamiento y almacenamiento local.

## Seguridad front básica

- No se loggea PII en consola.
- Tipos/tamaño de archivo restringidos.
- Preview con Object URLs y canvas, sin ejecutar contenido.
- Aviso explícito: procesamiento en navegador (demo).

## Prueba rápida de normalización de cédula

Archivo: [`src/lib/validators/venezuelanId.ts`](/Users/marialastra/Documents/Perfilab_Onboarding/src/lib/validators/venezuelanId.ts)

Casos esperados:

- `"V 24.514.137"` => `V24514137`
- `"V24.514.137"` => `V24514137`
- `"V-24.514.137"` => `V24514137`
- `"V-24514137"` => `V24514137`
- `"V24514137"` => `V24514137`
- `"E 12.345.678"` => `E12345678`
