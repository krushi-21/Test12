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
function isInside(candidate, parent) {
  const child = path.resolve(candidate);
  const root = path.resolve(parent);
  return child === root || child.startsWith(`${root}${path.sep}`);
}
function isPlaceholderSecret(value) {
  return /replace-with|change-me|your[-_ ]|dev-only|example-secret|placeholder/i.test(value);
}
function validateProductionStoragePaths(databasePath, uploadDir) {
  for (const [name, value] of [['DATABASE_PATH', databasePath], ['UPLOAD_DIR', uploadDir]]) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) {
      throw new Error(`${name} must be explicitly configured as an absolute path in production.`);
    }
    if (isInside(value, backendRoot)) {
      throw new Error(`${name} must be outside the application release directory in production.`);
    }
  }
  if (databasePath === ':memory:') throw new Error('DATABASE_PATH must use persistent storage in production.');
  const resolvedDatabase = path.resolve(databasePath);
  const resolvedUploads = path.resolve(uploadDir);
  if (resolvedDatabase === resolvedUploads || isInside(resolvedDatabase, resolvedUploads) || isInside(resolvedUploads, resolvedDatabase)) {
    throw new Error('DATABASE_PATH and UPLOAD_DIR must be separate, non-overlapping paths.');
  }
}
export function loadConfig(overrides = {}) {
  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const configuredDatabasePath = overrides.databasePath ?? process.env.DATABASE_PATH;
  const databasePath = configuredDatabasePath ?? path.join(backendRoot, 'data', 'launch-platform.sqlite');
  const configuredUploadDir = overrides.uploadDir ?? process.env.UPLOAD_DIR;
  const uploadDir = configuredUploadDir ?? path.join(backendRoot, 'storage', 'uploads');
  const productionFlag = overrides.productionWritesEnabled ?? process.env.ENABLE_PRODUCTION_WRITES;
  if (nodeEnv === 'production' && productionFlag !== undefined && !['true', 'false'].includes(String(productionFlag))) {
    throw new Error('ENABLE_PRODUCTION_WRITES must be exactly true or false in production.');
  }
  const productionWritesEnabled = nodeEnv === 'production' && String(productionFlag) === 'true';
  const previewReadOnly = overrides.previewReadOnly ?? (nodeEnv === 'production' ? !productionWritesEnabled : true);
  if (typeof previewReadOnly !== 'boolean') throw new Error('previewReadOnly must be a boolean.');
  if (!previewReadOnly && nodeEnv !== 'test' && !(nodeEnv === 'production' && productionWritesEnabled)) {
    throw new Error('Write mode is limited to isolated API tests with NODE_ENV=test and DATABASE_PATH=:memory:, or explicit production opt-in.');
  }
  if (!previewReadOnly && nodeEnv === 'test' && databasePath !== ':memory:') {
    throw new Error('Writable test mode is limited to isolated API tests with NODE_ENV=test and DATABASE_PATH=:memory:.');
  }
  if (nodeEnv === 'production') validateProductionStoragePaths(configuredDatabasePath, configuredUploadDir);
  const sessionSecret = overrides.sessionSecret ?? process.env.SESSION_SECRET ?? 'dev-only-change-this-session-secret-32-bytes';
  const analyticsSalt = overrides.analyticsSalt ?? process.env.ANALYTICS_SALT ?? sessionSecret;
  const smtpHost = overrides.smtpHost ?? process.env.SMTP_HOST ?? '';
  const port = Number(overrides.port ?? process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (nodeEnv === 'production' && (sessionSecret.length < 32 || analyticsSalt.length < 32)) {
    throw new Error('SESSION_SECRET and ANALYTICS_SALT must each contain at least 32 characters in production.');
  }
  if (nodeEnv === 'production' && (isPlaceholderSecret(sessionSecret) || isPlaceholderSecret(analyticsSalt))) {
    throw new Error('SESSION_SECRET and ANALYTICS_SALT must be non-default production secrets.');
  }
  if (nodeEnv === 'production' && sessionSecret === analyticsSalt) throw new Error('SESSION_SECRET and ANALYTICS_SALT must be different in production.');
  if (nodeEnv === 'production' && !smtpHost) {
    throw new Error('SMTP_HOST is required in production so account verification and reset emails can be delivered.');
  }
  const webOrigin = normalizeOrigin(overrides.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173', 'WEB_ORIGIN', nodeEnv === 'production');
  const apiOrigin = normalizeOrigin(overrides.apiOrigin ?? process.env.API_ORIGIN ?? `http://localhost:${port}`, 'API_ORIGIN', nodeEnv === 'production');
  return {
    nodeEnv, backendRoot, port,
    webOrigin, apiOrigin, databasePath, uploadDir,
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
    nodeEnv, databasePath, uploadDir, previewReadOnly, productionWritesEnabled
  };
}
