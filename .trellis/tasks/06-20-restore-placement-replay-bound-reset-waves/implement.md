# Implementation Plan

## Steps

1. Read frontend/shared specs before editing.
2. Add latest-placement replay state in `gobang-board.tsx`:
   - refs for timeout ids and interval id;
   - a replay snapshot type storing player/highlights/latest placement id;
   - cleanup helper for all replay timers.
3. Restore replay scheduling:
   - when a non-victory placement creates shape highlights, enqueue immediate
     wave and schedule +2s/+5s/+10s/then every 10s replay;
   - clear and replace timers on each new placement;
   - clear timers when state has no moves, on reset animation, on undo removal,
     and when victory starts.
   - after undo, expose the remaining latest move to the effects layer and
     restart its replay schedule if it has current 3/4/5 shape hints.
4. Refactor reset water ripples:
   - rename or replace `WaterRipple` with a single-crest reset wave type;
   - remove internal multi-ring loop from `drawWaterRipple`;
   - compute the minimal crest count from required departure impulse and a
     configurable per-crest impulse cap;
   - create that many crest events spaced 1500ms apart;
   - store matching per-stone impulse intents for each crest with the same
     `startedAt`, `origin`, and `RIPPLE_SPEED`;
   - apply each impulse only when the moving stone's current position is reached
     by that visible crest.
5. Tune reset force:
   - lower per-crest force relative to current single-wave value;
   - split each stone's required impulse across the computed crest count;
   - keep exit-speed floor and zero-momentum nudge.
6. Fix edge handoff:
   - render copied reset stones on the board canvas while they are still
     `isOnBoard`, even after physics activation;
   - render reset stones on the viewport overlay only after they leave the
     board and begin falling;
   - keep undo cat-swat physics stones on the viewport overlay from the swat
     moment;
   - keep board-local coordinates unchanged for overlay conversion;
   - avoid changing renderer at the reset crest impact frame.
6a. Replace undo carry-away cat paw with the third reference zip's running cat
    swat effect and launch the removed stone into the shared physics queue.
7. Remove unused physics dependency if still unused:
   - re-run `rg "matter-js|Matter\\b|matter" app package.json pnpm-lock.yaml`;
   - if no app import remains, run `pnpm remove matter-js @types/matter-js`;
   - verify `package.json` and `pnpm-lock.yaml` update cleanly.
8. Add/update focused tests where practical:
   - helper for replay schedule timings if extracted;
   - helper/constants for reset crest timings if extracted.
9. Run:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `git diff --check`
10. Confirm `http://localhost:5173/` responds.

## Risk Areas

- Timers must be cleared on unmount, reset, undo, and victory to avoid ghost
  waves.
- Replay should animate only still-existing latest wave stones.
- Reset crest visual and physics must use the same timing source.
- Reset impact should not switch a stone from board canvas rendering to overlay
  rendering; that renderer switch creates lateral jumps.
- Edge handoff should not duplicate draw the same stone on both canvases.
- Do not remove dependencies by hand-editing lockfile; use pnpm.

## Rollback Point

Current pushed state is commit `4019f96`.
