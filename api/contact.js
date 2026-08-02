import nodemailer from 'nodemailer';

function esc(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_ORIGINS = new Set([
  'https://hfdeco.ch',
  'https://www.hfdeco.ch',
  'https://hf-deco.vercel.app',
]);

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!token) return { ok: false, reason: 'turnstile-token-missing' };

  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  if (ip) params.append('remoteip', ip);

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await r.json();
    return { ok: !!data.success, reason: data.success ? 'ok' : (data['error-codes'] || []).join(',') };
  } catch (e) {
    return { ok: false, reason: 'turnstile-network-error' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Origin allowlist (production only — laisse passer en dev/preview)
  const origin = req.headers.origin || req.headers.referer || '';
  const originBase = origin.replace(/(https?:\/\/[^/]+).*/, '$1');
  if (process.env.NODE_ENV === 'production' && originBase && !ALLOWED_ORIGINS.has(originBase)) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }

  try {
    const body = req.body || {};
    const {
      Nom,
      Email,
      Téléphone,
      Projet,
      Prestation,
      Message,
      _gotcha,
    } = body;

    // Honeypot — silencieux pour les bots
    if (_gotcha) return res.status(200).json({ ok: true });

    // Turnstile optionnel : vérifié seulement si une clé secrète est configurée
    if (process.env.TURNSTILE_SECRET_KEY) {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
      const turnstile = await verifyTurnstile(body['cf-turnstile-response'], ip);
      if (!turnstile.ok) {
        return res.status(403).json({ ok: false, error: 'Captcha invalide, veuillez réessayer' });
      }
    }

    if (!Nom || !Email || !Prestation) {
      return res.status(400).json({ ok: false, error: 'Champs requis manquants' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(Email))) {
      return res.status(400).json({ ok: false, error: 'Email invalide' });
    }

    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const html = `
      <h2>Nouvelle demande de devis — HF Déco</h2>
      <p><b>Nom:</b> ${esc(Nom)}</p>
      <p><b>Email:</b> ${esc(Email)}</p>
      <p><b>Téléphone:</b> ${esc(Téléphone || '')}</p>
      <p><b>Projet:</b> ${esc(Projet || '')}</p>
      <p><b>Prestation:</b> ${esc(Prestation)}</p>
      <p><b>Message:</b><br>${esc(Message || '').replace(/\n/g, '<br>')}</p>
    `;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || smtpUser || 'info@hfdeco.ch',
      to: process.env.MAIL_TO || 'info@hfdeco.ch',
      replyTo: Email,
      subject: 'Nouvelle demande de devis — hfdeco.ch',
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Erreur envoi email' });
  }
}
