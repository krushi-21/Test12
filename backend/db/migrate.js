import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const backendRoot = path.resolve(migrationsDir, '../..');
export function listMigrations() {
  return fs.readdirSync(migrationsDir).filter(file => /^\d+_.+\.sql$/.test(file)).sort()
    .map(filename => ({ filename, version: Number(filename.split('_', 1)[0]) }));
}
export function getMigrationStatus(db) {
  const files = listMigrations();
  const hasTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get());
  if (!hasTable) return { current: false, appliedVersions: [], pendingFiles: files.map(file => file.filename), mismatchCount: 0 };
  const rows = db.prepare('SELECT version, filename FROM schema_migrations ORDER BY version').all();
  const applied = new Map(rows.map(row => [row.version, row.filename]));
  const expectedVersions = new Set(files.map(file => file.version));
  const pendingFiles = files.filter(file => !applied.has(file.version)).map(file => file.filename);
  const mismatchCount = files.filter(file => applied.has(file.version) && applied.get(file.version) !== file.filename).length +
    rows.filter(row => !expectedVersions.has(row.version)).length;
  return { current: pendingFiles.length === 0 && mismatchCount === 0, appliedVersions: [...applied.keys()], pendingFiles, mismatchCount };
}
export function prepareDatabasePath(databasePath) {
  if (databasePath === ':memory:') return databasePath;
  const resolved = path.resolve(databasePath);
  const directory = path.dirname(resolved);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (directory === path.join(backendRoot, 'data')) fs.chmodSync(directory, 0o700);
  if (fs.existsSync(resolved)) fs.chmodSync(resolved, 0o600);
  else fs.closeSync(fs.openSync(resolved, 'a', 0o600));
  return resolved;
}

export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, filename TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
  for (const { filename, version } of listMigrations()) {
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, filename, applied_at) VALUES (?, ?, ?)')
        .run(version, filename, new Date().toISOString());
    });
    apply();
  }
}

function configuredDatabasePath() {
  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath || databasePath === ':memory:' || (process.env.NODE_ENV === 'production' && !path.isAbsolute(databasePath))) {
    throw new Error('Set DATABASE_PATH to an explicit file path (absolute in production) before running migrations.');
  }
  const resolved = path.resolve(databasePath);
  if (process.env.NODE_ENV === 'production' && (resolved === backendRoot || resolved.startsWith(`${backendRoot}${path.sep}`))) {
    throw new Error('Production DATABASE_PATH must be outside the application release directory.');
  }
  return resolved;
}
async function runCli() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const apply = args.includes('--apply');
  const backupConfirmed = args.includes('--confirm-backup');
  let confirmedValue;
  let unexpectedArgument = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--confirm-database') {
      confirmedValue = args[index + 1];
      if (!confirmedValue) unexpectedArgument = true;
      index += 1;
    } else if (arg.startsWith('--confirm-database=')) {
      confirmedValue = arg.slice('--confirm-database='.length);
    } else if (!['--check', '--apply', '--confirm-backup'].includes(arg)) {
      unexpectedArgument = true;
    }
  }
  if (checkOnly === apply || unexpectedArgument) {
    throw new Error('Choose exactly one explicit action: --check or --apply.');
  }
  const databasePath = configuredDatabasePath();
  if (apply && process.env.NODE_ENV === 'production' && path.resolve(confirmedValue ?? '') !== databasePath) {
    throw new Error('Production --apply requires --confirm-database followed by the exact resolved DATABASE_PATH.');
  }
  if (apply && process.env.NODE_ENV === 'production' && !backupConfirmed) {
    throw new Error('Production --apply requires --confirm-backup after a reviewed database-and-uploads backup.');
  }
  if (checkOnly && !fs.existsSync(databasePath)) throw new Error('Database file does not exist; --check never creates it.');
  if (apply && !fs.statSync(path.dirname(databasePath)).isDirectory()) throw new Error('DATABASE_PATH parent directory must exist on the mounted persistent volume.');
  const db = checkOnly ? new Database(databasePath, { readonly: true, fileMustExist: true }) :
    new Database(prepareDatabasePath(databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    if (apply) db.pragma('journal_mode = WAL');
    if (checkOnly) {
      const status = getMigrationStatus(db);
      console.log(status.current ? 'Schema is current.' : `Schema requires ${status.pendingFiles.length + status.mismatchCount} migration action(s).`);
      for (const filename of status.pendingFiles) console.log(`pending: ${filename}`);
      if (status.mismatchCount) console.log(`filename mismatches: ${status.mismatchCount}`);
      if (!status.current) process.exitCode = 2;
    } else {
      const before = getMigrationStatus(db);
      runMigrations(db);
      const after = getMigrationStatus(db);
      console.log(after.current ? `Applied ${before.pendingFiles.length} migration(s); schema is current.` : 'Migration check failed after apply.');
      if (!after.current) process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli().catch(error => {
    console.error(`Migration command refused: ${error.message}`);
    process.exitCode = 1;
  });
}
