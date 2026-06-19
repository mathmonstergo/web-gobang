# Implementation Plan

## Scope

Build the first mobile-first Gobang web app from an empty repository, prepare it
for GitHub and Cloudflare Pages deployment, add PWA offline support, and focus
the first pass on classic single-device gameplay. After the core game is
playable, add a lightweight first-pass Canvas ink placement effect preview.

## Ordered Checklist

### 1. Repository And Tooling

- Initialize a local Git repository in `/home/imsen/web-gobang`.
- Add remote `origin` as `git@github.com:mathmonstergo/web-gobang.git`.
- Scaffold a TypeScript frontend app using the project-compatible stack. For
  the first single-screen version, use static Vite React without React Router
  and add routing later when multiple routes exist.
- Add package manager metadata and scripts:
  - `pnpm dev`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm typecheck`
- Configure Vite, TypeScript path alias, TailwindCSS v4, and Cloudflare build
  compatibility.
- Add `.gitignore` entries for local secrets such as `.env`, `.dev.vars`, and
  build output.

### 2. Core Game Logic

- Create a pure TypeScript game module for board state, moves, undo, win
  detection, and pattern detection.
- Create a pure TypeScript effect derivation module for placement, connected
  threes, and victory effects.
- Add tests for:
  - legal and illegal moves;
  - horizontal, vertical, and diagonal wins;
  - undo behavior;
  - connected-three detection;
  - victory effect priority over shape hints.
- Keep game logic independent of React and DOM APIs.

### 3. Mobile Game UI

- Build the first screen as the playable Gobang board.
- Use stable responsive board dimensions with touch-friendly controls.
- Add local game controls:
  - new game;
  - undo;
  - current player/status display.
- Render stones, placement feedback, connected-three effects, and victory
  effects in stable layers.
- Ensure text and controls fit on mobile viewports without overlap.

### 4. First-Pass Visual Feedback

- Implement stone placement animation:
  - brief drop/pop on the new stone;
  - centered ripple or glow that fades without shifting layout.
- Implement a lightweight Canvas ink placement preview:
  - draw transient particles centered on the latest placed intersection;
  - use black/white-specific particle colors and spread behavior;
  - fade and clear the overlay after the burst;
  - keep particle count low enough for mobile.
- Implement connected-three shape hint:
  - detect exactly three connected stones by direction;
  - draw a simple line/frame overlay around that pattern;
  - clear/recompute hints after every move and undo.
- Implement victory ending:
  - highlight winning line;
  - freeze further placement;
  - show a basic board-level victory response;
  - keep final board state readable after the animation.
- Respect `prefers-reduced-motion` with a calmer effect mode.

### 5. Deferred Ink Placement Polish Notes

- Improve the Canvas top layer after the first preview is validated.
- Add richer particle behavior for ink spread, collapse, and residual mist.
- Keep static board and stones out of the effect canvas.
- Consider black/white parameter differences:
  - black: sharper, faster, darker particles;
  - white: softer, slower, blurred particles.
- Defer placement audio, Web Audio pooling, and long-running residual emitters
  until a later visual polish pass.
- Avoid copying open-source effect code unless the license is reviewed and
  compatible.

### 6. PWA And Offline

- Add web app manifest and icons.
- Register a service worker.
- Cache the app shell and static assets.
- Add navigation fallback for offline startup.
- Persist local game state in browser storage.

### 7. Deployment

- Document Cloudflare Pages setup:
  - connect GitHub repo `mathmonstergo/web-gobang`;
  - production branch `main`;
  - build command from scaffold, expected `pnpm build`;
  - output directory from scaffold.
- Push initial commit to GitHub.
- Confirm the project can be connected to Cloudflare Pages.

### 8. Completion Notification

- After the full Trellis workflow is complete, send a concise email summary with
  the personal `send-email-notification` skill.
- Do not write SMTP credentials into the project repository.

## Validation Commands

Run the commands that exist after scaffold:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual checks:

- Desktop browser game loads and basic moves work.
- Mobile viewport screenshot shows no overlapping controls.
- Touch placement lands on intended board cells.
- Stone placement animation plays without moving board geometry.
- Ink placement preview appears on recent moves and disappears cleanly.
- Three-in-a-row highlight appears and clears correctly.
- Victory line and ending effect appear when five connected stones are formed.
- `prefers-reduced-motion` mode remains usable.
- Offline reload works after first successful load.

## Risk Areas

- PWA offline behavior differences between Android Chrome and iOS Safari.
- Board touch precision on small screens.
- Animation performance on low-end mobile devices.
- Visual effects hiding important board state if overlays are too aggressive.

## Rollback Points

- If advanced effects hurt mobile performance, keep the effect model but reduce
  animations to opacity/transform-only CSS.
- If service worker caching causes stale build issues, temporarily disable the
  service worker while keeping the game playable in the browser.
- If GitHub/Cloudflare deploy setup is delayed, keep local build fully working
  and push once access is confirmed.

## Pre-Start Review Gate

Before running `task.py start`, confirm:

- first pass is classic local Gobang with basic feedback before advanced
  ink-style polish;
- the first-pass Canvas ink placement preview is allowed after gameplay works;
- the user is ready for implementation to create source files and initialize
  Git.
