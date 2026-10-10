import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.js';
import { openDatabase } from '../db/index.js';
import { createApp } from './app.js';
import { seedSyntheticTestDatabase } from './synthetic-test-seed.js';
import { startScheduledWork } from './lib/scheduled-work.js';

const requiredOptIn = 'I_UNDERSTAND_THIS_IS_SYNTHETIC_DISPOSABLE';
if (process.env.LAUNCH_TEST_PREVIEW !== requiredOptIn) {
  throw new Error(`Refusing to start the writable preview without LAUNCH_TEST_PREVIEW=${requiredOptIn}.`);
}

const webOrigin = process.env.TEST_PREVIEW_ORIGIN;
if (!webOrigin) throw new Error('TEST_PREVIEW_ORIGIN must be the exact browser origin of the synthetic test preview.');
let parsedOrigin;
try { parsedOrigin = new URL(webOrigin); } catch { throw new Error('TEST_PREVIEW_ORIGIN must be an absolute HTTP(S) origin.'); }
if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== webOrigin) {
  throw new Error('TEST_PREVIEW_ORIGIN must be an origin without a path, query, or fragment.');
}

const accessKey = process.env.TEST_PREVIEW_API_KEY;
if (!accessKey || accessKey.length < 32) throw new Error('The test preview proxy key is missing or too short.');
const port = Number(process.env.TEST_PREVIEW_API_PORT ?? 4199);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('TEST_PREVIEW_API_PORT must be an unprivileged TCP port.');

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-synthetic-test-preview-'));
const db = openDatabase(':memory:', { migrate: true });
const outbox = [];
let server;
let stopScheduledWork = () => {};
let cleaning = false;

async function cleanup(exitCode = 0) {
  if (cleaning) return;
  cleaning = true;
  stopScheduledWork();
  if (server?.listening) {
    await new Promise(resolve => server.close(resolve));
  }
  if (db.open) db.close();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
  if (exitCode) process.exitCode = exitCode;
}

try {
  const uploadDir = path.join(temporaryRoot, 'uploads');
  const config = loadConfig({
    nodeEnv: 'test', databasePath: ':memory:', previewReadOnly: false,
    syntheticTestPreview: true, testPreviewAccessKey: accessKey,
    port, webOrigin, apiOrigin: webOrigin,
    uploadDir, mailDir: path.join(temporaryRoot, 'mail-disabled'),
    sessionSecret: randomBytes(48).toString('base64url'),
    analyticsSalt: randomBytes(48).toString('base64url'),
    smtpHost: '', smtpUser: '', smtpPass: '', smtpFrom: 'Synthetic Test Preview <no-reply@example.invalid>',
    cookieSecure: parsedOrigin.protocol === 'https:', trustProxy: '0'
  });
  const seed = await seedSyntheticTestDatabase(db, { uploadDir, webOrigin });
  const app = createApp({
    db, config,
    testPreviewOutbox: outbox,
    sendEmail: async message => {
      outbox.push({ to: message.to, subject: message.subject, text: message.text, createdAt: new Date().toISOString() });
      return { previewOnly: true };
    }
  });
  stopScheduledWork = startScheduledWork(db);
  server = app.listen(port, '127.0.0.1', () => {
    console.log(`Synthetic test API listening on 127.0.0.1:${port}; database=:memory:; SMTP=disabled; outbox=memory-only.`);
  });
  server.on('error', error => {
    console.error('Synthetic test API failed to listen:', error.message);
    void cleanup(1);
  });
} catch (error) {
  console.error('Synthetic test API startup failed:', error.message);
  await cleanup(1);
}

process.once('SIGINT', () => { void cleanup(); });
process.once('SIGTERM', () => { void cleanup(); });
