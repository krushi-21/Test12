import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.resolve(backendRoot, '../frontend');
const optIn = 'I_UNDERSTAND_THIS_IS_SYNTHETIC_DISPOSABLE';
if (process.env.LAUNCH_TEST_PREVIEW !== optIn) {
  console.error(`Set LAUNCH_TEST_PREVIEW=${optIn} to opt in to this disposable, synthetic-only test preview.`);
  process.exit(2);
}

const webOrigin = process.env.TEST_PREVIEW_ORIGIN ?? 'http://localhost:4173';
let origin;
try { origin = new URL(webOrigin); } catch { throw new Error('TEST_PREVIEW_ORIGIN must be an absolute HTTP(S) origin.'); }
if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== webOrigin) {
  throw new Error('TEST_PREVIEW_ORIGIN must be an origin without a path, query, or fragment.');
}
const webPort = Number(process.env.TEST_PREVIEW_WEB_PORT ?? (origin.port || 4173));
const apiPort = Number(process.env.TEST_PREVIEW_API_PORT ?? 4199);
if (![webPort, apiPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535)) {
  throw new Error('Test preview ports must be unprivileged TCP ports.');
}

const apiKey = randomBytes(32).toString('base64url');
const commonEnv = { ...process.env, LAUNCH_TEST_PREVIEW: optIn, TEST_PREVIEW_ORIGIN: webOrigin };
// These variables belonged to the retired outer login and must not be required or passed to the preview.
delete commonEnv.TEST_PREVIEW_USERNAME;
delete commonEnv.TEST_PREVIEW_PASSWORD;
const children = [];
let stopping = false;

function start(label, command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${label}] ${chunk}`));
  child.on('exit', code => {
    if (!stopping) {
      console.error(`[${label}] exited (${code ?? 'signal'}); stopping the paired test-preview process.`);
      void stop(code && code !== 0 ? 1 : 0);
    }
  });
  children.push(child);
  return child;
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(resolve, 2500).unref();
  })));
  process.exitCode = exitCode;
}

const api = start('api', process.execPath, ['src/isolated-preview-server.js'], backendRoot, {
  ...commonEnv, TEST_PREVIEW_API_PORT: String(apiPort), TEST_PREVIEW_API_KEY: apiKey
});
const vite = start('web', process.execPath, [
  path.join(frontendRoot, 'node_modules/vite/bin/vite.js'),
  '--config', 'vite.test-preview.config.ts', '--host', '0.0.0.0', '--port', String(webPort), '--strictPort'
], frontendRoot, {
  ...commonEnv,
  TEST_PREVIEW_WEB_PORT: String(webPort), TEST_PREVIEW_API_PORT: String(apiPort),
  TEST_PREVIEW_API_KEY: apiKey
});

async function waitForPreview() {
  const startedAt = Date.now();
  const webBase = `http://127.0.0.1:${webPort}`;
  while (Date.now() - startedAt < 45_000) {
    if (api.exitCode !== null || vite.exitCode !== null) throw new Error('A paired test-preview server exited during startup.');
    try {
      const privateApi = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
        headers: { 'x-test-preview-key': apiKey }
      });
      const noKeyApi = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
      const page = await fetch(`${webBase}/test`);
      const pageHtml = await page.text();
      const publicHealth = await fetch(`${webBase}/api/health`);
      const publicFeed = await fetch(`${webBase}/api/launches?limit=1`);
      const root = await fetch(`${webBase}/`);
      const rootHtml = await root.text();
      if (privateApi.ok && noKeyApi.status === 403 && page.ok && !pageHtml.includes('test-preview-login') &&
          publicHealth.ok && publicFeed.ok && root.ok && rootHtml.includes('id="root"')) return;
    } catch { /* startup is still in progress */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Test preview failed its anonymous-browse and private-key readiness checks.');
}

async function verifyOpenPreview() {
  const webBase = `http://127.0.0.1:${webPort}`;
  const page = await fetch(`${webBase}/test`);
  const pageHtml = await page.text();
  if (!page.ok || pageHtml.includes('name="username"') || pageHtml.includes('name="password"')) {
    throw new Error('The interactive test preview is not publicly browsable without a login screen.');
  }
  if (pageHtml.includes(apiKey)) throw new Error('The private preview API key appeared in the page response.');

  const publicHealth = await fetch(`${webBase}/api/health`);
  if (!publicHealth.ok) throw new Error('Anonymous health reads through the same-origin proxy failed.');
  const publicFeed = await fetch(`${webBase}/api/launches?limit=1`);
  const feed = await publicFeed.json();
  if (!publicFeed.ok || !Array.isArray(feed.items) || feed.items.length < 1) {
    throw new Error('Anonymous launch browsing through the same-origin proxy failed.');
  }

  const crossOrigin = await fetch(`${webBase}/api/health`, {
    headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
  });
  if (crossOrigin.status !== 403) throw new Error('The preview proxy did not reject a cross-origin API request.');

  const missingOrigin = await fetch(`${webBase}/api/launches/${encodeURIComponent(feed.items[0].slug)}/like`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  if (missingOrigin.status !== 403) throw new Error('The preview proxy did not require origin evidence for a state-changing request.');

  const anonymousAction = await fetch(`${webBase}/api/launches/${encodeURIComponent(feed.items[0].slug)}/like`, {
    method: 'PUT', headers: { origin: webOrigin, 'content-type': 'application/json' }, body: '{}'
  });
  const anonymousActionError = await anonymousAction.json();
  if (anonymousAction.status !== 401 || anonymousActionError?.error?.code !== 'AUTH_REQUIRED') {
    throw new Error('The backend did not preserve app-level sign-in requirements for likes.');
  }

  const legacyLogin = await fetch(`${webBase}/test/login`);
  if (legacyLogin.status !== 404) throw new Error('The retired outer credential endpoint is still exposed.');

  const root = await fetch(`${webBase}/`);
  if (!root.ok || !(await root.text()).includes('id="root"')) {
    throw new Error('The unchanged static demo at / is not available.');
  }
}

try {
  await waitForPreview();
  await verifyOpenPreview();
  console.log('\nOPEN SYNTHETIC TEST PREVIEW READY');
  console.log(`URL: ${webOrigin}/test`);
  console.log('Anyone with this test URL can browse and change synthetic preview data; no outer username or password is required.');
  console.log('App-level sign-in, verified-email requirements, API authorization, and owner checks remain enforced for protected actions.');
  console.log('The API key is private to the same-origin proxy; the API binds to 127.0.0.1 and is not exposed as a public port.');
  console.log('The API uses an in-memory database/outbox and temporary uploads; SMTP is disabled. Data resets when the preview stops.');
  console.log('The static demo at / is unchanged. Use synthetic names, emails, passwords, and records only. Press Ctrl+C to stop both processes.\n');
} catch (error) {
  console.error(error.message);
  await stop(1);
  process.exit(1);
}

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
