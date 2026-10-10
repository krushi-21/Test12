import fs from 'node:fs';
import { loadConfig } from './config.js';
import { openDatabase } from '../db/index.js';
import { createApp } from './app.js';
import { createEmailSender } from './lib/email.js';
import { startScheduledWork } from './lib/scheduled-work.js';
import { getMigrationStatus } from '../db/migrate.js';

const config = loadConfig();
if (config.nodeEnv === 'production') {
  let databaseIsFile = false;
  let uploadsAreDirectory = false;
  try { databaseIsFile = fs.statSync(config.databasePath).isFile(); } catch { /* refuse below */ }
  try { uploadsAreDirectory = fs.statSync(config.uploadDir).isDirectory(); } catch { /* refuse below */ }
  if (!databaseIsFile || !uploadsAreDirectory) {
    throw new Error('Configured production database and upload volumes must already be mounted and initialized.');
  }
}
const db = openDatabase(config.databasePath);
const schemaCurrent = getMigrationStatus(db).current;
const stopScheduledWork = config.previewReadOnly || !schemaCurrent ? null : startScheduledWork(db);
const app = createApp({ db, config, sendEmail: createEmailSender(config), schedulerStatus: stopScheduledWork?.getStatus });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Launch Platform API listening on port ${config.port}`);
});

function shutdown() {
  stopScheduledWork?.();
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
