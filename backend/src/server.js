import { loadConfig } from './config.js';
import { openDatabase } from '../db/index.js';
import { createApp } from './app.js';
import { createEmailSender } from './lib/email.js';
import { startScheduledWork } from './lib/scheduled-work.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ db, config, sendEmail: createEmailSender(config) });
const stopScheduledWork = config.previewReadOnly ? null : startScheduledWork(db);
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
