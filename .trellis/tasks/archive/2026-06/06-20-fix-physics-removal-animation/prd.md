# Fix reset and undo physics removal animation

## Goal

Fix the regression where New Game and Undo removal effects look like stones teleport away from the board. The removal motion must visually match the provided full-canvas prototype while using Matter.js for the physically driven part of the motion.

The user value is continuity: a stone should appear to remain the same physical object from rest, through impact/lift, through flight, and finally through falling out of view.

## Confirmed Facts

- The current board is full-canvas and uses a viewport overlay canvas for reset/undo physics.
- Current `playResetAnimation` immediately adds all current moves to `hiddenKeys`, and `GobangGame` immediately calls `reset()`.
- That means the main-board stones disappear immediately, while overlay stones take over. Even if overlay stones start at the same coordinates, the user perceives this as teleport/layer switching.
- The prototype New Game effect:
  - emits a ring from the New Game button;
  - keeps every stone drawn at its board position while waiting for the ring;
  - gives each stone an impact pulse when the ring reaches it;
  - then moves the stone outward with gravity.
- The prototype Undo effect:
  - removes logical state immediately;
  - draws the removed stone in a lift-off animation at the original board point;
  - it rises, scales, and fades.
- The user wants the prototype motion preserved, but with real physics for the removal/fall behavior.
- The current board leaves a fixed ring of small dots around the latest placed stone after the dynamic placement effect has ended. This is not the dynamic placement bloom itself; it is a persistent field ornament that should not exist.
- The Undo removal should become a cat-paw removal: a paw enters from the quadrant corresponding to the removed stone and carries the stone away at a matching angle.

## Requirements

- New Game must not look like stones instantly disappear from the board.
- New Game must visually restore the prototype timing:
  - shockwave starts at the New Game button;
  - stones remain at their original board intersections until the expanding ring reaches them;
  - each reached stone performs a short impact pulse;
  - after impact, the stone is pushed outward and then falls downward out of view.
- New Game physical motion must use Matter.js after impact:
  - stones are Matter bodies;
  - bodies can collide after activation;
  - gravity affects flight/fall;
  - stones leave the board before disappearing.
- The main board may reset logically immediately, but the departing stones must be copied and drawn from the first post-click frame so there is no visible gap or jump.
- Undo must preserve the prior prototype lift-off as the first phase:
  - the removed stone starts exactly at its board intersection;
  - it rises vertically with smooth scale motion;
  - only after the lift does it enter Matter.js throw/fall motion.
- Undo must not introduce a visual jump between the main-board stone and the animated removal copy.
- No static ring of small dots may remain around the latest placed stone after placement effects end.
- Dynamic placement bloom may still use prototype-style impact rings and soft ink/mist, but it must not leave persistent decorative points on the board.
- Undo must use a cat paw as the primary removal visual:
  - determine the removed stone's quadrant relative to the board center;
  - enter from the matching quadrant/outside corner with a distinct angle;
  - reach the stone without a coordinate jump;
  - visually grab/carry the stone away;
  - avoid a simple fade-only removal.
- Shape wave, victory replay, normal placement, storage, and Worker config stay unchanged.
- Existing `Mobile Web Go Game Design.zip` remains a local reference file and is not committed unless explicitly requested.

## Acceptance Criteria

- [ ] Clicking New Game with stones on the board shows the existing stones stay in place until the shockwave reaches them.
- [ ] New Game no longer has a visible first-frame disappearance or teleport into overlay animation.
- [ ] New Game stones impact pulse, move outward, collide plausibly, leave the board, then fall downward out of view.
- [ ] Undo starts with the removed stone lifting vertically from its exact board position before being thrown/falling.
- [ ] Undo no longer feels like a simple fade or immediate disappearance.
- [ ] No fixed ring of small dots remains around the latest placed stone after the placement animation ends.
- [ ] Dynamic placement bloom still feels like the prototype's impact/mist effect and does not leave static ornaments.
- [ ] Undo shows a cat paw entering from the removed stone's corresponding quadrant at a matching angle.
- [ ] The cat paw visually grabs/carries the removed stone away without coordinate jumps.
- [ ] Fast New Game/Undo clicks do not break active placement or wave effects.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Local dev server is available at `http://localhost:5173/` for Windows-side visual testing.

## Out of Scope

- Redesigning the whole page shell.
- Changing Gobang rules, win detection, storage format, PWA cache, or Cloudflare Worker deployment.
- Adding online/API features.
