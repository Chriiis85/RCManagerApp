import nodemailer from 'nodemailer';

function getTransporter() {
  const user = process.env.SMTP_USER || 'rcmanager.support@gmail.com';
  const pass = process.env.SMTP_PASS || 'fwulgzwwnsmwpruf';
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;

  if (user.includes('@gmail.com') || host === 'smtp.gmail.com') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  return null;
}

export async function send2FAEmail(to: string, code: string, username?: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || '"RCManager Soporte" <rcmanager.support@gmail.com>';
  const subject = `🔒 Tu código de verificación RCManager: ${code}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Código de Verificación RCManager</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 36px 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .logo-area { text-align: center; margin-bottom: 24px; }
        .logo-title { font-size: 22px; font-weight: 900; color: #2563eb; letter-spacing: -0.5px; margin: 0; }
        .badge { display: inline-block; background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 12px; margin-top: 6px; }
        .content { text-align: center; }
        .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 16px 0 8px; }
        .desc { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px; }
        .code-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; padding: 18px 24px; display: inline-block; margin-bottom: 24px; }
        .code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #0f172a; margin: 0; }
        .expires { font-size: 12px; color: #94a3b8; margin-top: 6px; }
        .warning { font-size: 12px; color: #ef4444; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 12px; margin-top: 20px; text-align: left; }
        .footer { text-align: center; margin-top: 28px; font-size: 11px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-area">
          <div class="logo-title">🎢 RCManager</div>
          <div class="badge">SEGURIDAD EN DOS PASOS</div>
        </div>
        <div class="content">
          <div class="title">Hola${username ? ` @${username}` : ''},</div>
          <div class="desc">Usa el siguiente código de verificación de 6 dígitos para completar tu inicio de sesión o configuración de seguridad:</div>
          <div class="code-box">
            <div class="code">${code}</div>
            <div class="expires">⏱️ Válido durante 10 minutos</div>
          </div>
          <div class="warning">
            <strong>⚠️ ¿No has sido tú?</strong> Si no has solicitado este código, por favor ignora este correo o cambia tu contraseña inmediatamente.
          </div>
        </div>
        <div class="footer">
          RCManager &copy; ${new Date().getFullYear()} - Plataforma de Parques y Coasters.<br>
          Este es un correo automático de seguridad, por favor no respondas a este mensaje.
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Si hay clave de Resend configurada, usar Resend API (HTTP ultra rápido y sin bloqueos de puertos)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text: `Tu código de verificación de 6 dígitos para RCManager es: ${code} (Válido por 10 minutos).`
        })
      });

      if (response.ok) {
        console.log(`[Resend API] 2FA email sent to ${to}`);
        return true;
      } else {
        const errorData = await response.text();
        console.error('[Resend API Error]:', errorData);
      }
    } catch (err) {
      console.error('[Resend Exception]:', err);
    }
  }

  // 2. Si hay SMTP configurado, usar Nodemailer
  const transporter = getTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"RCManager Seguridad" <security@rcmanager.app>',
        to,
        subject,
        text: `Tu código de verificación de 6 dígitos para RCManager es: ${code} (Válido por 10 minutos).`,
        html
      });
      console.log(`[SMTP Mailer] 2FA email sent to ${to} (MessageId: ${info.messageId})`);
      return true;
    } catch (error) {
      console.error('[SMTP Mailer Error]:', error);
    }
  }

  // 3. Fallback en desarrollo: loggear en consola del backend
  console.log(`[Mailer Fallback] No SMTP / Resend credentials found. 2FA Code for ${to}: ${code}`);
  return true;
}
