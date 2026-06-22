import nodemailer from "nodemailer";
import { env } from "../config/env";

function canSendEmail(): boolean {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  message: string;
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
    text: params.message
  });

  return true;
}
