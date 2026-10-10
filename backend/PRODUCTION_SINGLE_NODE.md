# Aarambh single-node production runbook (prepared, not deployed)

This is an operational preparation for the current SQLite MVP, not a deployment record. No host was selected or contacted; no persistent database was opened or migrated; production writes were not enabled. The frontend root route `/` remains the existing read-only demo.

## Supported topology and durable volume

Run exactly **one Node.js process on one host/instance**. The scheduled-publication/reminder poller is process-local, and SQLite is intended for one host on a local filesystem with reliable file locks. Do not run multiple replicas, a second scheduler process, or SQLite over NFS/SMB. Horizontal scaling requires a separately designed shared database, object storage, and distributed scheduler/locking.

Mount durable storage outside the versioned application/release directory, for example:

```text
/srv/aarambh/data/aarambh.sqlite   # SQLite database; keep its -wal and -shm files alongside it
/srv/aarambh/uploads/              # uploaded media referenced by SQLite rows
```

Use separate, non-overlapping absolute `DATABASE_PATH` and `UPLOAD_DIR` values. Create the mount points and upload directory as the service account with owner-only permissions before starting the process. The production server now refuses to start unless the configured database file and upload directory already exist; it will not silently initialize a local substitute when a volume is missing. The application will not create deployment directories for you. Preserve SQLite WAL sidecar files on the same volume while the process is running; never copy just the main `.sqlite` file from a live WAL database.

Production config also requires HTTPS `WEB_ORIGIN` and `API_ORIGIN`, two distinct non-default secrets of at least 32 characters, and an explicit SMTP host (existing behavior; email implementation was not changed). Configure `TRUST_PROXY` only for the actual reverse proxy.

## Read-only by default; explicit write-mode gate

`NODE_ENV=production` remains read-only unless `ENABLE_PRODUCTION_WRITES=true` is deliberately set. Any other/missing value leaves writes disabled; invalid values are rejected. Use the read-only state for initial schema and public-page checks, then enable writes only as a separately deliberate release step after all launch blockers below are resolved. Do not set the flag merely to make a readiness probe pass.

The non-production default preview is still read-only. Writable test configuration remains restricted to isolated `NODE_ENV=test` and `DATABASE_PATH=:memory:`. This does not alter the static `/` route or the synthetic `/test` setup.

## Explicit schema migration procedure

Opening the SQLite database no longer applies migrations. The backend exposes `npm run migrate -- --check` for a no-write status check and `npm run migrate -- --apply` for an explicit migration action. The CLI requires an explicitly configured `DATABASE_PATH`; production additionally requires an absolute path outside the release tree, exact path confirmation, and `--confirm-backup` on apply. It never migrates on API startup.

For a new or existing production volume, first arrange the required backup/restore target, stop the API if it is already running, then run a status check and review the pending list. Production examples (replace the path with the exact mounted location):

```bash
NODE_ENV=production DATABASE_PATH=/srv/aarambh/data/aarambh.sqlite \
  npm run migrate -- --check

# Only after the reviewed backup and explicit release decision:
NODE_ENV=production DATABASE_PATH=/srv/aarambh/data/aarambh.sqlite \
  npm run migrate -- --apply --confirm-database /srv/aarambh/data/aarambh.sqlite --confirm-backup
```

`--check` exits non-zero when the schema is behind. `--apply` refuses production unless the confirmation argument resolves to the exact configured database path and the operator attests that the paired database-and-uploads backup is complete. Do not run either command against a path until the owner has selected and verified the actual volume. Migration `009_profile_media_details.sql` is present in source; it was not applied to the existing persistent database during this preparation. Determine the live schema with `--check` before planning a release.

Never edit a migration that has run on a shared database. There are no down migrations. Prefer a forward corrective migration for code/schema issues. A code rollback is safe only while the previous release remains compatible with the migrated schema; otherwise use a reviewed restore procedure with an explicit decision about any writes since backup.

## Backup, restore, and rehearsal

Choose an independent backup target (different disk/account/failure domain from the host volume), encryption/access policy, cadence, retention, and recovery objectives before accepting real users. These are not yet selected. A backup must cover **both** SQLite and uploads from a consistent point in time; database-only backups can leave media rows pointing at missing files, and uploads-only backups can retain orphaned assets.

For a first MVP procedure, schedule a short maintenance window, stop the single API process cleanly, then take a provider-level snapshot or copy the complete durable data volume (SQLite file plus any sidecars, and the uploads tree) to the protected backup target. Confirm the backup files are readable and access-restricted. Do not use a plain copy of a live SQLite main file as the backup. If adopting online snapshots later, validate the provider's SQLite/WAL consistency guarantees and media consistency explicitly.

Restore rehearsals must use a **new isolated volume/directory**, never overwrite production. Restore the database and uploads together; run SQLite `PRAGMA integrity_check`, run migration `--check` against the restored copy, start a non-public isolated application instance in read-only mode, and smoke-test public records and representative media. Record restore time, missing-file/schema findings, and the resulting recovery point. Repeat before launch and after material storage or backup changes.

The backend suite now includes a temporary-file SQLite backup/restore check with `integrity_check`, current-schema verification, and a synthetic media-file hash comparison. It is a local code-path rehearsal only—not a selected provider, production backup, full app-volume restore, or a live-data rehearsal.

## Release, startup, and rollback checks

1. Build/test the exact immutable release artifact; keep the prior artifact available.
2. Verify mounted paths and ownership before API startup. Confirm the database and upload directory are on durable storage outside the release directory.
3. With the API stopped and a reviewed backup available, run migration `--check`; review every pending migration. Apply only through the explicit, path-confirmed command above.
4. Start the new release with production writes still disabled. Check `GET /api/health` for liveness (`200`, minimal `{ "status": "ok" }`) and `GET /api/ready` for readiness. The readiness response is limited to generic `database`, `schema`, `uploads`, and `scheduler` states; it contains no paths, credential values, error text, or secret configuration. A `503` means do not route user traffic.
5. Smoke-test HTTPS, exact-origin CORS, a small set of public API reads, and representative referenced media. Verify the public `/` experience remains read-only.
6. Enable `ENABLE_PRODUCTION_WRITES=true` only when email delivery and all product/operational blockers are resolved and the explicit owner decision for accepting writes has been made. Restart/release in the normal controlled process; test signup, verification, password reset, upload, publish, report, and moderation paths under the approved policy.
7. Monitor readiness, process restarts, database/upload-volume capacity, backup age, and scheduled-work freshness. Keep one scheduler instance. Define human on-call ownership and report/takedown response target before submissions open.

For rollback before any schema migration, return to the prior immutable release and keep writes disabled while investigating. After a migration, first determine schema compatibility; do not assume code rollback reverses schema or user writes. If a restore is necessary, stop writes, preserve the current volume for investigation, restore the matched database+uploads snapshot into a separate verified location, and obtain an explicit operational decision about data written after the backup. No deployment or live restore was performed for this task.

## Blockers and decisions still required

- **Hosting and domain:** select the single-node provider/region, durable-volume type/mount paths, HTTPS termination, reverse-proxy topology, domain, DNS, and deployment owner.
- **Email (not worked on):** `NODE_ENV=production` currently refuses startup without `SMTP_HOST`. Signup, email verification/resend, password reset, and email-based moderation/appeal notifications depend on functioning production SMTP. Email setup and delivery validation are a **deployment blocker**; this work intentionally left email code/config requirements untouched and did not enable a mail service.
- **Backup target and policy:** choose independent storage, encryption/permissions, cadence, retention, monitoring, and recovery objectives; run a full database+uploads restore rehearsal before launch.
- **Privacy/moderation policy:** approve privacy notice/retention, report handling, escalation/on-call ownership, and a concrete response-time target for safety reports/takedowns. The code does not decide these policies.
- **Schema state:** run a read-only migration check against the owner-selected production volume. Migration 009 remains unapplied there until that reviewed release step.
- **Operational monitoring:** select host/process/disk alerting and ownership; `/api/health` and `/api/ready` are probe endpoints, not an external monitoring service.
