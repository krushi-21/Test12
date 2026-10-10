# Migrations

Migrations are applied in ascending numeric order only by the explicit migration command; API startup does not migrate. Never edit a migration that may have run against a shared or deployed database; add a new numbered migration instead.

`003_first_launch_features.sql` adds the data model for founder/brand/category follows, personalized-feed queries, launch reminders, public/private launch collections, structured business ratings and reports, business contact/location/hours fields, and privacy-preserving business analytics events. Coordinates are supplied by the business owner; the app does not geocode addresses or request a visitor's location. `verified` discovery means only that the managing account verified its email, not that Aarambh has verified a business. The migration is additive and does not alter the draft/published/paused/archived content-access lifecycle or add checkout/payment tables.

`005_analytics_attribution.sql` adds a constrained first-party surface label to launch engagement events so aggregated dashboards can separate search, nearby discovery, following, collections, trends, and direct traffic. Raw event actors remain private and are never returned in dashboard responses.

`006_product_catalog.sql` adds an owner-scoped business catalog with optional INR pricing, an optional uploaded image, a direct HTTPS destination, stable ordering, and a maximum of 12 items per business at the API layer. It does not add carts, checkout, payment processing, or order handling.

Catalog-photo uploads use the existing normalized image pipeline and media asset class to preserve the foreign key used by launch images. Upload ownership is still checked against the managing account before a catalog can reference the photo.

The default app remains read-only. Write-enabled feature flows are available in the isolated synthetic test preview or in production only after an explicit `ENABLE_PRODUCTION_WRITES=true` opt-in and the separately reviewed deployment prerequisites. In-memory preview rows reset when that preview stops.

Migration and API tests use fresh `:memory:` databases. This production-readiness preparation did not open, migrate, seed, or alter any persistent SQLite database. The live schema must be inspected with the explicit read-only migration check before a reviewed release.

`009_profile_media_details.sql` adds founder pronouns/interests and business cover/gallery columns. For this change it has been exercised only on fresh `:memory:` test databases and has not been applied to any persistent database.
