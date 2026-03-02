# Redirect Rule para SPA en AWS Amplify

En **App settings > Rewrites and redirects**, agrega esta regla para React Router con `BrowserRouter`:

- Source address: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|webp|woff2?)$)([^.]+$)/>`
- Target address: `/index.html`
- Type: `200 (Rewrite)`

Alternativa simple:

- Source address: `/*`
- Target address: `/index.html`
- Type: `200 (Rewrite)`
