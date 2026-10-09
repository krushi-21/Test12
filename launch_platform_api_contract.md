# Launch Platform V1 API Contract

Base path: `/api`. JSON request and response bodies use camelCase; timestamps are ISO-8601 UTC. Public reads require no account. Authenticated requests use the session cookie (`credentials: "include"` in the browser); email verification is required before engagement and publishing. Monetary values are integer INR paise when present. Public routes must never return login email, saved-user identities, report details, private analytics, moderation notes, or unopted financial fields.

## Shared types

```ts
type Category = string; // values come from GET /api/categories
type LaunchType = "business" | "product" | "service";
type LinkKind = "website" | "instagram" | "whatsapp";
type PublicLinks = Partial<Record<LinkKind, string>>;
type LaunchStatus = "draft" | "published" | "paused" | "archived" | "removed";
type Period = "weekly" | "monthly";
type ApiError = { error: { code: string; message: string; fields?: Record<string, string> } };

type MediaAsset = { id: string; url: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number; width: number; height: number };
type LaunchCard = {
  id: string; slug: string; title: string; launchType: LaunchType; category: Category; summary: string;
  images: Array<{ url: string; altText: string }>;
  brand: { id: string; slug: string; name: string; logoUrl: string };
  founders: Array<{ id: string; displayName: string; avatarUrl?: string }>;
  publishedAt: string; launchDate?: string; priceInrPaise?: number;
  availabilityNote?: string; location?: { city?: string; state?: string };
  links: PublicLinks; // use measured outbound endpoint to navigate
  engagement: { likes: number }; // saves counts are private except in owner analytics
  viewerState?: { liked: boolean; saved: boolean }; // verified signed-in viewer only
};

type FounderProfileInput = {
  displayName: string; avatarUrl?: string; bio?: string; city?: string; state?: string;
  role?: string; instagramUrl?: string; publicProfile: boolean;
  financial?: {
    revenueRange?: string; revenuePeriod?: string; revenuePublic?: boolean;
    fundingRaisedRange?: string; fundingDate?: string; fundingType?: string; fundingPublic?: boolean;
    openToFunding?: boolean; openToFundingPublic?: boolean;
  };
}; // financial fields are optional and private unless each associated public flag is explicitly true

type BrandInput = {
  name: string; logoUrl: string; description: string; category: Category;
  websiteUrl?: string; instagramUrl?: string; whatsappUrl?: string;
  tagline?: string; city?: string; state?: string; foundedYear?: number;
}; // complete brand requires name, uploaded logo, description, category and websiteUrl OR instagramUrl

type LaunchInput = {
  title: string; launchType: LaunchType; category: Category; summary: string; story: string;
  images: Array<{ url: string; altText: string }>; // 1–5 uploaded images; first is cover
  brandId: string; founderIds: string[]; launchDate?: string; availabilityNote?: string;
  priceInrPaise?: number; websiteUrl?: string; instagramUrl?: string; whatsappUrl?: string;
  leaderboardOptOut?: boolean;
};
```

## Public discovery

- `GET /api/categories` → `{ categories: Array<{ id: string; name: string; slug: string }>, launchTypes: Array<{ id: LaunchType; name: string }> }`. Initial seeded categories: Home & Living, Food & Beverage, Beauty & Personal Care, Fashion & Accessories, Health & Wellness, Education, Technology & Software, Arts & Crafts, Travel & Hospitality, Professional Services, Agriculture & Rural, Retail & Consumer Goods, Automotive & Mobility, Finance & Insurance, Community & Social, Other. Clients should render server-returned values rather than hard-coding their own catalog.
- `GET /api/launches?query=&category=&launchType=&city=&state=&priceMin=&priceMax=&availability=&sort=new|trending&cursor=&limit=` → `{ items: LaunchCard[], nextCursor: string | null }`. Returns published, non-paused launches only. Default ordering is recent/discovery, not all-time likes.
- `GET /api/launches/:idOrSlug` → `{ item: LaunchCard & { story: string } }`.
- `GET /api/brands/:slug` → `{ item: BrandPublic }`, with public brand details and published launches only. `coverImageUrl` is an optional HTTPS image URL or safe `/images/` path; `galleryImageUrls` is an ordered array of up to six such URLs.
- `GET /api/founders/:idOrSlug` → `{ item: FounderPublic }`, containing founder-selected profile fields and public brands only. Optional `pronouns` (up to 40 characters) and `interests` (up to eight labels of up to 40 characters each, 240 characters total) are public profile fields. Optional financial fields appear only after field-specific opt-in, labeled `self-reported, unverified` and dated.
- `GET /api/leaderboard?period=weekly|monthly&category=&cursor=&limit=` → `{ period, timezone: "Asia/Kolkata", scoreFormula: { status: "provisional", like: 1, save: 2, clickOut: 3 }, eligibleCount, forming: boolean, items: Array<{ rank: number; score: number; launch: LaunchCard }> }`. Weights are a provisional product hypothesis, not a confirmed durable policy. Each item is an individual launch; omit opted-out, owner activity, paused/removed and held entries. `forming` is true when fewer than five eligible launches exist.
- `GET /api/launches/:id/outbound/:kind` → `302` redirect to that launch/brand's stored official URL for `website|instagram|whatsapp`; record click-out server-side. Never accept an arbitrary redirect URL. At most one click per verified account per launch/destination day contributes to scoring; owner clicks do not count.

## Account and session

- `POST /api/auth/register` `{ displayName, email, password }` → `202 { verificationRequired: true }`; send verification link without disclosing whether an address already has an account. Passwords are hashed with a modern password hash; tokens are random, single-use, stored hashed and expire.
- `POST /api/auth/verify-email` `{ token }` → `200 { user: { id, displayName, emailVerified: true } }` and establishes an HttpOnly, Secure, SameSite=Lax session cookie.
- `POST /api/auth/login` `{ email, password }` → `200 { user: { id, displayName, emailVerified } }` plus session cookie. Unverified accounts may access their account but cannot like, save, or publish.
- `POST /api/auth/logout` → `204`, clears session.
- `POST /api/auth/verification/resend` `{ email }` → `202 { accepted: true }` with non-enumerating response.
- `POST /api/auth/password/forgot` `{ email }` → `202 { accepted: true }`; `POST /api/auth/password/reset` `{ token, password }` → `204`, invalidates prior sessions.
- `GET /api/me` → `{ user, founder?: FounderPrivate }`; `401 AUTH_REQUIRED` if signed out.

## Member engagement and founder workspace

- `PUT /api/launches/:id/like` / `DELETE /api/launches/:id/like` → `{ liked: boolean, likeCount: number }`.
- `PUT /api/launches/:id/save` / `DELETE /api/launches/:id/save` → `{ saved: boolean }`. One active row per account/launch; no endpoint exposes saver identities or another user's saved list.
- `GET /api/me/saved?cursor=&limit=` → `{ items: LaunchCard[], nextCursor }`.
- `GET /api/me/founder-profile` → `{ item: FounderPrivate | null }`.
- `POST /api/me/founder-profile` `{ profile: FounderProfileInput }` → `201 { item: FounderPrivate }`; `PATCH /api/me/founder-profile` `{ profile: Partial<FounderProfileInput> }` → `{ item: FounderPrivate }`. `pronouns` is optional text (max 40; `null` clears it); `interests` is an optional ordered array (max eight labels, each max 40 and 240 characters total; an empty array clears it). Account email and phone remain private. Public financial serialization requires explicit per-field opt-in; each opted-in value is labeled self-reported/unverified and dated.
- `GET /api/me/brands` → `{ items: BrandOwner[] }`; `POST /api/me/brands` `{ brand: BrandInput, status?: "draft" }` → `201 { item: BrandOwner }`.
- `PATCH /api/me/brands/:id` `{ brand: Partial<BrandInput> }` → `{ item: BrandOwner }`; `POST /api/me/brands/:id/publish` → `{ item: BrandOwner }`. Optional `coverImageUrl` accepts `null` to clear or an HTTPS image URL/safe `/images/` path; `galleryImageUrls` accepts an ordered array of up to six such URLs (an empty array clears the gallery). These fields are persisted and included in owner and public brand responses. Publishing requires verified email and valid mandatory brand identity details.
- `GET /api/me/brands/:id/launches` → `{ items: LaunchOwner[] }`; `POST /api/me/brands/:id/launches` `{ launch: LaunchInput, status?: "draft" }` → `201 { item: LaunchOwner }`.
- `PATCH /api/me/launches/:id` `{ launch: Partial<LaunchInput> }` → `{ item: LaunchOwner }`; `POST /api/me/launches/:id/publish|pause|archive` → `{ item: LaunchOwner }`. Publishing is immediate if email is verified, brand requirements pass, and there are 1–5 valid uploaded images. The current founder profile must be included in `founderIds`; other selected public profiles are attribution only, not additional brand permissions or co-owner access. Owner can opt out of ranking.
- `GET /api/me/analytics?brandId=&launchId=&range=7d|30d` → `{ range, totals: { impressions, detailViews, likes, saves, shares, clickOuts }, series: Array<{ date: string; ...totals }> }`. Owner-only aggregates; no identities or raw visitor/network data. Exclude owner and obvious bot/repeat events where feasible.

## Media uploads

- `POST /api/uploads` accepts `multipart/form-data` with a `file` part and `purpose` = `brand-logo|launch-carousel|founder-avatar`; returns `201 { asset: MediaAsset }`.
- Accept only JPEG, PNG and WebP after validating actual file signatures; reject SVG and other formats. Maximum file size is 5 MiB for a logo/avatar and 8 MiB for each carousel image. Reject empty/corrupt files and enforce image decode/dimension limits; require meaningful alt text when attaching carousel images to a launch. Upload permission requires authentication; publishing still requires verified email.
- The returned `asset.url` is used in `BrandInput.logoUrl`, `FounderProfileInput.avatarUrl`, and `LaunchInput.images`. The MVP may use a filesystem-backed storage adapter behind a storage interface. Local filesystem uploads persist only on the same retained disk; they are not durable across temporary/ephemeral deployment replacement and require durable object storage before production.

## Reporting and moderation

- `POST /api/reports` `{ subjectType: "launch"|"brand"|"founder", subjectId, reason, details? }` → `201 { id, status: "submitted" }`. Reporter identity and report contents are hidden from the subject/owner.
- `GET /api/admin/reports?status=open|under_review` and `GET /api/admin/leaderboard/holds` are moderator-only.
- `POST /api/admin/reports/:id/actions` `{ action: "dismiss"|"request_changes"|"pause"|"remove"|"restore", reason: string }` → `{ report, subjectStatus }`; `POST /api/admin/leaderboard/holds/:launchId` `{ action: "hold"|"reinstate", reason: string }` → `{ held: boolean }`. Record moderator, action and timestamp privately; notify the founder with decision/reason and appeal path.
- `POST /api/me/moderation/appeals` `{ subjectType, subjectId, reason }` → `201 { id, status: "submitted" }` for an owner whose content was paused/removed.

## Error and validation behavior

All errors use `ApiError`. Expected codes: `AUTH_REQUIRED` (401), `EMAIL_NOT_VERIFIED` (403), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422 with field errors), `RATE_LIMITED` (429 with `Retry-After`), `CONFLICT` (409), and `INTERNAL_ERROR` (500). Keep authentication errors generic; never echo passwords, reset/verification tokens, report identity, or private analytics. Enforce HTTPS URL validation, supported image/alt-text requirements, field length limits, safe URL schemes, category/type validity, and ownership checks. Likes/saves are idempotent and unique per user/launch. Apply burst limits and bot/repeat filtering; flag suspicious score bursts for moderator review. Never count founder/brand-owner engagement. Financial fields are separate from public profile output and private by default, with field-level explicit opt-in required before public serialization.
