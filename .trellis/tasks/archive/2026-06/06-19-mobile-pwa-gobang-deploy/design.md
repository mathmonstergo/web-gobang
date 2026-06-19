# Mobile-First Gobang PWA Design

## Architecture

Use a Cloudflare Pages project connected to GitHub for automatic deployment.
Static frontend assets are built from the repository and deployed by Pages. The
first MVP is a single-device game and does not require a Worker API.

The repository remote target is:

```text
git@github.com:mathmonstergo/web-gobang.git
```

Implemented stack for the first MVP:

- Vite + React + TypeScript for the single-screen frontend.
- TailwindCSS v4 for layout/styling, with small custom components instead of
  shadcn/ui because the first UI is a focused game surface.
- A PWA service worker for app-shell caching and offline startup.
- Pure TypeScript game and effect logic that can be tested without React.
- Canvas 2D should be added as a transient top overlay for a lightweight
  first-pass ink-style placement preview after the classic game is playable.
  The first playable pass should not depend on the canvas layer.

React Router v7 remains a good fit when the app adds separate settings, online
mode, account, or API-connected screens. Avoiding it in the first single-route
version keeps the bundle and routing surface smaller.

## Route Boundaries

- Frontend routes render UI and stay outside the `/api/*` namespace.
- Initial frontend route can be a single `/` game screen.
- No API routes are required for the first MVP.

If online features are added later, Worker/API routes should live under
`/api/*` to avoid frontend/API namespace collisions.

## Core Game Model

Represent the Gobang board as pure TypeScript state:

- `board`: 15 by 15 cells, each empty/black/white.
- `currentPlayer`: black or white.
- `moves`: ordered move history.
- `winner`: absent until five-or-more connected stones are detected.
- `effects`: derived visual effects from the current board.

Game logic should be framework-independent:

- validate moves;
- place stones;
- undo moves;
- detect wins;
- detect custom patterns such as connected threes.

The UI calls pure game functions and renders the returned state. This keeps
tests small and prevents visual effects from mutating game rules.

## Effect Model

Effects should be derived from game state and recent actions:

- `placement`: created when a stone is placed.
- `shape`: created when a notable pattern exists, starting with connected-three
  groups.
- `victory`: created when a player wins.

Effect descriptors should include board coordinates, owning player, priority,
and animation key. Rendering code can choose CSS/SVG/canvas implementation
without changing game rules.

Initial effect priorities:

1. Victory effects override all shape hints.
2. Latest placement feedback is brief and does not change board layout.
3. Shape hints can persist until the board state changes.

First pass effect scope:

- Place stones with a clear visual response.
- Render a lightweight Canvas ink burst for each placed stone after the core
  game loop is working.
- Highlight the winning line.
- Keep the board readable and mobile responsive.

First-pass ink placement direction:

- Add a top Canvas layer that renders only transient placement particles.
- Keep static board and static stones separate from dynamic particles.
- Model the effect in phases: touch impact, ink spread, collapse, and residual
  fade. Residual mist can be represented as a short-lived fade in this version.
- Keep particle count conservative for phones and clear the canvas after each
  burst.
- Use local redraw regions around the placed stone if performance requires it in
  later tuning.
- Defer Web Audio or pooled audio until placement sounds are explicitly added.

## Mobile Board UI

The first screen should be the playable game, not a landing page.

Recommended board rendering:

- A square board container with `aspect-ratio: 1 / 1`.
- Touch target geometry derived from container size, not viewport font scaling.
- Stones rendered as stable positioned elements or SVG/canvas primitives.
- Pattern effects rendered in a separate overlay layer so they can be changed
  without changing game logic.

Stone placement effect:

- A quick drop/pop animation on the new stone.
- A short glow or ripple centered on the placed intersection.
- A first-pass ink burst rendered on the overlay canvas after the stone is
  placed.
- Optional subtle haptic-friendly visual pulse without depending on vibration
  APIs.
- Advanced ink diffusion, branching, audio, and long residual mist effects are
  deferred until after the first visual preview is validated.

The first custom effect is a connected-three outline:

- After each move, scan four directions: horizontal, vertical, diagonal down,
  diagonal up.
- For each same-color group of exactly three connected stones, emit a line or
  frame effect with start/end board coordinates.
- Render it as an SVG stroke/rounded frame with padding around the stones.
- Win effects should take priority over three-stone hints.

Victory/ending effect:

- Highlight the five-stone winning line.
- Freeze further placement.
- Add a short board-level finale animation that does not hide the final board
  state.
- Show restart/undo controls in a stable layout after the animation.

## Offline And PWA Behavior

Offline mode is for core local gameplay only.

PWA requirements:

- `manifest.webmanifest` with app name, icons, theme color, display mode, and
  start URL.
- A service worker caches static app-shell assets.
- Navigation fallback returns the app shell while offline.
- Game state is persisted locally so browser reloads do not lose an in-progress
  local game.

Expected behavior:

- After first successful load, the user can reopen the app without network and
  play local games.
- Offline startup depends on browser support and prior caching. Android Chrome
  should be strong; iOS Safari requires real-device verification.

## Deployment

Local setup:

- initialize Git in `/home/imsen/web-gobang`;
- add remote `origin` as `git@github.com:mathmonstergo/web-gobang.git`;
- commit and push to the production branch, likely `main`.

Cloudflare setup:

- Create a Pages project from GitHub repo `mathmonstergo/web-gobang`.
- Build command should match the scaffold, expected `pnpm build`.
- Build output directory should match the scaffold, expected `dist` for a Vite
  SPA or the framework-specific output if React Router framework mode is used.

## Completion Notification

The user wants an email after each full Trellis workflow completes for this
project. This is a Codex personal-layer workflow, not application functionality.
Use the personal `send-email-notification` skill and keep SMTP credentials in
Codex-private local configuration outside this repository.

## Trade-Offs

Cloudflare Pages is chosen for the MVP because it directly supports
GitHub-based deploys. Pages Functions can be added later if online features
return. The first MVP should stay static/offline-first because the user's
priority is polished single-device gameplay and visual effects.

Voice-gated undo is deferred because it increases risk through microphone
compatibility, Workers AI access, and real-device testing. The core game and PWA
can be completed and verified independently from that online feature.
