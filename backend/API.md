# Backend API map

The full frontend field contract remains `/workspace/launch_platform_api_contract.md` (the implementation reference). This route inventory is additive and records what the backend mounts. Requests and responses are JSON with camelCase fields except the `multipart/form-data` upload endpoint. The default preview is anonymous and read-only; the separate opt-in synthetic interactive preview uses an in-memory test database and preserves the app's cookie authentication and route authorization.

## Public API

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/api/health` | Public; preview allowed | Service health. |
| `GET` | `/api/categories` | Public; preview allowed | Seeded V1 category taxonomy. |
| `GET` | `/api/categories/popular` | Public; preview allowed | Active categories with currently published launch counts, ordered by popularity; cursor/limit pagination. |
| `GET` | `/api/discover/businesses` | Public; preview allowed | Local business discovery with city/area/coordinates, radius, category, mode, open-now, price, verification, and sort filters. Cards include aggregated `saveCount` and viewer-relative `isSaved`. |
| `GET` | `/api/launches` | Public; preview allowed | Filtered/paginated published launch discovery. No impression event is recorded in preview. |
| `GET` | `/api/for-you?limit=20&cursor=&city=&state=&category=` | Optional session; preview allowed | Separate personalized launch feed; returns `{ items, nextCursor, coldStart, rankingMode }`. Each normal launch card includes `recommendationReason`. |
| `GET` | `/api/launches/upcoming` | Public; preview allowed | Upcoming scheduled launches; the main launches feed also supports `sort=new` and location/category/price/availability filters. |
| `GET` | `/api/launches/:idOrSlug` | Public; preview allowed | Published launch detail. Preview is anonymous and omits viewer-specific state; no detail-view event is recorded. |
| `GET` | `/api/brands/:slug` | Public; preview allowed | Published brand page and founder-selected public links, with aggregated `saveCount` and viewer-relative `isSaved`. |
| `GET` | `/api/founders?query=&city=&state=` | Public; preview allowed | Paginated public founder directory; searches profile text/location and founder-selected published brand names. |
| `GET` | `/api/founders/:idOrSlug` | Public; preview allowed | Only public, active founder profiles. |
| `GET` | `/api/businesses/leaderboard?period=monthly` | Public; preview allowed | Weekly/monthly business-level ranks, aggregating qualified engagement across eligible published launches with the same provisional 1/2/3 score weights. |
| `GET` | `/api/leaderboard` | Public; preview allowed | Weekly/monthly Asia/Kolkata rankings; provisional score weights are in the shared contract. |
| `POST` | `/api/launches/:idOrSlug/share` | Blocked in preview | Normally records a metric-only share event; returns `DEMO_READ_ONLY` in preview. |
| `GET` | `/api/launches/:idOrSlug/outbound/:kind` | Blocked in preview | Normally redirects to an allowlisted destination and measures qualified click-outs; preview blocks before redirect or event write. |
| `GET` | `/api/media/:id` | Public reference only in preview | Preview serves only media referenced by public content; owner-only/unreferenced media is denied. Public media retains its short cache window. |

### For You recommendation feed

`GET /api/for-you` is distinct from the authenticated `GET /api/me/following` feed; the existing Following route and response are unchanged. It accepts `limit` (1–50, default 20), the opaque `cursor` returned by the prior page, optional `city` and `state` text filters, and an optional active `category` ID filter. A signed-in viewer's founder-profile city/state are used as location preferences unless overridden by the query. The response is `{ "items": [<normal launch card plus recommendationReason>], "nextCursor": string|null, "coldStart": boolean, "rankingMode": "personalized"|"popular_recent" }`.

Personalized ranking combines exact city/state matches, followed categories, the viewer's qualified non-retracted likes/saves from the last 30 days (category affinity with a 14-day half-life), recent qualified aggregate likes/saves/click-outs from the last 7 days (1/2/3 points with a logarithmic ranking contribution), and a bounded 30-day recency boost. Deterministic tie-breaks use recent aggregate score, publication time, then launch ID. A viewer's own launches are excluded. When no profile/query location, followed-category, or recent like/save signal is available, `coldStart` is `true` and `rankingMode` is `popular_recent`; results are ordered by qualified aggregate engagement over the last 7 days, then newest publication, then launch ID. Empty candidate sets return a normal empty page. Feed reads are read-only, do not record impressions, and responses are `private, no-store`.

## Default preview read-only mode

The server defaults to preview read-only mode for both `npm run dev` and `npm start`. The only allowed operations are anonymous `GET` requests to the public routes marked “preview allowed” above and `GET /api/media/:id` when the image is referenced by published/public content. Every other route, including account/session/authenticated, personal, private, and admin reads, and every non-`GET` method, returns HTTP 403 with `{ "error": { "code": "DEMO_READ_ONLY", "message": "This preview API is read-only. Only anonymous public GET discovery and publicly referenced media are available." } }`. A valid but non-public media ID returns the same code with a media-specific preview message; malformed media UUIDs remain not-found responses.

Preview strips incoming `Cookie` and `Authorization` headers before authentication, emits no `Set-Cookie` headers, and disables credentialed CORS. Feed/detail reads do not record impressions or detail views. Share and outbound routes are blocked, so no share/click-out event is written and outbound requests never redirect. Preview reads do not alter database rows or media permissions. The mode has no environment-variable opt-out; only isolated API tests may set `previewReadOnly: false` in application configuration with `nodeEnv: 'test'` and `databasePath: ':memory:'`.

## Account and authentication

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Starts email verification; response does not disclose a token. |
| `POST` | `/api/auth/verify-email` | Public | Consumes a one-time verification token and creates a cookie session. |
| `POST` | `/api/auth/login` | Public | Sets an HttpOnly session cookie. |
| `POST` | `/api/auth/logout` | Optional session | Revokes the current session. |
| `POST` | `/api/auth/verification/resend` | Public | Non-enumerating resend response. |
| `POST` | `/api/auth/password/forgot` | Public | Non-enumerating reset-email response. |
| `POST` | `/api/auth/password/reset` | Public | Consumes one reset token; revokes all sessions. |
| `GET` | `/api/me` | Signed-in | Current account and private founder workspace summary. |

## Founder and brand workspace

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET`, `POST` | `/api/me/founder-profile` | Signed-in | Read/create the founder profile. |
| `PATCH` | `/api/me/founder-profile` | Signed-in | Update public profile, public brand selections, and private-by-default financial fields. |
| `GET`, `POST` | `/api/me/brands` | Signed-in | List/create drafts; one founder may manage multiple brands. |
| `PATCH` | `/api/me/brands/:id` | Owner | Update brand identity fields. |
| `POST` | `/api/me/brands/:id/publish` | Verified owner | Publish only after required fields/assets are complete. |
| `POST` | `/api/me/brands/:id/pause` | Owner | Pause an unlocked published brand. |
| `POST` | `/api/me/brands/:id/archive` | Owner | Archive an unlocked brand. |

## Launch posts, engagement, analytics

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET`, `POST` | `/api/me/brands/:id/launches` | Owner | List/create structured carousel launch drafts for a brand. |
| `PATCH` | `/api/me/launches/:id` | Owner | Update a draft/launch and carousel attribution. |
| `POST` | `/api/me/launches/:id/publish` | Verified owner | Validates publish readiness; moderator-locked posts cannot be republished by owners. |
| `POST` | `/api/me/launches/:id/schedule` | Verified owner | Body `{ "publishAt": "<future ISO-8601 timestamp>" }`; queues a validated draft for automatic publication. Returns `202` with `item.scheduledAt`; the launch remains private until due. |
| `DELETE` | `/api/me/launches/:id/schedule` | Owner | Cancel a pending scheduled publication. Editing a draft or publishing it immediately also clears its schedule. |
| `POST` | `/api/me/launches/:id/pause` | Owner | Pause an unlocked published launch. |
| `POST` | `/api/me/launches/:id/archive` | Owner | Archive an unlocked launch. |
| `PUT`, `DELETE` | `/api/launches/:idOrSlug/like` | Verified non-owner | Add/remove one active like. |
| `PUT`, `DELETE` | `/api/launches/:idOrSlug/save` | Verified non-owner | Add/remove one private save. |
| `GET` | `/api/me/saved` | Signed-in | Private saved-launch list. |
| `PUT`, `DELETE` | `/api/businesses/:idOrSlug/save` | Verified non-owner to save; signed-in to remove | No request body; `PUT` returns `{ "saved": true }` and `DELETE` returns `{ "saved": false }`. A first save records a privacy-safe `business_save` analytics event and sends a generic in-app owner notice; saver identities stay private. |
| `GET` | `/api/me/saved-businesses` | Signed-in | Private saved-business list; accepts `limit` (1–50, default 20) and opaque `cursor`; returns `{ items, nextCursor }`. |
| `GET` | `/api/me/notifications` | Signed-in | Private in-app notifications; due reminders are also processed by the background worker. |
| `PATCH` | `/api/me/notifications/:id/read` | Signed-in | Mark one own notification read. |
| `POST` | `/api/me/notifications/read-all` | Signed-in | Mark all own notifications read. |
| `GET` | `/api/me/analytics` | Signed-in | Private aggregate metrics only; `range=7d|30d`. |

The writable application process checks scheduled publications and due launch reminders every 15 seconds. Scheduled publication sends the usual deduplicated follower notification; alert subscriptions are delivered separately when the launch time arrives. Date-only reminders become due at the start of that day in Asia/Kolkata. Business bookmarks do not add launch engagement events or alter launch rankings; they count in business discovery's `sort=most_saved` alongside saves on that business's published launches, and in the owner's aggregate dashboard `totals.saves`.

## Reports and moderation

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/api/reports` | Signed-in non-owner | Report a public launch, brand, or founder profile. |
| `POST` | `/api/me/moderation/appeals` | Signed-in owner | Appeal moderator-paused/removed content. |
| `GET` | `/api/admin/reports` | Verified moderator | Queue filters use `status=open|under_review|dismissed|actioned`; reporter identities are omitted. |
| `POST` | `/api/admin/reports/:id/actions` | Verified moderator | `dismiss`, `request_changes`, `pause`, `remove`, or `restore`; state and audit are transactional. |
| `GET` | `/api/admin/leaderboard/holds` | Verified moderator | Review automatic and manual ranking holds. |
| `POST` | `/api/admin/leaderboard/holds/:launchId` | Verified moderator | `hold` or `reinstate`, with audit reason. |
| `GET` | `/api/admin/appeals` | Verified moderator | Appeal queue by status. |
| `POST` | `/api/admin/appeals/:id/actions` | Verified moderator | `dismiss`, `restore`, or `request_changes`. |

## Uploads and errors

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/api/uploads` | Signed-in | `multipart/form-data`: one `file`, `purpose=brand-logo|launch-carousel|founder-avatar`. JPEG/PNG/WebP only; ownership is required when attaching assets. |

Validation failures return HTTP 422 with `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { ... } } }`. Other common codes are `AUTH_REQUIRED`, `EMAIL_NOT_VERIFIED`, `FORBIDDEN`, `DEMO_READ_ONLY`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, and `INTERNAL_ERROR`. Error messages never include tokens, password hashes, or private engagement actor identities.


## Additive frontend details

For owner-only `moderationLocked`, opt-in public-brand selection (`publicBrandIds`), and private-draft/public-published media behavior, see [`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md). These additions do not alter the approved screen specification.
