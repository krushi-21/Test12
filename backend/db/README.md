# Database migrations

Migrations are ordered by numeric filename prefix and recorded in `schema_migrations`. Opening the API database never migrates it. From `/workspace/backend`, configure `DATABASE_PATH` and run an explicit status check with `npm run migrate -- --check` or apply with `npm run migrate -- --apply`.

The CLI requires a configured database file path; production requires an absolute path outside the application release tree. `--check` is read-only and does not create a missing database. Production `--apply` additionally requires `--confirm-database` with the exact configured path and `--confirm-backup` after the reviewed backup. The parent directory must already exist on the mounted volume. Back up the database and its corresponding upload files before applying a production migration, and verify readiness after API startup. See [`../PRODUCTION_SINGLE_NODE.md`](../PRODUCTION_SINGLE_NODE.md).

Add a new numbered migration for future changes; do not edit an already-applied migration in a deployed environment.
