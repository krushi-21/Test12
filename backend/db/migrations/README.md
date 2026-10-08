# Migrations

Migrations are applied in ascending numeric order at server startup. Never edit a migration that may have run against a shared or deployed database; add a new numbered migration instead.

`003_first_launch_features.sql` adds the data model for founder/brand/category follows, personalized-feed queries, launch reminders, public/private launch collections, structured business ratings and reports, business contact/location/hours fields, and privacy-preserving business analytics events. Coordinates are supplied by the business owner; the app does not geocode addresses or request a visitor's location. `verified` discovery means only that the managing account verified its email, not that Aarambh has verified a business. The migration is additive and does not alter the draft/published/paused/archived content-access lifecycle or add checkout/payment tables.

`005_analytics_attribution.sql` adds a constrained first-party surface label to launch engagement events so aggregated dashboards can separate search, nearby discovery, following, collections, trends, and direct traffic. Raw event actors remain private and are never returned in dashboard responses.

`006_product_catalog.sql` adds an owner-scoped business catalog with optional INR pricing, an optional uploaded image, a direct HTTPS destination, stable ordering, and a maximum of 12 items per business at the API layer. It does not add carts, checkout, payment processing, or order handling.

Catalog-photo uploads use the existing normalized image pipeline and media asset class to preserve the foreign key used by launch images. Upload ownership is still checked against the managing account before a catalog can reference the photo.

All write-enabled feature flows remain available only in the isolated synthetic test preview unless a separately reviewed production deployment is configured. In-memory preview rows reset when that preview stops.

For the first-launch implementation, migration and API tests use only fresh `:memory:` databases. No pre-existing persistent SQLite database was opened, migrated, seeded, or altered; migration 005 is staged for a later, explicitly reviewed deployment.
