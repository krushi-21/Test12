# Launch Platform Backend MVP

A Node.js 20+ / Express 5 JSON API backed by SQLite. It implements the approved V1 screen spec and is kept separate from the parallel frontend in `/workspace/backend`; the approved screen spec and planner API contract are not modified.

- Approved screens and product boundaries: `/workspace/launch_platform_v1_screen_spec.md`
- Frontend contract: `/workspace/launch_platform_api_contract.md`
- Early frontend integration decisions: [`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md)

## Run locally

```bash
cd /workspace/backend
npm ci
cp .env.example .env
```

Edit `.env`. Keep local development at `NODE_ENV=development`; set `WEB_ORIGIN` to the frontend’s exact origin (default `http://localhost:5173`). Replace both placeholder secrets with different random values of at least 32 characters, for example:

```bash
openssl rand -base64 48
```

Set `SESSION_SECRET` and `ANALYTICS_SALT` separately. Do not commit `.env`.

```bash
npm run migrate -- --apply
npm run dev
```

The API listens on `0.0.0.0:4000` by default. Liveness: `GET http://localhost:4000/api/health`; readiness: `GET http://localhost:4000/api/ready`. API JSON routes use `/api`. The default preview is anonymous and ignores credentials; authenticated requests are available only in isolated API tests with preview explicitly disabled. CORS and state-changing browser requests accept only the exact configured `WEB_ORIGIN`.

### Default demo preview (read-only)

`npm run dev` and `npm start` default to server-side preview read-only mode. Production also defaults to read-only unless `ENABLE_PRODUCTION_WRITES=true` is explicitly set. Only anonymous `GET` requests to `/api/health`, `/api/ready`, `/api/categories` and `/api/categories/popular`, `/api/discover/businesses`, `/api/launches` (including discovery filters), `/api/for-you`, `/api/launches/upcoming`, `/api/launches/:idOrSlug` (published launches only), `/api/brands/:slug` (published brands only), `/api/founders` (public directory) and `/api/founders/:idOrSlug` (public active profiles only), `/api/businesses/leaderboard`, `/api/leaderboard`, and `/api/media/:id` for media referenced by public content are allowed. Valid but unreferenced media IDs receive the preview error; malformed media UUIDs remain not-found responses. Owner-only media is never available in preview.

The regular server opens the configured SQLite database without applying migrations and never seeds demo businesses or launches. If that database has no published records, discovery shelves will be empty; this is intentional and startup will not populate or modify persistent content. Production also requires the configured database file and upload directory to already exist. The separate `/test` preview below creates and seeds a fresh in-memory database with fictional businesses and launches on every start, so its discovery shelves repopulate after each restart and all changes disappear when it stops.

Every other route or method—including `/api/me`, account/session/authentication, saved items, analytics, founder workspaces, moderator-only routes, and all write endpoints—returns HTTP 403 with `{ "error": { "code": "DEMO_READ_ONLY", "message": "This preview API is read-only. Only anonymous public GET discovery and publicly referenced media are available." } }`. Incoming `Cookie` and `Authorization` headers are ignored before authentication middleware; preview responses do not set cookies, and preview CORS does not enable credentialed requests. Public feed/detail reads do not record impressions or detail views. `POST /api/launches/:idOrSlug/share` and `GET /api/launches/:idOrSlug/outbound/:kind` are blocked, so preview cannot persist share/click-out events or redirect to an external destination. Preview reads do not update database rows or media permissions.

Outside production, the default mode cannot be disabled by server environment variables. The only supported non-production opt-out is explicit application configuration for isolated local API tests with both `nodeEnv: 'test'` and `databasePath: ':memory:'`, for example `loadConfig({ nodeEnv: 'test', databasePath: ':memory:', previewReadOnly: false })`. Production writes require explicit `ENABLE_PRODUCTION_WRITES=true`, absolute external database/upload paths, secure distinct secrets, HTTPS origins, and the existing SMTP requirement.

### Open synthetic interactive test preview

The static frontend fixture preview remains the default at `/`. For owner-only end-to-end testing, start a separate disposable API and use `/test`:

```bash
cd /workspace/backend
LAUNCH_TEST_PREVIEW=I_UNDERSTAND_THIS_IS_SYNTHETIC_DISPOSABLE \
TEST_PREVIEW_ORIGIN=http://localhost:4173 \
npm run test-preview
```

The opt-in runner starts the React dev server on port 4173 without an outer preview username or password. Anyone with the `/test` link can browse and change the shared synthetic preview data; use the link only with people who should be able to modify disposable test records. The seeded founder, member, and moderator accounts are synthetic and shared for testing. The app still requires sign-in for private account/workspace actions, a verified synthetic email for verified-user actions such as liking/saving/publishing, and enforces owner checks on edits. These app-level permissions are separate from the removed outer link gate.

The API binds only to `127.0.0.1:4199`; the same-origin Vite proxy injects a random server-side key that is not sent to the browser, and the API port is not a public port. The proxy checks the configured origin/Fetch Metadata, requires exact-origin evidence for state-changing requests, and applies in-memory per-peer request limits. The API uses a fresh `:memory:` SQLite database. Synthetic accounts, brand/launch records, sample media, and one open report on `sample-release-notes` are seeded at startup; all database writes disappear when the runner stops. Use only synthetic names, emails, and passwords. The seeded sign-in choices are `founder@synthetic.example.invalid` / `TestFounder_2026!`, `member@synthetic.example.invalid` / `TestMember_2026!`, and `moderator@synthetic.example.invalid` / `TestModerator_2026!`. The moderator account is email-verified with the moderator role so it can review and act on the synthetic report. The root route `/` remains the existing static, read-only synthetic demo and is unchanged.

To exercise the API flow end to end against a running preview (never use real user information):

```bash
npm run test-preview-check
```

Run the Chromium browser-level flow from the frontend directory:

```bash
cd /workspace/frontend
npm run test-preview-ui
```

This test server explicitly disables SMTP and captures synthetic verification/reset messages in memory; the test-only `/api/__test/outbox` route is reachable through the same-origin proxy so test accounts can consume local messages. Uploads go to a unique temporary directory under the system temp directory and are removed on shutdown. It does not use the default database, `/workspace/backend/storage`, or `/workspace/backend/.local-mail`, and the default static demo at `/` is not changed. There is no persistent database/storage/mail, old Worker, or deployment involved. Stop with Ctrl+C. This is a disposable synthetic test setup only, not a production signup or deployment path.

### Local email verification and password reset

Without SMTP, verification and password-reset emails are written to the private `.local-mail/` directory. Use the link in the matching message to complete the flow; the API does not return tokens in responses or log them. Do not expose or commit this directory. With SMTP configured, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env`.

### Tests and moderator bootstrap

```bash
npm test
npm run moderator:add -- verified-moderator@example.com
```

The moderator command only promotes an existing email-verified account. It changes the account role in the configured database; access is checked server-side on every moderator request.

## API surface

The shared contract in `/workspace/launch_platform_api_contract.md` is the primary frontend reference. Implemented route groups include:

- **Public:** Anonymous discovery/detail `GET` routes for categories and popular categories, local business discovery, launches and filters, the separate optional-auth For You feed, founders and founder search, business/launch leaderboards, brands, and publicly referenced media. Outbound redirects are blocked in the default preview mode.
- **Account:** registration, email verification/resend, login/logout, password forgot/reset under `/api/auth`; private current user at `GET /api/me`.
- **Founder workspace:** founder profile, brand CRUD/publish/pause/archive, structured 1–5 image carousel launch drafts and publish/edit/pause/archive under `/api/me`.
- **Member engagement:** like/save toggles, private saved list, and metric-only share event at `POST /api/launches/:idOrSlug/share`; writes and share events are blocked in the default preview mode.
- **Private analytics:** `GET /api/me/analytics?brandId=&launchId=&range=7d|30d` returns aggregates only.
- **Media:** authenticated `POST /api/uploads` for `brand-logo`, `launch-carousel`, or `founder-avatar`; it accepts JPEG/PNG/WebP only, verifies actual file signatures, decodes and normalizes images, enforces size/dimension limits, and requires carousel alt text when attaching images to a launch.
- **Reports/moderation:** Report submission, moderator review/action routes for reports, leaderboard holds, and appeals.

Request/response fields use camelCase. Standard API errors have the form `{ "error": { "code", "message", "fields?" } }`. Validation errors use HTTP 422; authentication, authorization, not-found, conflict, and rate-limit status codes follow the planner contract.

## Privacy and abuse controls

- Passwords use Argon2id. Session credentials are random opaque tokens in HttpOnly SameSite=Lax cookies; only token hashes are stored. Verification and reset tokens are random, single-use, expiry-limited, and stored hashed. Password reset revokes all existing sessions.
- Like/save rows are unique per account and launch; owner activity is rejected/excluded. Qualified click-outs are limited to one per verified account, launch, destination, and Asia/Kolkata calendar day. Anonymous and signed-in engagement actors are represented by HMAC pseudonyms; raw IP addresses and user-agent strings are not persisted.
- Private analytics expose aggregates and calendar-day series only, not visitor identities or raw visitor/network data. Obvious bot user agents are excluded; feed/detail events are deduplicated over a short interval; click bursts create a leaderboard hold for moderator review.
- Leaderboards count individual published launches, exclude opted-out, unpublished, paused/removed, and held entries, and use the provisional `1 like / 2 save / 3 qualified click-out` formula over Asia/Kolkata weekly/monthly boundaries. Equal scores share rank; earlier publication is displayed first. Fewer than five eligible launches produce “forming,” not a ranked list.
- The separate business leaderboard aggregates that same provisional score across each business's eligible published launches. Popular categories are ordered by the count of currently published launches; this is a content-volume signal, not a claim about user preference.
- Founder financial/funding fields remain private unless each corresponding public flag is explicitly enabled. Public disclosures include “Self-reported, unverified” and a disclosure date. Public serializers do not expose account email, saver identities, reports, or moderation notes.
- Moderator pause/removal locks cannot be overridden by owner publish/archive routes. A verified moderator must restore the content; owners can submit an appeal. Actions are audited, notifications are persisted, and decision email is sent through SMTP or the private local outbox. Moderator queues include action history and the public content preview, but omit reporter identity.
- Upload and sensitive/auth/report actions have rate limits. Browser state-changing requests reject non-configured origins. Configure `TRUST_PROXY` only for the actual reverse-proxy topology; otherwise forwarded client IPs can be spoofed and IP-based limits will be ineffective.

## Production checklist / MVP limitations

Before a public launch, use HTTPS; set production secrets, SMTP, exact origins, and a narrowly correct `TRUST_PROXY`; place SQLite and uploads on persistent storage with independent backups; monitor disk/database health; and set an operational response-time target for reports/takedowns (the product spec requires one before opening submissions, but no target has been supplied or encoded). Email-dependent account and moderation flows remain a deployment blocker until SMTP is configured and validated. See [`PRODUCTION_SINGLE_NODE.md`](./PRODUCTION_SINGLE_NODE.md) for the deployment, migration, readiness, backup/restore, and rollback runbook. Local filesystem media URLs are suitable for this runnable MVP, not durable object storage/CDN deployment. The MVP intentionally has one managing account per brand, no business-verification badge, no checkout/orders, no free-form posts/comments/messages, no custom analytics range, and no third-party social-account integrations.

Database migrations live in `db/migrations` and are applied only by an explicit `npm run migrate -- --apply` command; server startup is migration-free. Use `npm run migrate -- --check` to inspect status. Production apply requires an exact database-path confirmation and `--confirm-backup`. Add a new numbered migration for future deployed changes; do not edit a migration already applied to a shared/production database.


## Media visibility

An uploaded image is private and served only to its owner until it is referenced by an active published brand logo, public founder avatar, or published launch carousel under a published brand. Draft-media responses use `private, no-store`; non-owners receive 404. Publicly referenced images use `max-age=300, must-revalidate` so takedowns are not undermined by long-lived caches. Upload directories/files and the default SQLite/email-preview store are restricted to the application user (directories mode 0700, data files mode 0600). This keeps unpublished carousel assets out of public access while allowing public pages to load their images.


See [`API.md`](./API.md) for the implemented method/path/authentication inventory; the planner contract at `/workspace/launch_platform_api_contract.md` remains authoritative for exact request and response fields.
