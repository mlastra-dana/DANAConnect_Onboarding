import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_SMTP_HOST = 'cloudsmtp.danaconnect.com';
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_FIELD_LIMITS = {
  ACTA_CONSTITUTIVA: 50,
  CEDULA_IDENTIDAD: 10,
  EMAIL: 100,
  NOMBRE_CLIENTE: 100,
  NOMBRE_EMPRESA: 100,
  PAIS: 50,
  REPRESENTANTE_LEGAL: 100,
  RIF: 10,
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

    const { subject, body, data } = req.body ?? {};

    if (!subject) {
      res.status(400).json({ ok: false, error: 'subject es requerido' });
      return;
    }

    const emailBody = buildEmailBody({ body, data, sendMode: config.sendMode });

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

    res.json({ ok: true, messageId: info.messageId, to: config.to, mode: config.sendMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al enviar correo';
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[mail-api] running on http://localhost:${PORT}`);
});
