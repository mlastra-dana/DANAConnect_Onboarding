# Lambda Document Validation

Lambda en Python para validacion documental via Function URL.

## Flujo

1. Recibe un archivo en base64 por `POST`.
2. Si el archivo es PDF, convierte solo la primera pagina a PNG.
3. Extrae texto con Amazon Textract.
4. Clasifica el documento con Claude Sonnet 4 a traves de Amazon Bedrock.
5. Devuelve un JSON listo para integrar con el frontend.

## Variables de entorno

- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `MAX_FILE_BYTES` opcional, default `10485760`

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
  "status": "warning",
  "summary": "Documento aceptado con revision recomendada.",
  "warnings": [
    "La lectura del documento fue parcial. Puede requerir revision manual."
  ],
  "uiStatus": {
    "state": "ok",
    "title": "Aceptado con revision recomendada",
    "message": "Documento aceptado con revision recomendada."
  }
}
```

## Notas

- Para demo, esta version usa `Textract + Bedrock` dentro del Lambda y no depende de backend Node.
- Para PDFs, esta version procesa solo la primera pagina y la convierte a imagen antes de llamar a Textract.
- El `BEDROCK_MODEL_ID` debe apuntar al modelo Sonnet 4 disponible en tu cuenta/región.
- Si vas a usar Function URL desde el frontend, recuerda limitar CORS y proteger acceso antes de moverlo a productivo.
