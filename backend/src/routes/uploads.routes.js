import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '../lib/errors.js';
import { makeLimiter } from '../lib/rate-limit.js';

const purposes = new Set(['brand-logo', 'launch-carousel', 'founder-avatar', 'product-image']);
const formats = { 'image/jpeg': { extension: 'jpg', sharp: 'jpeg' }, 'image/png': { extension: 'png', sharp: 'png' }, 'image/webp': { extension: 'webp', sharp: 'webp' } };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createUploadsRouter({ db, config, auth }) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } });
  const uploadLimit = makeLimiter({ windowMs: 60 * 60_000, limit: 20, message: 'Too many uploads. Try again later.' });

  router.post('/uploads', auth.requireAuth, uploadLimit, upload.single('file'), async (req, res) => {
    const purpose = req.body?.purpose;
    if (!purposes.has(purpose)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a supported upload purpose.', { purpose: 'Use brand-logo, launch-carousel, founder-avatar, or product-image.' });
    if (!req.file?.buffer?.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an image file.', { file: 'An image file is required.' });
    const byteLimit = purpose === 'launch-carousel' ? 8 * 1024 * 1024 : 5 * 1024 * 1024;
    if (req.file.size > byteLimit) throw new ApiError(422, 'VALIDATION_ERROR', `This image exceeds the ${byteLimit / 1024 / 1024} MiB limit.`, { file: 'The image is too large.' });
    const detected = await fileTypeFromBuffer(req.file.buffer);
    const format = detected && formats[detected.mime];
    if (!format) throw new ApiError(422, 'VALIDATION_ERROR', 'Only JPEG, PNG, and WebP images are accepted.', { file: 'Unsupported image type.' });

    let normalized;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: config.maxUploadPixels, failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width > config.maxUploadDimension || metadata.height > config.maxUploadDimension || metadata.width * metadata.height > config.maxUploadPixels) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Image dimensions are too large.', { file: 'Maximum dimension is 8000 pixels and maximum image area is 40 megapixels.' });
      }
      normalized = await sharp(req.file.buffer, { limitInputPixels: config.maxUploadPixels, failOn: 'error' })
        .rotate().toFormat(format.sharp).toBuffer({ resolveWithObject: true });
      if (normalized.data.length > byteLimit) throw new ApiError(422, 'VALIDATION_ERROR', 'The processed image exceeds its size limit.', { file: 'The image is too large after processing.' });
      normalized.info.width = normalized.info.width || metadata.width;
      normalized.info.height = normalized.info.height || metadata.height;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(422, 'VALIDATION_ERROR', 'The image is corrupt or cannot be decoded.', { file: 'Choose a valid JPEG, PNG, or WebP image.' });
    }

    await fs.mkdir(config.uploadDir, { recursive: true, mode: 0o700 });
    await fs.chmod(config.uploadDir, 0o700);
    const id = randomUUID();
    const fileName = `${id}.${format.extension}`;
    const fullPath = path.join(config.uploadDir, fileName);
    await fs.writeFile(fullPath, normalized.data, { mode: 0o600, flag: 'wx' });
    const now = new Date().toISOString();
    // Product photos use the existing normalized image-asset class; this keeps the
    // migration additive without rebuilding media_assets or its launch-image foreign key.
    const storedPurpose = purpose === 'product-image' ? 'launch-carousel' : purpose;
    try {
      db.prepare(`INSERT INTO media_assets(id, owner_user_id, purpose, file_name, storage_path, mime_type, size_bytes, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, storedPurpose, fileName, fullPath, format === formats['image/jpeg'] ? 'image/jpeg' : detected.mime,
          normalized.data.length, normalized.info.width, normalized.info.height, now);
    } catch (error) {
      await fs.rm(fullPath, { force: true });
      throw error;
    }
    const asset = { id, url: `${config.apiOrigin}/api/media/${id}`, mimeType: detected.mime,
      sizeBytes: normalized.data.length, width: normalized.info.width, height: normalized.info.height };
    return res.status(201).json({ asset });
  });

  router.get('/media/:id', auth.optionalAuth, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) throw new ApiError(404, 'NOT_FOUND', 'Media was not found.');
    const asset = db.prepare('SELECT owner_user_id, storage_path, mime_type, size_bytes FROM media_assets WHERE id = ?').get(req.params.id);
    if (!asset) {
      if (config.previewReadOnly) throw new ApiError(403, 'DEMO_READ_ONLY', 'Preview mode only serves publicly referenced media.');
      throw new ApiError(404, 'NOT_FOUND', 'Media was not found.');
    }
    const publicReference = db.prepare(`SELECT 1 FROM brands WHERE status = 'published' AND instr(logo_url, '/api/media/' || ?) > 0
      UNION ALL SELECT 1 FROM founder_profiles WHERE public_profile = 1 AND moderation_status = 'active' AND instr(avatar_url, '/api/media/' || ?) > 0
      UNION ALL SELECT 1 FROM launch_images i JOIN launches l ON l.id = i.launch_id JOIN brands b ON b.id = l.brand_id
        WHERE i.asset_id = ? AND l.status = 'published' AND b.status = 'published' LIMIT 1`).get(req.params.id, req.params.id, req.params.id);
    const productReference = db.prepare(`SELECT 1 FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE b.status = 'published' AND instr(p.image_url, '/api/media/' || ?) > 0 LIMIT 1`).get(req.params.id);
    const isPublicReference = Boolean(publicReference || productReference);
    const isOwner = req.user?.id === asset.owner_user_id;
    if (!isOwner && !isPublicReference) {
      if (config.previewReadOnly) throw new ApiError(403, 'DEMO_READ_ONLY', 'Preview mode only serves publicly referenced media.');
      throw new ApiError(404, 'NOT_FOUND', 'Media was not found.');
    }
    const root = path.resolve(config.uploadDir);
    if (!config.previewReadOnly) await fs.chmod(root, 0o700);
    const file = path.resolve(asset.storage_path);
    if (!file.startsWith(`${root}${path.sep}`)) throw new ApiError(404, 'NOT_FOUND', 'Media was not found.');
    res.type(asset.mime_type).set({ 'Cache-Control': isPublicReference ? 'public, max-age=300, must-revalidate' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.sendFile(file, error => { if (error && !res.headersSent) res.status(404).end(); });
  });

  return router;
}
