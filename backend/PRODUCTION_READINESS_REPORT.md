# Aarambh production-readiness preparation report

**Status: prepared for review; not deployed.** This work implements configuration, startup, migration, health/readiness, scheduler-status, and operational-documentation safeguards for the selected single-node Node + SQLite + persistent-disk shape. It preserves the existing product surface and static read-only `/` demo.

## Implemented

- Production remains read-only unless `ENABLE_PRODUCTION_WRITES=true` is deliberately set. Production config requires distinct non-default secrets, HTTPS origins, explicit absolute database/upload paths outside the release tree, and non-overlapping storage paths. The server refuses production startup if the mounted SQLite file or upload directory is absent.
- `openDatabase()` is migration-free by default. Schema changes now require `npm run migrate -- --apply`; `--check` is read-only. Production apply requires the exact configured database path plus `--confirm-backup`. API startup never applies migration 009 or other pending migrations.
- Added sanitized `/api/ready` checks for database connectivity, current schema, upload-volume access, and (only in production write mode) recent scheduler success. `/api/health` remains a minimal liveness response. Readiness does not return paths, secrets, or raw errors.
- The existing in-process scheduled-work poller reports enabled/healthy/fresh status. Documentation requires exactly one process/instance; no distributed scheduler or multi-node locking was introduced.
- Added isolated tests for read-only/write gates, missing/pending storage/schema/scheduler readiness, migration CLI refusal and explicit confirmation, scheduler failure/recovery/stop, implicit-migration prevention, and temporary SQLite-plus-synthetic-media backup/restore integrity.
- Added the single-node runbook with durable-volume layout, migration, release, readiness, backup/restore, rollback, monitoring, blockers, and unresolved decisions.

## Verification

- Backend: `npm test` — **31 passed, 0 failed**.
- Frontend: `npm run build` — **passed**. Vite emitted its existing-style advisory that one minified chunk exceeds 500 kB; no build failure.
- `node --check` on changed backend JavaScript — **passed**.
- Migration apply/status tests used only a disposable temporary SQLite database; backup/restore rehearsal used temporary directories and synthetic bytes.

## Blockers and decisions

- **Email is a deployment blocker:** production startup already requires `SMTP_HOST`; account signup/verification/resend, password reset, and email-dependent moderation/appeal notifications need configured and validated SMTP. Email implementation/config requirements were intentionally left untouched; no SMTP was enabled.
- Hosting/provider/region, domain/DNS/HTTPS termination, reverse-proxy topology, persistent-volume type/mounts, and deployment ownership remain undecided.
- Backup target, encryption/access policy, cadence, retention, recovery objectives, and a full provider-level database-plus-uploads restore rehearsal remain undecided/required.
- Privacy/retention, report handling, moderation escalation/on-call ownership, and a concrete safety-report/takedown response target remain unresolved.
- Migration 009 remains unapplied to persistent data. The actual live schema was not inspected; run `npm run migrate -- --check` only after the owner selects the exact mounted database path.

## Scope and safety boundary

No deployment, production write enablement, persistent database inspection/migration, account/security/billing change, credential creation, email setup, or live backup/restore was performed. `/workspace/backend/data/launch-platform.sqlite`, `/workspace/backend/storage`, and `/workspace/backend/.local-mail` were not accessed or modified. Email source files and frontend source files are unchanged. The frontend build regenerated the files listed below under `dist/`.

## Exact files changed

### Backend source, tests, configuration, and docs

- `/workspace/backend/.env.example`
- `/workspace/backend/PRODUCTION_READINESS_REPORT.md`
- `/workspace/backend/PRODUCTION_SINGLE_NODE.md`
- `/workspace/backend/README.md`
- `/workspace/backend/db/README.md`
- `/workspace/backend/db/index.js`
- `/workspace/backend/db/migrate.js`
- `/workspace/backend/db/migrations/README.md`
- `/workspace/backend/src/app.js`
- `/workspace/backend/src/config.js`
- `/workspace/backend/src/isolated-preview-server.js`
- `/workspace/backend/src/lib/readiness.js`
- `/workspace/backend/src/lib/scheduled-work.js`
- `/workspace/backend/src/routes/public.routes.js`
- `/workspace/backend/src/server.js`
- `/workspace/backend/test/api.test.js`
- `/workspace/backend/test/feature-completeness.test.js`
- `/workspace/backend/test/first-launch-features.test.js`
- `/workspace/backend/test/for-you.test.js`
- `/workspace/backend/test/production-readiness.test.js`
- `/workspace/backend/test/synthetic-preview-seed.test.js`

### Generated frontend build output (frontend source unchanged)

- `/workspace/frontend/dist/assets/index-BqaPoQbh.css`
- `/workspace/frontend/dist/assets/index-Dpas7ptU.js`
- `/workspace/frontend/dist/favicon.svg`
- `/workspace/frontend/dist/icons.svg`
- `/workspace/frontend/dist/images/aarambh-home-hero.jpg`
- `/workspace/frontend/dist/images/growth-maker.jpg`
- `/workspace/frontend/dist/images/launch-atelier.jpg`
- `/workspace/frontend/dist/images/launch-ceramics.jpg`
- `/workspace/frontend/dist/images/launch-craft.webp`
- `/workspace/frontend/dist/images/launch-derma.jpg`
- `/workspace/frontend/dist/images/launch-home.jpg`
- `/workspace/frontend/dist/images/launch-saffron.jpg`
- `/workspace/frontend/dist/images/launch-textile.jpg`
- `/workspace/frontend/dist/index.html`
