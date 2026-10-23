<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- UI-only phase: all data comes from `src/lib/demo.ts` fixtures and browser state in `src/lib/store.tsx` (useStore); replace these with API calls when the backend is wired, keeping component props unchanged.
- Read fixture records through `useDemo` when rendering editable content so preview edits and visibility changes reach every screen without changing card props.
- Keep preview image processing, URL/date validation, sharing, and unsaved-navigation handling in focused browser-safe helpers; persisted previews use compressed data URLs because blob URLs break on reload.
- Keep production indexing and production service claims disabled during the fixture-only phase; enable them only alongside verified production data.
- Use the canonical `/saved` route for saved businesses and launches; saved business IDs are namespaced so they cannot collide with launch slugs.
