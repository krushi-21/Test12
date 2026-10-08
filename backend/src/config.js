import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeOrigin(value, name, production) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTP(S) origin.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without credentials, path, query, or fragment.`);
  }
  if (production && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production.`);
  return url.origin;
}

export function loadConfig(overrides = {}) {
  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const databasePath = overrides.databasePath ?? process.env.DATABASE_PATH ?? path.join(backendRoot, 'data', 'launch-platform.sqlite');
  const previewReadOnly = overrides.previewReadOnly ?? true;
  if (typeof previewReadOnly !== 'boolean') throw new Error('previewReadOnly must be a boolean.');
  if (!previewReadOnly && (nodeEnv !== 'test' || databasePath !== ':memory:')) {
    throw new Error('Preview read-only mode can only be disabled for isolated API tests with NODE_ENV=test and DATABASE_PATH=:memory:.');
  }
  const sessionSecret = overrides.sessionSecret ?? process.env.SESSION_SECRET ?? 'dev-only-change-this-session-secret-32-bytes';
  const analyticsSalt = overrides.analyticsSalt ?? process.env.ANALYTICS_SALT ?? sessionSecret;
  const smtpHost = overrides.smtpHost ?? process.env.SMTP_HOST ?? '';
  const port = Number(overrides.port ?? process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (nodeEnv === 'production' && (sessionSecret.length < 32 || analyticsSalt.length < 32)) {
    throw new Error('SESSION_SECRET and ANALYTICS_SALT must each contain at least 32 characters in production.');
  }
  if (nodeEnv === 'production' && sessionSecret === analyticsSalt) throw new Error('SESSION_SECRET and ANALYTICS_SALT must be different in production.');
  if (nodeEnv === 'production' && !smtpHost) {
    throw new Error('SMTP_HOST is required in production so account verification and reset emails can be delivered.');
  }
  const webOrigin = normalizeOrigin(overrides.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173', 'WEB_ORIGIN', nodeEnv === 'production');
  const apiOrigin = normalizeOrigin(overrides.apiOrigin ?? process.env.API_ORIGIN ?? `http://localhost:${port}`, 'API_ORIGIN', nodeEnv === 'production');
  return {
    nodeEnv, backendRoot, port,
    webOrigin, apiOrigin,
    databasePath,
    uploadDir: overrides.uploadDir ?? process.env.UPLOAD_DIR ?? path.join(backendRoot, 'storage', 'uploads'),
    mailDir: overrides.mailDir ?? process.env.MAIL_DIR ?? path.join(backendRoot, '.local-mail'),
    sessionSecret, analyticsSalt,
    cookieName: overrides.cookieName ?? process.env.COOKIE_NAME ?? 'launch_session',
    cookieSecure: overrides.cookieSecure ?? nodeEnv === 'production',
    sessionDays: 14, emailVerifyMinutes: 30, passwordResetMinutes: 30,
    smtpHost,
    smtpPort: Number(overrides.smtpPort ?? process.env.SMTP_PORT ?? 587),
    smtpSecure: String(overrides.smtpSecure ?? process.env.SMTP_SECURE ?? 'false') === 'true',
    smtpUser: overrides.smtpUser ?? process.env.SMTP_USER ?? '',
    smtpPass: overrides.smtpPass ?? process.env.SMTP_PASS ?? '',
    smtpFrom: overrides.smtpFrom ?? process.env.SMTP_FROM ?? 'Launch Platform <no-reply@localhost>',
    trustProxy: overrides.trustProxy ?? process.env.TRUST_PROXY ?? '0',
    maxUploadPixels: 40_000_000, maxUploadDimension: 8_000,
    suspiciousClickThreshold: 20, suspiciousClickWindowMinutes: 10,
    ...overrides,
    nodeEnv, databasePath, previewReadOnly
  };
}
