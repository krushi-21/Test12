import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import request from 'supertest';
import { openDatabase } from '../db/index.js';
import { getMigrationStatus, listMigrations } from '../db/migrate.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { startScheduledWork } from '../src/lib/scheduled-work.js';

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aarambh-release-check-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
function productionConfig(root, overrides = {}) {
  return loadConfig({
    nodeEnv: 'production',
    productionWritesEnabled: false,
    databasePath: path.join(root, 'volume', 'data', 'aarambh.sqlite'),
    uploadDir: path.join(root, 'volume', 'uploads'),
    sessionSecret: 'synthetic-production-session-secret-0123456789',
    analyticsSalt: 'synthetic-production-analytics-salt-9876543210',
    smtpHost: 'smtp.example.invalid',
    webOrigin: 'https://web.example.invalid',
    apiOrigin: 'https://api.example.invalid',
    ...overrides
  });
}

test('production config requires explicit external paths, unique non-default secrets, and defaults to read-only', async t => {
  const root = await temporaryRoot(t);
  const config = productionConfig(root);
  assert.equal(config.previewReadOnly, true);
  assert.equal(config.productionWritesEnabled, false);
  assert.throws(() => productionConfig(root, { databasePath: '' }), /DATABASE_PATH.*absolute path/);
  assert.throws(() => productionConfig(root, { uploadDir: '' }), /UPLOAD_DIR.*absolute path/);
  assert.throws(() => productionConfig(root, { databasePath: './data/app.sqlite' }), /absolute path/);
  assert.throws(() => productionConfig(root, { uploadDir: '/workspace/backend/storage/uploads' }), /release directory/);
  assert.throws(() => productionConfig(root, { sessionSecret: 'replace-with-a-long-placeholder-session-secret' }), /non-default production secrets/);
  assert.throws(() => productionConfig(root, { analyticsSalt: 'synthetic-production-session-secret-0123456789' }), /must be different/);
  assert.throws(() => productionConfig(root, { productionWritesEnabled: 'yes' }), /exactly true or false/);
  assert.throws(() => productionConfig(root, { previewReadOnly: false }), /explicit production opt-in/);
  const writable = productionConfig(root, { productionWritesEnabled: true });
  assert.equal(writable.previewReadOnly, false);
  assert.equal(writable.productionWritesEnabled, true);
});

test('health stays minimal and readiness reports only safe component states', async t => {
  const root = await temporaryRoot(t);
  const uploadDir = path.join(root, 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const db = openDatabase(':memory:', { migrate: true });
  t.after(() => db.close());
  const config = productionConfig(root, { productionWritesEnabled: true, uploadDir });
  const app = createApp({ db, config, sendEmail: async () => {}, schedulerStatus: () => ({ enabled: true, healthy: true }) });
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok' });
  const ready = await request(app).get('/api/ready');
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  assert.deepEqual(ready.body, {
    status: 'ready',
    checks: { database: 'ok', schema: 'current', uploads: 'ready', scheduler: 'ready' }
  });
  assert.equal(ready.headers['cache-control'], 'no-store');
  assert.equal(ready.text.includes(config.sessionSecret), false);
  assert.equal(ready.text.includes(config.analyticsSalt), false);
  assert.equal(ready.text.includes(config.databasePath), false);
  const unavailable = createApp({ db, config, sendEmail: async () => {}, schedulerStatus: () => ({ enabled: true, healthy: false }) });
  const staleScheduler = await request(unavailable).get('/api/ready');
  assert.equal(staleScheduler.status, 503);
  assert.equal(staleScheduler.body.checks.scheduler, 'unavailable');
});

test('production writes remain denied unless the explicit flag is enabled', async t => {
  const root = await temporaryRoot(t);
  const config = productionConfig(root);
  await fs.mkdir(config.uploadDir, { recursive: true });
  const db = openDatabase(':memory:', { migrate: true });
  t.after(() => db.close());
  const app = createApp({ db, config, sendEmail: async () => {} });
  const ready = await request(app).get('/api/ready');
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.checks.scheduler, 'not_required');
  const response = await request(app).post('/api/auth/register').send({ displayName: 'Synthetic User', email: 'writer@synthetic.example.invalid', password: 'synthetic-test-password' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'DEMO_READ_ONLY');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
});

test('readiness fails closed for a pending migration, absent uploads, and missing production scheduler', async t => {
  const root = await temporaryRoot(t);
  const db = new Database(':memory:');
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, filename TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO schema_migrations(version, filename, applied_at) VALUES (?, ?, ?)');
  for (const migration of listMigrations().filter(item => item.version < 9)) insert.run(migration.version, migration.filename, '2026-01-01T00:00:00.000Z');
  const config = productionConfig(root, { productionWritesEnabled: true, uploadDir: path.join(root, 'missing-uploads') });
  const app = createApp({ db, config, sendEmail: async () => {} });
  const response = await request(app).get('/api/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    status: 'not_ready',
    checks: { database: 'ok', schema: 'migrations_required', uploads: 'unavailable', scheduler: 'unavailable' }
  });
  assert.equal(response.text.includes(root), false);
  db.close();
});

test('the single-node scheduler exposes fresh success, failure, recovery, and stop state', async t => {
  const db = openDatabase(':memory:', { migrate: true });
  t.after(() => { if (db.open) db.close(); });
  let calls = 0;
  const originalError = console.error;
  console.error = () => {};
  let stop;
  try {
    stop = startScheduledWork(db, {
      intervalMs: 15,
      work() {
        calls += 1;
        if (calls === 1) throw new Error('synthetic scheduler failure');
      }
    });
    assert.equal(calls, 1, 'one in-process scheduler performs its initial pass exactly once');
    assert.deepEqual(stop.getStatus(), { enabled: true, healthy: false, lastSuccessAt: null });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(calls >= 2);
    assert.equal(stop.getStatus().healthy, true);
    assert.ok(stop.getStatus().lastSuccessAt);
    stop();
    const stoppedAt = calls;
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, stoppedAt, 'stopping this process clears its only poller');
    assert.deepEqual(stop.getStatus(), { enabled: false, healthy: false, lastSuccessAt: stop.getStatus().lastSuccessAt });
  } finally {
    stop?.();
    console.error = originalError;
  }
});

test('SQLite opening never migrates implicitly; an isolated file backup restores with integrity and synthetic media', async t => {
  const root = await temporaryRoot(t);
  const sourcePath = path.join(root, 'source', 'aarambh.sqlite');
  const unprepared = openDatabase(sourcePath);
  assert.equal(getMigrationStatus(unprepared).current, false);
  assert.equal(unprepared.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get(), undefined);
  unprepared.close();

  const db = openDatabase(sourcePath, { migrate: true });
  db.exec('CREATE TABLE backup_rehearsal (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)');
  db.prepare('INSERT INTO backup_rehearsal(marker) VALUES (?)').run('synthetic-only');
  const mediaPath = path.join(root, 'source-uploads', 'synthetic-asset.bin');
  await fs.mkdir(path.dirname(mediaPath), { recursive: true });
  const media = Buffer.from('synthetic media content for isolated restore rehearsal');
  await fs.writeFile(mediaPath, media, { mode: 0o600 });
  const mediaHash = createHash('sha256').update(media).digest('hex');
  const backupPath = path.join(root, 'backup', 'aarambh.sqlite');
  const restoredMediaDir = path.join(root, 'restore', 'uploads');
  await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  await fs.mkdir(restoredMediaDir, { recursive: true, mode: 0o700 });
  await db.backup(backupPath);
  await fs.chmod(backupPath, 0o600);
  await fs.copyFile(mediaPath, path.join(restoredMediaDir, 'synthetic-asset.bin'));
  db.close();

  const restored = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(restored.pragma('integrity_check')[0].integrity_check, 'ok');
    assert.equal(getMigrationStatus(restored).current, true);
    assert.equal(restored.prepare('SELECT marker FROM backup_rehearsal').get().marker, 'synthetic-only');
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(restoredMediaDir, 'synthetic-asset.bin'))).digest('hex'), mediaHash);
    assert.equal((await fs.stat(backupPath)).mode & 0o777, 0o600);
  } finally {
    restored.close();
  }
});

test('production migration CLI refuses an unconfirmed write and applies only to the confirmed temporary database', async t => {
  const root = await temporaryRoot(t);
  const databasePath = path.join(root, 'mounted-volume', 'aarambh.sqlite');
  await fs.mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const env = { ...process.env, NODE_ENV: 'production', DATABASE_PATH: databasePath };
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const refused = spawnSync(process.execPath, ['db/migrate.js', '--apply'], { cwd: backend, env, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /exact resolved DATABASE_PATH/);
  await assert.rejects(fs.stat(databasePath), { code: 'ENOENT' });

  const missingBackupAttestation = spawnSync(process.execPath, ['db/migrate.js', '--apply', '--confirm-database', databasePath], { cwd: backend, env, encoding: 'utf8' });
  assert.notEqual(missingBackupAttestation.status, 0);
  assert.match(missingBackupAttestation.stderr, /--confirm-backup/);
  await assert.rejects(fs.stat(databasePath), { code: 'ENOENT' });

  const applied = spawnSync(process.execPath, ['db/migrate.js', '--apply', '--confirm-database', databasePath, '--confirm-backup'], { cwd: backend, env, encoding: 'utf8' });
  assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`);
  const checked = spawnSync(process.execPath, ['db/migrate.js', '--check'], { cwd: backend, env, encoding: 'utf8' });
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  assert.match(checked.stdout, /Schema is current/);
  const migrated = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(getMigrationStatus(migrated).current, true);
    assert.equal(migrated.pragma('integrity_check')[0].integrity_check, 'ok');
  } finally {
    migrated.close();
  }
});
