import Database from 'better-sqlite3';
import fs from 'node:fs';
import { prepareDatabasePath, runMigrations } from './migrate.js';

export function openDatabase(databasePath) {
  const securePath = prepareDatabasePath(databasePath);
  const db = new Database(securePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
