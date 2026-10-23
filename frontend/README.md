# Naviraa frontend

TanStack Start, React, TypeScript and Tailwind CSS interactive frontend preview.

All business/founder/launch records are fictional fixtures. Account, email, review/report, reminder and publishing journeys are browser-only simulations. Data is not shared between devices. This is **not production-ready** without the deferred services.

## Local development

```sh
bun install
bun run dev
bun run test
bun run lint
```

The development server and automatic build/typecheck are managed by Lovable in the editor.

## Architecture and release status

Read `AGENTS.md` before changing the app, `roadmap.md` for scope/blockers and `RELEASE_READINESS.md` for checked flows and production handoff requirements.

Fixture data is in `src/lib/demo.ts`. Browser state and merged preview records are in `src/lib/store.tsx`. Reusable card props stay stable for future production wiring.

Git synchronization and release branch selection are managed through Lovable **Project settings → Git**; source in this sandbox is not a manually pushable GitHub checkout.
