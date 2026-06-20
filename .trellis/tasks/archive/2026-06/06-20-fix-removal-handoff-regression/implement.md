# Implementation Plan

## Steps

1. Read frontend/shared specs before editing.
2. Change reset orchestration:
   - make the board return a lock duration rather than a delayed-reset duration;
   - call `reset()` immediately after snapshotting;
   - keep placement/undo disabled while the overlay reset animation runs.
3. Change reset drawing:
   - replace the current Matter-based reset removal with reference-style custom impulse physics;
   - draw on-board reset stones on the main canvas in board-local coordinates;
   - draw water ripples and off-board falling/shrinking stones on the viewport overlay;
   - use one water ripple and one primary physical impulse;
   - keep on-board motion frictionless and non-rotating;
   - resolve collisions as equal-mass elastic collisions, with a small outward
     nudge only for near-zero-momentum edge cases.
4. Restore reference-style cat paw undo:
   - use quadrant corner entry/retreat in board-local coordinates;
   - draw the pink pad paw style from the reference;
   - stone copy is drawn at the original coordinate before paw grab;
   - no extra state clearing removes the animation copy.
5. Add/update focused tests for the pure helper contract if a helper is extracted.
6. Run:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `git diff --check`
7. Confirm `http://localhost:5173/` responds.
8. Commit and push after validation when the user explicitly requests it.

## Risk Areas

- Overlay coordinates are viewport coordinates; main canvas coordinates are board-local. Do not mix them.
- Immediate reset means the overlay must draw waiting stones; otherwise the original bug gets worse.
- If a near-zero collision edge case is not handled, a stone can remain on the board indefinitely.
- If reset lock duration is too short, the user can place new stones while old snapshot stones are still flying.

## Rollback Point

Last pushed work state is commit `325646e`.
