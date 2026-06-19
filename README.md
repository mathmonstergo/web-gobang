# Web Gobang

Mobile-first Gobang built as a static Vite React app for GitHub and Cloudflare
Pages.

## Features

- Local 15x15 Gobang gameplay.
- Black/white turn alternation, undo, new game, and win detection.
- Connected-three board hints and winning-line highlight.
- First-pass canvas ink placement effect.
- PWA manifest, service worker app-shell caching, and local game persistence.

## Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Cloudflare Pages

- Repository: `mathmonstergo/web-gobang`
- Build command: `pnpm build`
- Build output directory: `dist`
- Production branch: `main`

The first version is static and does not require Worker API routes. Future
online features can add `/api/*` routes without changing the local game loop.
