import nodemailer from "nodemailer";
import path from "path";
import { getPlanName as getConfiguredPlanName } from "./plans.js";

let transporter;

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return transporter;
}

function formatDate(dateValue) {
  if (!dateValue) return "No disponible";

  return new Date(dateValue).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function getPlanName(plan) {
  return getConfiguredPlanName(plan);
}

function getEmailSignatureText() {
  return "Inteligencia Artificial para penalistas";
}

function getEmailSignatureHtml() {
  return `
    <div style="margin-top:32px;padding-top:22px;">
      <div style="display:inline-block;background:#090909;border:1px solid #2b2b2b;border-radius:14px;padding:16px 20px;">
        <img src="cid:litigarg-logo" alt="LitigARG" width="210" style="display:block;width:210px;max-width:100%;height:auto;margin:0 auto 8px;">
        <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;color:#f5c542;text-align:center;font-weight:700;">
          Inteligencia Artificial para penalistas
        </div>
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();

  if (!mailer) {
    console.warn("Correo no enviado: faltan variables SMTP.");
    return false;
  }

  const info = await mailer.sendMail({
    from: process.env.SMTP_FROM || `"LitigARG" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    attachments: html ? [
      {
        filename: "logoblanco.png",
        path: path.join(process.cwd(), "frontend", "logoblanco.png"),
        cid: "litigarg-logo"
      }
    ] : undefined
  });

  console.log(`CORREO ENVIADO: ${subject} -> ${to} (${info.messageId || "sin messageId"})`);
  return true;
}

export async function sendAccountCreatedEmail(user) {
  return sendEmail({
    to: user.email,
    subject: "Tu cuenta en LitigARG fue creada",
    text: `Hola ${user.username || ""},\n\nTu cuenta en LitigARG fue creada correctamente.\n\nCorreo: ${user.email}\n\nYa puedes ingresar y usar tu asistente de litigación penal.\n\n${getEmailSignatureText()}`,
    html: `
      <p>Hola ${user.username || ""},</p>
      <p>Tu cuenta en <strong>LitigARG</strong> fue creada correctamente.</p>
      <p><strong>Correo:</strong> ${user.email}</p>
      <p>Ya puedes ingresar y usar tu asistente de litigación penal.</p>
      ${getEmailSignatureHtml()}
    `
  });
}

export async function sendPasswordChangedEmail(user) {
  return sendEmail({
    to: user.email,
    subject: "Tu contraseña de LitigARG fue cambiada",
    text: `Hola ${user.username || ""},\n\nTe confirmamos que la contraseña de tu cuenta LitigARG fue cambiada correctamente.\n\nSi no realizaste este cambio, revisa tu cuenta de inmediato.\n\n${getEmailSignatureText()}`,
    html: `
      <p>Hola ${user.username || ""},</p>
      <p>Te confirmamos que la contraseña de tu cuenta <strong>LitigARG</strong> fue cambiada correctamente.</p>
      <p>Si no realizaste este cambio, revisa tu cuenta de inmediato.</p>
      ${getEmailSignatureHtml()}
    `
  });
}

export async function sendPasswordResetEmail(user, resetUrl) {
  return sendEmail({
    to: user.email,
    subject: "Recupera tu contraseña de LitigARG",
    text: `Hola ${user.username || ""},\n\nRecibimos una solicitud para recuperar la contraseña de tu cuenta LitigARG.\n\nUsa este enlace durante la próxima hora:\n${resetUrl}\n\nSi no solicitaste este cambio, puedes ignorar este correo.\n\n${getEmailSignatureText()}`,
    html: `
      <p>Hola ${user.username || ""},</p>
      <p>Recibimos una solicitud para recuperar la contraseña de tu cuenta <strong>LitigARG</strong>.</p>
      <p>Usa este enlace durante la próxima hora:</p>
      <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">Restablecer contraseña</a></p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      ${getEmailSignatureHtml()}
    `
  });
}

export async function sendPremiumPurchasedEmail(user, subscription) {
  const planName = getPlanName(subscription.plan);
  const purchasedAt = formatDate(subscription.created_at);
  const expiresAt = formatDate(subscription.expiresAt);

  return sendEmail({
    to: user.email,
    subject: `Tu plan ${planName} de LitigARG está activo`,
    text: `Hola ${user.username || ""},\n\nTu experiencia ${planName} de LitigARG fue activada correctamente.\n\nFecha de compra: ${purchasedAt}\nSuscripción activa hasta: ${expiresAt}\n\nGracias por confiar en LitigARG.\n\n${getEmailSignatureText()}`,
    html: `
      <p>Hola ${user.username || ""},</p>
      <p>Tu experiencia <strong>${planName}</strong> de <strong>LitigARG</strong> fue activada correctamente.</p>
      <p><strong>Fecha de compra:</strong> ${purchasedAt}</p>
      <p><strong>Suscripción activa hasta:</strong> ${expiresAt}</p>
      <p>Gracias por confiar en LitigARG.</p>
      ${getEmailSignatureHtml()}
    `
  });
}
