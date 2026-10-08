import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { hashToken } from './lib/security.js';
import { ApiError } from './lib/errors.js';

export const passwordHashOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
export const hashPassword = password => argon2.hash(password, passwordHashOptions);
export const verifyPassword = (hash, password) => argon2.verify(hash, password);

export function createAuthMiddleware(db, config) {
  function optionalAuth(req, _res, next) {
    try {
      const raw = req.cookies?.[config.cookieName];
      if (raw) {
        const session = db.prepare(`SELECT u.id, u.display_name, u.email, u.email_verified_at, u.role
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(hashToken(raw), new Date().toISOString());
        if (session) req.user = { id: session.id, displayName: session.display_name, email: session.email, emailVerified: Boolean(session.email_verified_at), role: session.role };
      }
      next();
    } catch (error) { next(error); }
  }
  function requireAuth(req, _res, next) {
    if (!req.user) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    next();
  }
  function requireVerified(req, _res, next) {
    if (!req.user) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    if (!req.user.emailVerified) return next(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before liking, saving, or publishing.'));
    next();
  }
  function requireModerator(req, _res, next) {
    if (!req.user) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    if (!req.user.emailVerified || req.user.role !== 'moderator') return next(new ApiError(403, 'FORBIDDEN', 'Moderator access is required.'));
    next();
  }
  return { optionalAuth, requireAuth, requireVerified, requireModerator };
}

export function createSession(db, config, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionDays * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now.toISOString(), expiresAt);
  res.cookie(config.cookieName, token, {
    httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/',
    maxAge: config.sessionDays * 86_400_000
  });
}

export function revokeCurrentSession(db, config, req, res) {
  const raw = req.cookies?.[config.cookieName];
  if (raw) db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(new Date().toISOString(), hashToken(raw));
  res.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
}
