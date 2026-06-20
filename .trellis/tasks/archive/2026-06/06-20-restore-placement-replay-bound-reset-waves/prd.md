# Restore placement replay and bound reset waves

## Goal

Restore the reference-style repeated placement wave replay and fix reset wave
physics so visible wave crests and physical impulses are bundled together.

## Confirmed Facts

- The reference zip schedules latest-stone replay at 2s, 5s, 10s, then every
  10s while play continues.
- Current `GobangBoard` only enqueues a shape wave once for a placement when
  `effects.shapeHints` is non-empty.
- Current victory replay still loops by `VICTORY_LOOP_MS`, but non-victory
  latest-placement replay is missing.
- Current reset visual uses one `WaterRipple` that draws multiple visual rings
  via `RIPPLE_VISUAL_RING_COUNT = 4`, but the desired count should not be fixed.
- Current reset physics schedules only one impulse per stone, so several visual
  rings do not have corresponding physical effects.
- The user wants reset force reduced and released as one physical wave crest
  every 1.5s, with visual and physics timing unified.
- The number of reset crests should be the minimum count needed to keep each
  crest's impulse visually acceptable while still guaranteeing stone departure.
- The user reports abnormal flicker/displacement when reset stones reach the
  board edge.
- The user reports a remaining subtle position jump at the board edge, caused
  by switching copied stones between clipped board-canvas rendering and
  full-viewport overlay rendering.
- The user reports a left shift at the moment a New Game wave hits a stone.
  Root cause: reset stones were rendered on the board canvas before activation
  and on the full-viewport overlay after activation, so impact caused a renderer
  and coordinate-space switch before the stone left the board.
- The user reports later reset crests applying force before the visible crest
  reaches already-moving stones.
- The third reference zip changes undo into a running cat that swats the removed
  stone away instead of carrying it.
- Replaying a move after undo must not cause the next real placement on the
  same coordinate and turn to lose its placement bloom.
- New Game interaction lock was too long because it waited for the full reset
  animation and fall fade, not just the moment when a fresh game can begin.
- Current app code no longer imports `matter-js` or `Matter`; only
  `package.json` and `pnpm-lock.yaml` still retain `matter-js` and
  `@types/matter-js`.
- Working tree currently has two untracked reference zip files. They are
  outside this task and should not be committed.

## Requirements

- Restore non-victory placement replay for the latest move:
  - replay at 2s after placement;
  - replay at 5s after placement;
  - replay at 10s after placement;
  - continue replaying every 10s after that;
  - cancel the old replay schedule when a new move, undo, reset, or victory
    supersedes the latest non-victory placement.
- After undo, if the new latest remaining move currently forms a replayable
  3/4/5 pattern, restore that move's delayed replay schedule using the same
  rules as the reference implementation.
- Real placement effects must use a unique event id even if the same turn and
  coordinate are reused after undo.
- Replayed placement waves should reuse the same wave-highlight semantics as
  the original placement:
  - only replay when the latest move has active shape hints;
  - preserve anchor-based wave timing from the latest move;
  - do not replay unrelated older shape hints.
- Reset wave visual and physics must be bound:
  - compute the reset crest count from the required departure impulse and a
    configurable per-crest impulse cap;
  - use the smallest crest count that keeps each crest at or below that cap
    while still clearing the board;
  - release one crest every 1.5s;
  - each visible crest schedules its own physical impulse on stones when that
    crest reaches the stone;
  - for stones already moving, crest impact must be evaluated against the
    stone's current position, not only its initial position;
  - reduce per-crest force compared with the current single-impulse reset so
    motion is less explosive while still clearing the board.
- Fix reset edge artifacts:
  - avoid center-point board-exit switching that causes sudden clipping or
    overlay jumps;
  - avoid switching reset stones from board canvas rendering to overlay
    rendering at the crest impact frame;
  - keep coordinate conversion stable when a stone crosses from on-board main
    canvas rendering to off-board overlay rendering;
  - no visible flash, sudden displacement, or black-edge flicker should happen
    at the board boundary.
- Replace undo removal with the third reference zip's running-cat swat effect:
  - cat enters from the removed stone's quadrant;
  - cat runs to the stone, winds up, swats, and exits;
  - the removed stone remains visually present until the swat moment;
  - at swat, the stone becomes a physics copy moving in the swat direction.
- Preserve the latest accepted reset constraints:
  - no spin/rotation;
  - smooth frictionless on-board motion;
  - equal-mass elastic collision behavior;
  - near-zero-momentum edge cases may receive a tiny outward nudge.
- Remove unused physics-library dependencies if they remain unused:
  - remove `matter-js`;
  - remove `@types/matter-js`;
  - update the lockfile through the package manager.

## Acceptance Criteria

- [ ] After a non-victory move that creates a 3/4/5 shape wave, the same latest
      move wave replays at 2s, 5s, 10s, then every 10s.
- [ ] Replay timers are cancelled and replaced after a new move.
- [ ] Replay timers are cancelled on undo, reset, and victory.
- [ ] After undo, the remaining latest move regains its 2s/5s/10s/every-10s
      replay loop when it has active 3/4/5 shape hints.
- [ ] Victory loop behavior remains independent and unchanged.
- [ ] New Game emits the minimum required number of bound reset wave crests
      spaced 1.5s apart, based on the configured per-crest impulse cap.
- [ ] Each visible reset crest has matching physical impulses; there are no
      visual-only rings and no invisible physics-only waves.
- [ ] Reset force is lower than the current single-wave implementation while
      still clearing stones from the board.
- [ ] Stones crossing the board edge do not visibly flicker, jump, or flash.
- [ ] Stones do not shift left when a New Game wave first activates their
      physics.
- [ ] A real placement on a previously undone coordinate still plays the
      placement bloom.
- [ ] New Game allows the first fresh placement after a short interaction lock
      rather than waiting for all old stones to finish falling/fading.
- [ ] `matter-js` and `@types/matter-js` are removed if no runtime/type import
      remains.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
      `git diff --check` pass.
- [ ] `http://localhost:5173/` remains reachable for local Windows-side testing.

## Out of Scope

- Changing game rules, win detection, or online/Worker features.
- Committing the reference zip files.

## Open Questions

- What should the initial per-crest impulse cap be for tuning? Recommended:
  choose a conservative constant in code for the first pass, then adjust after
  local visual testing instead of adding an in-game control.
