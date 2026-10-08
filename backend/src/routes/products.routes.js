import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { assertOwnedAsset, ensureOwnerBrand, parse } from '../lib/domain.js';
import { productPatchSchema, productSchema } from '../validation.js';

const maxProductsPerBrand = 12;
const now = () => new Date().toISOString();

function productPayload(row) {
  return {
    id: row.id, brandId: row.brand_id, name: row.name, description: row.description,
    ...(row.price_inr_paise == null ? {} : { priceInrPaise: row.price_inr_paise }),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    buyUrl: row.buy_url, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function createProductsRouter({ db, auth, config }) {
  const router = Router();

  router.get('/me/brands/:id/products', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const items = db.prepare('SELECT * FROM products WHERE brand_id = ? ORDER BY position, created_at DESC').all(brand.id).map(productPayload);
    return res.json({ items });
  });

  router.post('/me/brands/:id/products', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const input = parse(productSchema, req.body?.product ?? {});
    const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE brand_id = ?').get(brand.id).n;
    if (count >= maxProductsPerBrand) throw new ApiError(422, 'VALIDATION_ERROR', `A business can have up to ${maxProductsPerBrand} catalog products.`);
    if (input.imageUrl) assertOwnedAsset(db, req.user.id, input.imageUrl, 'launch-carousel', config, 'imageUrl');
    const id = randomUUID(), createdAt = now();
    const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM products WHERE brand_id = ?').get(brand.id).position;
    db.prepare(`INSERT INTO products(id, brand_id, name, description, price_inr_paise, image_url, buy_url, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, brand.id, input.name, input.description, input.priceInrPaise ?? null, input.imageUrl ?? null, input.buyUrl, position, createdAt, createdAt);
    const item = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    return res.status(201).json({ item: productPayload(item) });
  });

  router.patch('/me/brands/:id/products/:productId', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const current = db.prepare('SELECT * FROM products WHERE id = ? AND brand_id = ?').get(req.params.productId, brand.id);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
    const input = parse(productPatchSchema, req.body?.product ?? {});
    if (input.imageUrl) assertOwnedAsset(db, req.user.id, input.imageUrl, 'launch-carousel', config, 'imageUrl');
    const price = Object.hasOwn(input, 'priceInrPaise') ? input.priceInrPaise : current.price_inr_paise;
    const imageUrl = Object.hasOwn(input, 'imageUrl') ? input.imageUrl ?? null : current.image_url;
    db.prepare(`UPDATE products SET name = ?, description = ?, price_inr_paise = ?, image_url = ?, buy_url = ?, updated_at = ?
      WHERE id = ? AND brand_id = ?`)
      .run(input.name ?? current.name, input.description ?? current.description, price, imageUrl,
        input.buyUrl ?? current.buy_url, now(), current.id, brand.id);
    return res.json({ item: productPayload(db.prepare('SELECT * FROM products WHERE id = ?').get(current.id)) });
  });

  router.delete('/me/brands/:id/products/:productId', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const result = db.prepare('DELETE FROM products WHERE id = ? AND brand_id = ?').run(req.params.productId, brand.id);
    if (!result.changes) throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
    return res.status(204).end();
  });

  return router;
}
