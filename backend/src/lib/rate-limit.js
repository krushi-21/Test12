import { rateLimit } from 'express-rate-limit';
import { sendError } from './errors.js';

export function makeLimiter({ windowMs, limit, message = 'Too many requests. Please wait and try again.' }) {
  return rateLimit({
    windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler(_req, res) {
      if (res.getHeader('RateLimit-Reset')) {
        const seconds = Math.max(1, Number(res.getHeader('RateLimit-Reset')) || Math.ceil(windowMs / 1000));
        res.setHeader('Retry-After', String(seconds));
      }
      sendError(res, 429, 'RATE_LIMITED', message);
    }
  });
}
