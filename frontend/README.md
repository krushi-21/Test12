# Aarambh Launch Platform — Frontend

React + TypeScript frontend with two intentionally separate local modes:

- **Static preview (`/`)**: bundled synthetic fixtures, local search/filtering, and read-only detail/profile/leaderboard pages. This remains the default and makes no API requests.
- **Interactive test preview (`/test`)**: API-backed Aarambh discovery homepage for businesses, launches, and founders, with direct founder search, popular categories, public-collection Local Guides, and the monthly business leaderboard. Its business-discovery page supports city/area, category, price, launch recency, engagement sort, verified-account, business-mode, radius, and open-now filters. It also retains the existing account/session, founder workspace, authoring, engagement, and detail flows. It is available through the backend's explicit opt-in runner; anyone with its test link can browse and modify shared synthetic data. App-level sign-in, verified-user requirements, and owner checks remain in force. A same-origin proxy keeps the API key server-side and protects state-changing requests. All records and messages are synthetic and disposable.

Never enter real personal information into either mode.

## Static preview

```bash
cd /workspace/frontend
npm run dev
```

The bundled fictional records live in `src/demo.ts`; local sample images are under `public/images/`. No backend is needed for `/`.

## Open synthetic interactive test preview

Use the paired runner documented in [`../backend/README.md`](../backend/README.md):

```bash
cd /workspace/backend
LAUNCH_TEST_PREVIEW=I_UNDERSTAND_THIS_IS_SYNTHETIC_DISPOSABLE \
TEST_PREVIEW_ORIGIN=http://localhost:4173 \
npm run test-preview
```

The `/test` link opens directly; no outer username/password or access file is required. Anyone who has the link can read and change the shared synthetic data, so share it only with people who may edit disposable test records. The app still requires sign-in for private account/workspace actions, verified synthetic accounts for likes/saves/publishing, and server-side ownership for edits. The runner uses a fresh in-memory SQLite database, local in-memory verification/reset outbox, disabled SMTP, and temporary uploads that are removed on stop. `/` remains the existing static read-only demo. Restarting the runner resets the test data. Do not deploy this configuration or use real personal information.

With the runner active, run `npm run test-preview-ui` to exercise anonymous browsing and the app's real account, engagement, publishing, and verification interactions.

## Validation

```bash
npm run build
npm run lint
npm run test-preview-proxy
npm run worker-test
npm run smoke
cd /workspace/backend && npm test
```

The standard frontend smoke covers the unchanged static mode and its local-only route harness. The proxy test verifies anonymous reads, origin/CSRF protections, and rate limits. The interactive runner additionally checks that app-level sign-in and authorization still protect actions. No old Worker is contacted or deployed by the interactive test setup.
