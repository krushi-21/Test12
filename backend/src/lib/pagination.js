import { decodeCursor, encodeCursor } from './security.js';
import { ApiError } from './errors.js';

export function pageArgs(query) {
  const limitValue = query.limit == null ? 20 : Number(query.limit);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 50) throw new ApiError(422, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 50.', { limit: 'Use a value from 1 to 50.' });
  const offset = decodeCursor(query.cursor);
  if (offset == null) throw new ApiError(422, 'VALIDATION_ERROR', 'cursor is invalid.', { cursor: 'Use the nextCursor returned by the previous response.' });
  return { limit: limitValue, offset };
}

export function pageResult(rows, limit, offset) {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null };
}
