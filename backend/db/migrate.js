import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const backendRoot = path.resolve(migrationsDir, '../..');

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
  const files = fs.readdirSync(migrationsDir).filter(file => /^\d+_.+\.sql$/.test(file)).sort();
  for (const filename of files) {
    const version = Number(filename.split('_', 1)[0]);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadConfig } = await import('../src/config.js');
  const config = loadConfig();
  const databasePath = prepareDatabasePath(config.databasePath);
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (config.databasePath !== ':memory:') db.pragma('journal_mode = WAL');
  runMigrations(db);
  console.log('Database migrations are up to date.');
  db.close();
}
