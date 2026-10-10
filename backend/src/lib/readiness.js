import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getMigrationStatus } from '../../db/migrate.js';

function databaseReady(db) {
  try {
    return Boolean(db?.open && db.prepare('SELECT 1 AS healthy').get()?.healthy === 1);
  } catch {
    return false;
  }
}
function schemaReady(db) {
  try {
    return getMigrationStatus(db).current;
  } catch {
    return false;
  }
}
function uploadStorageReady(uploadDir, writable) {
  let directory;
  try {
    directory = path.resolve(uploadDir);
    if (!fs.statSync(directory).isDirectory()) return false;
    if (!writable) {
      fs.accessSync(directory, fs.constants.R_OK | fs.constants.X_OK);
      return true;
    }
    const probePath = path.join(directory, `.aarambh-ready-${randomBytes(8).toString('hex')}`);
    let descriptor;
    try {
      descriptor = fs.openSync(probePath, 'wx', 0o600);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.unlinkSync(probePath);
      return true;
    } catch {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* best-effort cleanup */ }
      }
      try { fs.unlinkSync(probePath); } catch { /* probe may not have been created */ }
      return false;
    }
  } catch {
    return false;
  }
}
export function getReadinessSnapshot({ db, config, schedulerStatus }) {
  const database = databaseReady(db);
  const schema = database && schemaReady(db);
  const uploads = uploadStorageReady(config.uploadDir, !config.previewReadOnly);
  const schedulerRequired = config.nodeEnv === 'production' && !config.previewReadOnly;
  let scheduler = 'not_required';
  if (schedulerRequired) {
    try {
      const status = schedulerStatus?.();
      scheduler = status?.enabled === true && status?.healthy === true ? 'ready' : 'unavailable';
    } catch {
      scheduler = 'unavailable';
    }
  }
  const checks = {
    database: database ? 'ok' : 'unavailable',
    schema: database ? (schema ? 'current' : 'migrations_required') : 'unavailable',
    uploads: uploads ? 'ready' : 'unavailable',
    scheduler
  };
  const ready = checks.database === 'ok' && checks.schema === 'current' && checks.uploads === 'ready' &&
    (checks.scheduler === 'ready' || checks.scheduler === 'not_required');
  return { status: ready ? 'ready' : 'not_ready', checks };
}
