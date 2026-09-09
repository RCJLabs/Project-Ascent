# Project Ascent

A fully-offline climbing training app: structured programs, a finder that picks the right
one for you, session logging, progress analytics, and a gamified layer where your real
climbing grows your climber. Plus The Ascent, a rest-day arcade climber.

No accounts, no servers, no API keys. Data lives on your device (IndexedDB) with
JSON export/import for backup. Ships as a PWA on GitHub Pages and a TWA on Google Play.

- `PLAN.md` — the full product and build plan.
- `AUDIT.md` — audit of the original AI Studio prototype this rebuild references.

## Develop

```
npm install
npm run dev        # dev server
npm test           # engine + storage tests (vitest)
npm run lint       # typecheck
npm run build      # production build to dist/
npm run icons      # regenerate public/icons (committed)
```

## Deploy

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/deploy.yml`
(Pages must be set to "GitHub Actions" source in repo settings). The app is served at
`/Project-Ascent/` with hash routing.

## Status

Milestone M0 (foundations): installable offline shell, IndexedDB schema v1 with
migrations, export/import with a real-data guard, theme system, UI kit, hash routing,
deploy pipeline. See PLAN.md §11 for the roadmap.
