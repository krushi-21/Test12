# Backend / Frontend Integration

This backend is being implemented in `/workspace/backend`. The existing planner contract at `/workspace/launch_platform_api_contract.md` is the compatibility baseline and is not being overwritten. The approved screen specification at `/workspace/launch_platform_v1_screen_spec.md` remains unchanged.

## Integration assumptions

- API origin: `http://localhost:4000` by default; all JSON routes use the `/api` base path.
- Browser requests should use `credentials: "include"`; sessions are opaque server-side sessions in an HttpOnly, SameSite=Lax cookie. The local HTTP development cookie is not Secure; production mode requires HTTPS and sets Secure.
- Browser origin is configurable with `WEB_ORIGIN` (defaults to `http://localhost:5173`) and CORS allows credentials only for that exact origin. No bearer-token storage is needed.
- API errors use `{ "error": { "code", "message", "fields?" } }`; validation errors use HTTP 422.
- Uploaded media is sent to `POST /api/uploads`; the response `asset.url` is a usable URL returned by the API. Images are authenticated uploads and carousel alt text is required on launch input.
- Verification/reset emails are delivered through SMTP when configured. Local development writes messages to a private `.local-mail/` directory (not logs or API responses) so flows can be tested without a mail provider.
- Existing endpoint paths, JSON names, shared types, scoring hypothesis (1/2/3), and public/private boundaries follow the shared root contract. The ranking weights remain provisional as specified.

See `/workspace/launch_platform_api_contract.md` for the full endpoint and payload contract; use the backend README for setup and smoke-test commands.


## Additive integration details

`FounderProfileInput` also accepts optional `publicBrandIds` on profile create/update so a founder can select which of their published brands appear on their public founder page; an empty selection publishes no brand links there. `POST /api/launches/:idOrSlug/share` is an additive, optional metric-only endpoint for recording a share action after the client copies the public URL. Neither addition changes the existing routes or response requirements in the shared contract.


## Final owner-state detail

Owner-only `BrandOwner` and `LaunchOwner` responses add `moderationLocked: boolean`. When true, keep the content private and disable owner publish/pause/archive actions; only a moderator decision can restore it. This field is never included in public brand/launch serializers. Published owner-paused content remains resumable through the existing publish action; moderator-paused/removed content is appealable at `POST /api/me/moderation/appeals` and is restored only through moderator review.


Uploaded media URLs work for owner previews with the authenticated session. Draft assets return 404 to other viewers and use `private, no-store`; once the image is referenced by published public content, the media URL is publicly readable with `max-age=300, must-revalidate` to preserve takedown responsiveness. Public launch and brand response image URLs are unchanged.

## Community For You feed contract

Use optional-auth `GET /api/for-you?limit=20&cursor=…&city=&state=&category=` for Community's For You tab. This is a separate feed from `GET /api/me/following`; do not substitute one route for the other. The response is `{ items, nextCursor, coldStart, rankingMode }`; each `items[]` entry is the normal public launch card plus a string `recommendationReason`. Append pages with the returned opaque `nextCursor` and use the response flags to distinguish `personalized` from `popular_recent` cold-start results. `city` and `state` filter by business location, `category` filters by active category ID, and all three may be omitted. Responses are private/no-store; GET requests do not create impression or engagement events. See `API.md` for the ranking inputs, validation, and cold-start ordering.
