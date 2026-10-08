# Database migrations

Run `npm run migrate` from `/workspace/backend` after configuring `.env`. SQL migration files are ordered by their numeric prefix and recorded in the `schema_migrations` table. The server also applies unapplied migrations on startup. Add a new numbered migration for future changes; do not edit an already-applied migration in a deployed environment.