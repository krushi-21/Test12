# Aarambh — Project Description and First-Launch Implementation

Aarambh is an India-wide launch and discovery community for small businesses. Founders can introduce a new product, service, or business; visitors can discover launches, businesses, and the people behind them. **Aarambh is not an ecommerce marketplace:** product cards link directly to a business’s own HTTPS destination, but Aarambh does not provide carts, checkout, orders, or payments.

## First-launch features implemented

The backend and interactive synthetic `/test` app now cover the requested first-launch feature set.

### Accounts, founder workspace, and business profiles

The app supports registration, email verification, sign-in/sign-out, password reset, founder profiles, multiple businesses per founder, and launch drafts with image uploads, publishing, editing, pausing, and archiving. Owners can edit business contact details, public address, owner-supplied coordinates, online/physical/hybrid mode, and seven-day opening hours. Email verification and password-reset messages in the synthetic preview are stored in a local in-memory outbox; SMTP is disabled there.

Businesses have owner-scoped create, list, edit, and delete APIs for up to 12 database-backed catalog items. Items support optional INR pricing, uploaded images, validated HTTPS destinations, and public product cards. Analytics include product-level click reporting. The product links send visitors to the business site; Aarambh does not process the resulting transaction.

### Community, launch lifecycle, and notifications

Verified members can follow founders, businesses, and categories; the personalized Following feed combines those relationships. Members can create private or public launch collections and share public lists through stable links.

Launches support scheduled start and optional end times, countdowns, Coming Soon / Launching Today / Live / Trending / Established discovery stages, upcoming-launch and anniversary views, and reminder subscriptions. These discovery stages do not replace draft/published/paused/archived access controls. The in-app notification center covers relevant launch, follow, engagement, verification, and ending-soon events, with deduplication.

### Discovery, search, and contact

India-wide business discovery supports city and area, category, online/physical/hybrid mode, optional price range, newly launched, open-now and email-verified-account filters, and nearby, new, trending, rising, most-saved and most-liked sorts. A map view uses business coordinates or a selected city centre. The app does not geocode addresses or request a visitor’s device location. “Verified” means the managing account verified its email; it is not an Aarambh business-verification badge.

Business profiles provide direct website, WhatsApp, phone, email, directions, quote, demo, and store actions. All lead-generation actions direct visitors to the business rather than accepting payment on Aarambh.

### Reviews, moderation, and analytics

Verified members can submit one structured business review covering overall rating, quality, value, experience, and recommendation. Owners cannot review their own business; members can report reviews and moderators can hide or restore them. Public review output does not expose reviewer account identities.

Private aggregate analytics cover profile visits, launch-detail views, feed impressions, contact actions, product clicks, likes, saves, shares, and outbound clicks. Founder reports include daily, weekly, and monthly views, first-party traffic-source attribution, best-performing launch/product, and website conversion. Founder and trending dashboards provide launch/product shortcuts, launch-level reporting, Trending Today / This Week / This Month, and rising-business views. Analytics responses do not expose visitor identities; ranking and lifecycle thresholds remain provisional until tuned against production activity.

### Safety foundations

Protected actions use account ownership and verification checks. The API also validates destinations, limits and checks uploaded files, protects draft media, rate-limits event recording, deduplicates repeat engagement events, and provides reporting and moderation workflows.

## Technical implementation and release boundary

Additive migrations `003`–`006` cover first-launch community features, launch end times, analytics attribution, and database-backed product catalogs. The interactive `/test` app uses the same database-backed product APIs as the application code; its database, message outbox, and uploads are temporary. The public static demo at `/` remains read-only and unchanged.

**No production deployment was made.** This task did not open, migrate, seed, or alter the pre-existing persistent SQLite database or any user records. All migration and API regression runs used fresh `:memory:` databases, and browser verification used a separate disposable synthetic preview. The new migration files are present in the codebase but were not applied to the persistent database.

Production release still requires an intentional deployment using the intended database and media-storage configuration, production secrets and email delivery, HTTPS, backups, monitoring, and an operational response process for reports. The pre-existing public preview link was not redeployed during this work; do not assume it includes these code changes.

## Preview and verification

The interactive synthetic preview requires fictional accounts and records only. Its local verification outbox and database are memory-only, SMTP is disabled, and temporary uploads are removed when the preview stops. The static demo and interactive test preview are distinct.

Verification completed on **October 7, 2026**: the backend suite passed **11 tests with 0 failures** using in-memory SQLite; the frontend TypeScript production build passed; backend JavaScript syntax checks passed; and the interactive browser smoke passed across browse/detail, account and authoring flows, product creation/editing, weekly-hours persistence, following, public collections and share pages, reviews, launch lifecycle, trending, analytics, and notifications. The exercised browser flows made 439 same-origin HTTP requests.
