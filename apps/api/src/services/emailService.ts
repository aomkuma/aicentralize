import nodemailer from "nodemailer";
import { env } from "../config/env";

function canSendEmail(): boolean {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!canSendEmail()) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  });

  await transporter.sendMail({
    from: env.mailFrom,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html
  });

  console.info(`[email] sent subject="${params.subject}" to="${params.to}"`);
  return true;
}

export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: params.subject,
    text: params.message
  });
}

export async function sendInvitationEmail(params: {
  to: string;
  inviteeName: string;
  inviterName?: string;
  tenantName: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<boolean> {
  const subject = `You're invited to ${params.tenantName} on AICentralize`;
  const text = [
    `Hi ${params.inviteeName},`,
    "",
    `${params.inviterName || "An administrator"} invited you to join ${params.tenantName} on AICentralize.`,
    "Open this link to set your password and activate your account:",
    params.inviteUrl,
    "",
    `This invitation expires at ${params.expiresAt.toISOString()}.`,
    "",
    "If you did not expect this invitation, you can ignore this email."
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">You're invited to ${params.tenantName}</h2>
      <p>Hi ${params.inviteeName},</p>
      <p>${params.inviterName || "An administrator"} invited you to join <strong>${params.tenantName}</strong> on AICentralize.</p>
      <p>
        <a href="${params.inviteUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:10px 14px;border-radius:6px;font-weight:700">
          Accept invitation
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">This invitation expires at ${params.expiresAt.toISOString()}.</p>
      <p style="font-size:12px;color:#64748b">If the button does not work, copy this link:<br />${params.inviteUrl}</p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    subject,
    text,
    html
  });
}
