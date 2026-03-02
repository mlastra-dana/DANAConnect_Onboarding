import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8787);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/send-email', async (req, res) => {
  try {
    const smtpHost = requiredEnv('DANA_SMTP_HOST');
    const smtpPort = Number(process.env.DANA_SMTP_PORT || 587);
    const smtpSecure = String(process.env.DANA_SMTP_SECURE || 'false') === 'true';
    const smtpUser = requiredEnv('DANA_SMTP_USER');
    const smtpPass = requiredEnv('DANA_SMTP_PASS');
    const idCompany = requiredEnv('DANA_ID_COMPANY');
    const idConversation = requiredEnv('DANA_ID_CONVERSATION');

    const { subject, body } = req.body ?? {};

    if (!subject || !body) {
      res.status(400).json({ ok: false, error: 'subject y body son requeridos' });
      return;
    }

    const to = `${idConversation}@${idCompany}.email-platform.com`;
    const from = process.env.DANA_FROM || smtpUser;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: body
    });

    res.json({ ok: true, messageId: info.messageId, to });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al enviar correo';
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[mail-api] running on http://localhost:${PORT}`);
});
