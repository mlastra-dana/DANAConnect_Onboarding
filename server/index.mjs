import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const REQUIRED_SEND_ENV = [
  'DANA_ID_COMPANY',
  'DANA_ID_CONVERSATION',
  'DANA_SMTP_LOGIN',
  'DANA_SMTP_PASS',
  'DANA_FROM'
];

function loadLocalEnv() {
  const envFiles = ['.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(envPath)) continue;

    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    });

    return envFile;
  }

  return undefined;
}

const loadedEnvFile = loadLocalEnv();

const app = express();
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '30mb' }));

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_SMTP_HOST = 'cloudsmtp.danaconnect.com';
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_FILE_UPLOAD_URL = 'https://appserv.danaconnect.com/dana/conversation/http/rest/file/upload';
const DEFAULT_FILE_FIELD_MAP = {
  rif: 'DOCUMENTO_FISCAL',
  documentoFiscal: 'DOCUMENTO_FISCAL',
  registroMercantil: 'DOCUMENTO_CONSTITUCION',
  documentoConstitucion: 'DOCUMENTO_CONSTITUCION',
  actaDesignacionAutoridades: 'FACULTADES_REPRESENTANTE',
  facultadesRepresentante: 'FACULTADES_REPRESENTANTE',
  cedulaRepresentante: 'DOCUMENTO_REPRESENTANTE',
  documentoRepresentante: 'DOCUMENTO_REPRESENTANTE',
  documentoIdentidad: 'DOCUMENTO_IDENTIDAD',
  licenciaConducirFrente: 'LICENCIA_FRONT',
  licenciaConducirReverso: 'LICENCIA_BACK'
};
const DEFAULT_FIELD_LIMITS = {
  APELLIDOS: 100,
  DOCUMENTO_CONSTITUCION: 250,
  DOCUMENTO_FISCAL: 250,
  DOCUMENTO_IDENTIDAD: 250,
  DOCUMENTO_REPRESENTANTE: 255,
  EMAIL: 100,
  FACULTADES_REPRESENTANTE: 250,
  LICENCIA_BACK: 250,
  LICENCIA_FRONT: 250,
  NOMBRES: 100,
  NOMBRE_CLIENTE: 100,
  NOMBRE_EMPRESA: 100,
  NUMERO_IDENTIFICACION: 100,
  PAIS: 50,
  REPRESENTANTE_LEGAL: 250,
  TIPO_PERSONA: 100
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function resolveSmtpUser(idCompany) {
  const explicitUser = optionalEnv('DANA_SMTP_USER');
  if (explicitUser) return explicitUser;

  const login = requiredEnv('DANA_SMTP_LOGIN');
  return `${login}@${idCompany}`;
}

function resolveRecipient(idCompany) {
  const explicitTo = optionalEnv('DANA_SMTP_TO');
  if (explicitTo) return explicitTo;

  const idConversation = requiredEnv('DANA_ID_CONVERSATION');
  return `${idConversation}@${idCompany}.email-platform.com`;
}

function resolveFieldMap() {
  const raw = optionalEnv('DANA_FIELD_MAP');
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('DANA_FIELD_MAP debe ser un objeto JSON');
    }
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'JSON invalido';
    throw new Error(`DANA_FIELD_MAP invalido: ${detail}`);
  }
}

function parseJsonObjectEnv(name) {
  const raw = optionalEnv(name);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${name} debe ser un objeto JSON`);
    }
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'JSON invalido';
    throw new Error(`${name} invalido: ${detail}`);
  }
}

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '');
}

function normalizeFieldValue(name, value) {
  const text = String(value ?? '').trim();
  const limit = DEFAULT_FIELD_LIMITS[name];
  if (!limit) return text;
  return text.slice(0, limit);
}

function buildStartConversationWithData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('data es requerido para activar conversaciones por SMTP');
  }

  const fieldMap = resolveFieldMap();
  const staticData = parseJsonObjectEnv('DANA_STATIC_DATA');
  const mergedData = { ...staticData, ...data };
  const params = new URLSearchParams();
  params.set('command', 'StartConversationWithData');

  Object.entries(mergedData).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const mappedName = normalizeFieldName(fieldMap[key] || key);
    if (!mappedName) return;
    params.set(mappedName, normalizeFieldValue(mappedName, value));
  });

  if ([...params.keys()].length <= 1) {
    throw new Error('data no contiene campos para enviar a DANAConnect');
  }

  return params.toString();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function getMailConfig({ requirePassword = true } = {}) {
  const idCompany = requiredEnv('DANA_ID_COMPANY');
  return {
    idCompany,
    smtpHost: process.env.DANA_SMTP_HOST || DEFAULT_SMTP_HOST,
    smtpPort: Number(process.env.DANA_SMTP_PORT || DEFAULT_SMTP_PORT),
    smtpSecure: String(process.env.DANA_SMTP_SECURE || 'false') === 'true',
    smtpRequireTls: String(process.env.DANA_SMTP_REQUIRE_TLS || 'true') !== 'false',
    smtpUser: resolveSmtpUser(idCompany),
    smtpPass: requirePassword ? requiredEnv('DANA_SMTP_PASS') : optionalEnv('DANA_SMTP_PASS'),
    to: resolveRecipient(idCompany),
    from: requiredEnv('DANA_FROM'),
    cc: optionalEnv('DANA_CC'),
    bcc: optionalEnv('DANA_BCC'),
    sendMode: String(process.env.DANA_SMTP_MODE || 'conversation').toLowerCase()
  };
}

function buildEmailBody({ body, data, sendMode }) {
  return sendMode === 'plain' ? String(body || '') : buildStartConversationWithData(data);
}

function resolveFileField(documentType, requestedField) {
  const envMap = parseJsonObjectEnv('DANA_FILE_FIELD_MAP');
  return normalizeFieldName(envMap[documentType] || requestedField || DEFAULT_FILE_FIELD_MAP[documentType]);
}

function resolveFileUploadUser(idCompany) {
  return optionalEnv('DANA_FILE_UPLOAD_USER') || resolveSmtpUser(idCompany);
}

function resolveFileUploadPassword() {
  return optionalEnv('DANA_FILE_UPLOAD_PASS') || requiredEnv('DANA_SMTP_PASS');
}

async function uploadFileToDanaConnect(fileItem, { idCompany }) {
  const fileName = String(fileItem.fileName || fileItem.file_name || '').trim();
  const contentType = String(fileItem.contentType || fileItem.content_type || 'application/octet-stream').trim();
  const fileBase64 = String(fileItem.fileBase64 || fileItem.file_base64 || '').trim();

  if (!fileName) throw new Error('Cada archivo debe incluir fileName');
  if (!fileBase64) throw new Error(`El archivo ${fileName} no incluye fileBase64`);

  const bytes = Buffer.from(fileBase64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), fileName);

  const username = resolveFileUploadUser(idCompany);
  const password = resolveFileUploadPassword();
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const uploadUrl = optionalEnv('DANA_FILE_UPLOAD_URL') || DEFAULT_FILE_UPLOAD_URL;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'X-DEBUG': '1'
    },
    body: form
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`File Upload API devolvio una respuesta no JSON para ${fileName}`);
  }

  if (!response.ok) {
    throw new Error(parsed.error || parsed.message || `File Upload API rechazo ${fileName}`);
  }

  const fileID = String(parsed.fileID || '').trim();
  if (!fileID) throw new Error(`File Upload API no devolvio fileID para ${fileName}`);

  return {
    fileID,
    fileName: parsed.fileName || fileName,
    idCompany: parsed.idCompany || idCompany,
    requestID: parsed.requestID
  };
}

async function uploadFilesAndMergeData({ data, files }, { idCompany }) {
  const mergedData = { ...(data || {}) };
  const uploadedFiles = [];

  if (!Array.isArray(files) || files.length === 0) {
    return { data: mergedData, uploadedFiles };
  }

  for (const fileItem of files) {
    if (!fileItem || typeof fileItem !== 'object') continue;
    const documentType = String(fileItem.documentType || fileItem.document_type || '').trim();
    const requestedField = String(fileItem.field || '').trim();
    const field = resolveFileField(documentType, requestedField);
    if (!field) continue;

    const uploaded = await uploadFileToDanaConnect(fileItem, { idCompany });
    mergedData[field] = uploaded.fileID;
    uploadedFiles.push({
      documentType,
      field,
      ...uploaded
    });
  }

  return { data: mergedData, uploadedFiles };
}

app.post('/api/send-email/preview', (req, res) => {
  try {
    const { subject, body, data } = req.body ?? {};
    const config = getMailConfig({ requirePassword: false });
    const emailBody = buildEmailBody({ body, data, sendMode: config.sendMode });

    res.json({
      ok: true,
      to: config.to,
      from: config.from,
      cc: config.cc,
      bcc: config.bcc,
      subject: subject || '',
      mode: config.sendMode,
      body: emailBody
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al preparar correo';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/send-email', async (req, res) => {
  try {
    const config = getMailConfig();

    const { subject, body, data, files } = req.body ?? {};

    if (!subject) {
      res.status(400).json({ ok: false, error: 'subject es requerido' });
      return;
    }

    const uploadResult = await uploadFilesAndMergeData({ data, files }, { idCompany: config.idCompany });
    const emailBody = buildEmailBody({ body, data: uploadResult.data, sendMode: config.sendMode });

    if (!emailBody.trim()) {
      res.status(400).json({ ok: false, error: 'body es requerido' });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      requireTLS: config.smtpRequireTls,
      connectionTimeout: Number(process.env.DANA_SMTP_TIMEOUT_MS || 10000),
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });

    const info = await transporter.sendMail({
      from: config.from,
      to: config.to,
      cc: config.cc,
      bcc: config.bcc,
      subject,
      text: emailBody
    });

    res.json({
      ok: true,
      messageId: info.messageId,
      to: config.to,
      mode: config.sendMode,
      uploadedFiles: uploadResult.uploadedFiles
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al enviar correo';
    res.status(500).json({ ok: false, error: message });
  }
});

app.use((error, _req, res, next) => {
  if (!error) {
    next();
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      ok: false,
      error: 'El envío incluye archivos muy grandes para el servidor local.'
    });
    return;
  }

  next(error);
});

app.listen(PORT, () => {
  console.log(`[mail-api] running on http://localhost:${PORT}`);
  console.log(`[mail-api] env file: ${loadedEnvFile || 'none'}`);
  const missingEnv = REQUIRED_SEND_ENV.filter((name) => !process.env[name]);
  if (missingEnv.length) {
    console.warn(`[mail-api] missing send env: ${missingEnv.join(', ')}`);
  }
});
