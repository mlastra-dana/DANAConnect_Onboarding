# Portal Perfilab – Onboarding Demo
## Sesión Técnica – Resumen Codex

---

## 🎯 Objetivo del Portal

Construir un portal de onboarding autogestionado que actúe como:
> "Portero inteligente" que valida documentos y datos antes de enviarlos al sistema central.

El portal es una demo desplegable en AWS Amplify.

---

## 🏗 Arquitectura (Demo Actual)

- Frontend: React + TypeScript
- Estilos: TailwindCSS
- Hosting: AWS Amplify
- Validaciones: Procesamiento en navegador (sin backend)
- Envío final: `mailto:` (modo demo sin backend)

---

## 🎨 Ajustes de UI Perfilab

### Cambios realizados:

- Nombre del portal actualizado a **Perfilab**
- Eliminado botón duplicado “No esperes más”
- Colores ajustados a branding Perfilab:
  - Naranja principal
  - Texto negro / gris oscuro
  - Eliminado verde en validaciones
- Diseño más alineado al sitio oficial Perfilab

---

## 📂 Carga de Documentos

Documentos requeridos:

1. RIF
2. Registro Mercantil
3. Cédula del Representante
4. Archivo Excel/CSV

### Funcionalidades implementadas:

- Validación de formato (PDF/JPG/PNG/WEBP)
- Vista previa PDF
- Validación básica de calidad
- Detección de documento tipo identificación
- Validación de estructura Excel
- Resaltado de errores por fila

---

## ❌ Mejora UX agregada

- Botón ❌ para eliminar archivo adjunto
- Reset automático de adjuntos al volver al inicio
- Limpieza total de estado al reiniciar flujo

---

## 📊 Validación Excel

- Lectura en navegador
- Regex para cédula
- Límite de caracteres en nombre
- Conteo de filas válidas e inválidas
- Tabla de previsualización

---

## 📧 Envío Final (Modo Demo)

Se decidió NO usar backend ni SMTP real.

Implementación:

- Generación de trackingId con `crypto.randomUUID()`
- Construcción de resumen
- Uso de `mailto:` hacia:

  mlastra@danaconnect.com

- Pantalla de éxito con:
  - Botón “Abrir correo”
  - Botón “Copiar correo”
  - Botón “Volver al inicio”

Limitación aceptada:
- No se adjuntan archivos automáticamente.

---

## 🔄 Flujo Final

1. Usuario entra por link con `companyId`
2. Carga documentos
3. Valida Excel
4. Todo verde
5. Presiona Enviar
6. Se abre cliente de correo
7. Reset disponible

---

## 🔮 Futuro (No implementado aún)

- Backend con Lambda
- S3 para almacenamiento
- SMTP DanaConnect en backend
- Indexación vía API
- Uso de External Trigger real

---

## 🧠 Decisión Estratégica

Para la demo:
- Todo ocurre en el navegador
- No hay backend
- No hay credenciales expuestas
- Flujo es demostrable y funcional

---

## Estado actual

✔ Funciona local
✔ Diseño alineado a Perfilab
✔ Envío demo configurado
✔ UX mejorada
✔ Reset completo funcional

---

Fin del resumen.
