# Design: Replay scheduler and bound reset wave crests

## Boundary

Keep changes in the Gobang frontend animation layer:

- `app/modules/gobang/components/gobang-board.tsx`
- focused helper tests in `app/modules/gobang/components/gobang-board-render.test.ts`
- no game-rule, storage, Worker, route, or deployment changes

## Placement Replay

Current state:

- placement bloom runs once per `effects.placement`;
- shape wave runs once per placement when `effects.shapeHints` is non-empty;
- victory replay has its own interval;
- non-victory latest-placement replay is absent.

Target:

- store the latest non-victory replayable wave snapshot in board-local
  animation state;
- schedule timeouts for +2s and +5s;
- schedule +10s, then start a 10s interval;
- clear this schedule when a new placement arrives, when undo/reset removes the
  latest move, or when victory starts;
- re-enqueue the same wave highlights against current `state.moves` so removed
  stones are not animated.
- when undo promotes the previous move back to "latest", recompute that move's
  current shape hints and restart the delayed replay schedule if it still has a
  3/4/5 pattern.

Replay data should be derived from the current `effects.shapeHints` and
`state.moves` at placement time, not recomputed from stale board state later.

## Reset Wave Binding

Current state:

- one `WaterRipple` object visually draws four concentric rings;
- reset physics schedules one impulse per stone;
- therefore three visual rings are not physical waves.

Target:

- model reset waves as `ResetWaveCrest` events:
  - `origin`
  - `startedAt`
  - `maxRadius`
  - `forceMultiplier`
- compute the number of crests from the required departure impulse and a
  configured per-crest impulse cap;
- create the smallest number of crests needed to keep each crest below the cap;
- space crests by `RESET_WAVE_INTERVAL_MS = 1500`;
- draw one visual crest per event, not multiple rings inside one event;
- schedule one impulse per stone per crest, timed by distance from the same
  crest origin and speed used by the visual renderer;
- reduce per-crest force by splitting the required departure impulse over the
  computed crests, while keeping the existing exit-speed floor so board clearing
  remains reliable.

This makes the visible wave and physics wave the same object in time and space:
if physics needs N crests, the user sees N crests; no visual-only or
physics-only rings are emitted.

## Edge Handoff

Current risk:

- stones switch from main canvas rendering to overlay rendering when their
  center leaves `0..boardSize`;
- the board canvas is clipped while overlay rendering is not;
- switching exactly at the center can make the stone appear to jump or flash at
  the edge.

Target:

- consider a stone on-board until its center has passed `-radius` or
  `boardSize + radius`;
- preserve the same board-local `x/y` and `boardOrigin` when switching to
  overlay;
- overlay draws at `boardOrigin + x/y`, so no coordinate recomputation jump
  occurs;
- do not rotate reset stones.

Final target after impact-jump debugging:

- draw copied reset stones on the board canvas while `isOnBoard` is true,
  including after a crest activates their velocity;
- draw reset stones on the full-viewport overlay only after they have fully
  left the board and entered the falling/depth phase;
- keep undo/swat physics copies on the overlay because the cat animation owns
  visual continuity at swat time;
- preserve board-local `x/y` and `boardOrigin` when switching to overlay so the
  off-board fall starts from the same physical position;
- evaluate each reset crest impact against the stone's current viewport
  position every frame. A later crest must not apply force until the visible
  crest catches the moving stone.

Reason: rendering reset stones on the board canvas until off-board avoids the
board-canvas to full-viewport-overlay coordinate switch at the exact impact
frame. That switch caused the visible left shift reported during New Game.

## Undo Cat Swat

The third reference zip replaces the carry-away cat paw with a running cat:

- spawn from the removed stone's quadrant;
- run in, wind up, swat, recover, and run out;
- draw the removed stone in the cat animation until swat;
- at swat, push a physics copy with velocity in the cat heading direction;
- the removed logical stone can stay hidden because the cat animation owns its
  visual continuity.

## Compatibility

- Existing victory replay stays as-is.
- Existing line-wave scaling helpers stay as-is.
- Existing reset lock duration should include the final crest travel time plus
  fall duration so users cannot place new stones while old stones are visible.

## Dependency Cleanup

Matter.js was previously added for reset/undo physics, but the current reset
effect uses custom canvas physics and the current app code has no `matter-js`
imports. If implementation confirms no remaining references, remove
`matter-js` and `@types/matter-js` with the package manager so `package.json`
and `pnpm-lock.yaml` stay consistent.

## Rollback

The last pushed baseline before this task is `4019f96`.
