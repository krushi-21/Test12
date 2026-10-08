import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

export function createEmailSender(config) {
  if (config.smtpHost) {
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined
    });
    return async message => transport.sendMail({ from: config.smtpFrom, ...message, disableFileAccess: true, disableUrlAccess: true });
  }
  return async message => {
    await fs.mkdir(config.mailDir, { recursive: true, mode: 0o700 });
    await fs.chmod(config.mailDir, 0o700);
    const file = path.join(config.mailDir, `${Date.now()}-${randomUUID()}.json`);
    await fs.writeFile(file, JSON.stringify({ ...message, previewOnly: true }, null, 2), { mode: 0o600, flag: 'wx' });
    return { previewOnly: true };
  };
}

export function authLink(config, purpose, token) {
  const page = purpose === 'verify' ? 'verify-email' : 'reset-password';
  const url = new URL(`/${page}`, config.webOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendAuthLink(sendEmail, config, email, purpose, token) {
  const link = authLink(config, purpose, token);
  const isVerification = purpose === 'verify';
  const subject = isVerification ? 'Verify your Launch Platform email' : 'Reset your Launch Platform password';
  const action = isVerification ? 'verify your email' : 'choose a new password';
  const message = `Use this one-time link to ${action}: ${link}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`;
  await sendEmail({ to: email, subject, text: message, html: `<p>${action[0].toUpperCase()}${action.slice(1)} by opening this one-time link:</p><p><a href="${link}">Continue</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>` });
}
