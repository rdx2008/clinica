import nodemailer from "nodemailer";

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

// Envio por SMTP (qualquer provedor: Brevo, Resend SMTP, Amazon SES, Gmail com senha de app...).
// Variáveis: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE ("true" para porta 465).
export async function sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured()) return { ok: false, error: "E-mail não configurado no servidor." };
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({ from: process.env.SMTP_FROM, to: params.to, subject: params.subject, text: params.text, html: params.html });
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível enviar o e-mail." };
  }
}
