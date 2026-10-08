import { randomUUID } from 'node:crypto';

export function slugify(value) {
  const base = String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55);
  return `${base || 'launch'}-${randomUUID().slice(0, 8)}`;
}
