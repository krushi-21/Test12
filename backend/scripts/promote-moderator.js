import { loadConfig } from '../src/config.js';
import { openDatabase } from '../db/index.js';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: npm run moderator:add -- <verified-account-email>');
  process.exit(2);
}
const config = loadConfig();
const db = openDatabase(config.databasePath);
const result = db.prepare("UPDATE users SET role = 'moderator', updated_at = ? WHERE email = ? COLLATE NOCASE AND email_verified_at IS NOT NULL")
  .run(new Date().toISOString(), email.trim().toLowerCase());
db.close();
if (!result.changes) {
  console.error('No email-verified account matched. Verify the account first, then retry.');
  process.exit(1);
}
console.log('Moderator role granted to the verified account.');
