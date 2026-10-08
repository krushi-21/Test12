import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createSession, hashPassword, revokeCurrentSession, verifyPassword } from '../auth.js';
import { sendAuthLink } from '../lib/email.js';
import { hashToken, newToken } from '../lib/security.js';
import { ApiError, validationFields } from '../lib/errors.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { registerSchema, loginSchema, tokenSchema, resetPasswordSchema } from '../validation.js';
import { notify } from '../lib/notifications.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the highlighted fields.', validationFields(result.error));
  return result.data;
}
function isoNow() { return new Date().toISOString(); }
function tokenExpiry(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function userResponse(user) { return { id: user.id, displayName: user.display_name, email: user.email, emailVerified: Boolean(user.email_verified_at) }; }

function issueEmailToken(db, userId, purpose, expiryMinutes) {
  const token = newToken();
  const now = isoNow();
  db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  db.prepare('INSERT INTO email_tokens(token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), userId, purpose, now, tokenExpiry(expiryMinutes));
  return token;
}

export function createAuthRouter({ db, config, sendEmail, auth }) {
  const router = Router();
  const registerLimit = makeLimiter({ windowMs: 15 * 60_000, limit: 6 });
  const loginLimit = makeLimiter({ windowMs: 15 * 60_000, limit: 12, message: 'Too many sign-in attempts. Try again later.' });
  const emailLimit = makeLimiter({ windowMs: 60 * 60_000, limit: 4, message: 'Too many email requests. Try again later.' });
  const tokenLimit = makeLimiter({ windowMs: 60 * 60_000, limit: 20 });

  router.post('/register', registerLimit, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const email = input.email.toLowerCase();
    let user = db.prepare('SELECT id, email_verified_at FROM users WHERE email = ?').get(email);
    if (!user) {
      const now = isoNow();
      const id = randomUUID();
      const passwordHash = await hashPassword(input.password);
      db.prepare('INSERT INTO users(id, display_name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, input.displayName, email, passwordHash, now, now);
      user = { id, email_verified_at: null };
    }
    if (!user.email_verified_at) {
      const token = issueEmailToken(db, user.id, 'verify', config.emailVerifyMinutes);
      try { await sendAuthLink(sendEmail, config, email, 'verify', token); }
      catch { throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'We could not send the email right now. Try the verification resend option later.'); }
    }
    return res.status(202).json({ verificationRequired: true });
  });

  router.post('/verify-email', tokenLimit, (req, res) => {
    const { token } = parse(tokenSchema, req.body);
    const verify = db.transaction(() => {
      const now = isoNow();
      const row = db.prepare(`SELECT t.user_id, u.id, u.display_name, u.email, u.email_verified_at
        FROM email_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.purpose = 'verify' AND t.consumed_at IS NULL AND t.expires_at > ?`).get(hashToken(token), now);
      if (!row) throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or expired.');
      const consumed = db.prepare(`UPDATE email_tokens SET consumed_at = ? WHERE token_hash = ? AND purpose = 'verify'
        AND consumed_at IS NULL AND expires_at > ?`).run(now, hashToken(token), now);
      if (consumed.changes !== 1) throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or expired.');
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?').run(now, now, row.id);
      return row;
    });
    const row = verify();
    notify(db, row.id, 'verification_approved', 'Your email is verified', 'Your email verification is complete. You can now publish and engage with launches.', 'email-verified');
    createSession(db, config, res, row.id);
    return res.json({ user: { id: row.id, displayName: row.display_name, email: row.email, emailVerified: true } });
  });

  router.post('/login', loginLimit, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email.toLowerCase());
    const valid = user ? await verifyPassword(user.password_hash, input.password).catch(() => false) : false;
    if (!valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    createSession(db, config, res, user.id);
    return res.json({ user: userResponse(user) });
  });

  router.post('/logout', (req, res) => {
    revokeCurrentSession(db, config, req, res);
    return res.status(204).end();
  });

  router.post('/verification/resend', emailLimit, async (req, res) => {
    const input = parse(loginSchema.pick({ email: true }), req.body);
    const user = db.prepare('SELECT id, email, email_verified_at FROM users WHERE email = ?').get(input.email.toLowerCase());
    if (user && !user.email_verified_at) {
      const token = issueEmailToken(db, user.id, 'verify', config.emailVerifyMinutes);
      try { await sendAuthLink(sendEmail, config, user.email, 'verify', token); } catch { /* accepted response remains non-enumerating */ }
    }
    return res.status(202).json({ accepted: true });
  });

  router.post('/password/forgot', emailLimit, async (req, res) => {
    const input = parse(loginSchema.pick({ email: true }), req.body);
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(input.email.toLowerCase());
    if (user) {
      const token = issueEmailToken(db, user.id, 'reset', config.passwordResetMinutes);
      try { await sendAuthLink(sendEmail, config, user.email, 'reset', token); } catch { /* always return generic accepted response */ }
    }
    return res.status(202).json({ accepted: true });
  });

  router.post('/password/reset', tokenLimit, async (req, res) => {
    const input = parse(resetPasswordSchema, req.body);
    const tokenHash = hashToken(input.token);
    const row = db.prepare(`SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'
      AND consumed_at IS NULL AND expires_at > ?`).get(tokenHash, isoNow());
    if (!row) throw new ApiError(400, 'INVALID_TOKEN', 'This password reset link is invalid or expired.');
    const passwordHash = await hashPassword(input.password);
    const now = isoNow();
    const reset = db.transaction(() => {
      const current = db.prepare(`SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = 'reset' AND consumed_at IS NULL AND expires_at > ?`).get(tokenHash, now);
      if (!current) throw new ApiError(400, 'INVALID_TOKEN', 'This password reset link is invalid or expired.');
      db.prepare('UPDATE email_tokens SET consumed_at = ? WHERE token_hash = ?').run(now, tokenHash);
      db.prepare('UPDATE email_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = \'reset\' AND consumed_at IS NULL').run(now, row.user_id);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, row.user_id);
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, row.user_id);
    });
    reset();
    res.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
    return res.status(204).end();
  });

  return router;
}
