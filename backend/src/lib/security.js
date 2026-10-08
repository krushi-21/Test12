import { createHash, createHmac, randomBytes } from 'node:crypto';

export function newToken() { return randomBytes(32).toString('base64url'); }
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }

export function actorKey(req, userId, salt) {
  const source = userId ? `user:${userId}` : `network:${String(req.ip ?? 'unknown').replace(/^::ffff:/, '')}`;
  return createHmac('sha256', salt).update(source).digest('hex');
}

export function encodeCursor(offset) { return Buffer.from(String(offset), 'utf8').toString('base64url'); }
export function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) return value;
  } catch { /* malformed cursors fall through to validation error */ }
  return null;
}

export function constantTimeTokenEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && left.equals(right);
}
