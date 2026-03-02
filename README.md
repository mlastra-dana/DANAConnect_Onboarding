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
- Flujo simplificado sin Excel: `Bienvenida -> Documentos -> Revisión -> Final`.
- Navbar limpia con logo, enlaces clave y botón `Salir` visible durante todo el onboarding.
- Reset global al usar `Inicio`, `Salir` o `Volver al inicio` (archivos, previews, validaciones y envío).
- Uploads unificados con `FileUploadCard`, drag & drop y selector de archivo confiable.
- Botón `X` en todos los adjuntos para limpiar archivo + preview + estado de validación.
- Soporte de segundo representante opcional en layout responsivo de 2 columnas en desktop.
- Validación documental liviana sin OCR pesado: heurísticas por texto PDF + fallback demo para escaneados/imágenes.
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
