# Unify gobang canvas scene

## Goal

Refactor the Gobang board visual layer to a single Canvas scene so all board,
stone, wave, reset-physics, and undo-cat visuals share one coordinate system
and one deterministic draw order.

## User Value

The user wants highest-quality animation code, not another local workaround.
New Game and Undo effects must not show lateral jumps, layer handoff artifacts,
or border/grid occlusion glitches when stones leave the board.

## Confirmed Facts

- Current `GobangBoard` uses two canvases:
  - `.board-canvas` inside `.board-surface`;
  - `.physics-overlay-canvas` portaled to `document.body`.
- Current reset/undo physics stores `boardOrigin` and converts board-local
  stone positions into viewport coordinates when drawing on the overlay.
- Current `.board-surface` uses `overflow: hidden`, border radius, and visual
  border styles. That makes board-canvas clipping and overlay drawing behave
  differently.
- Previous fixes moved the renderer handoff from "wave impact" to "board exit",
  but did not remove the handoff. The user still sees offset/occlusion artifacts
  as stones leave the board.
- The existing game rules, persistence, replay timers, reset waves, and cat swat
  behavior should remain functionally intact.
- Three reference zip files are present as untracked local assets and must not
  be committed.

## Requirements

- Use a single canvas for the playable Gobang scene.
- Remove the full-viewport portaled physics overlay canvas from
  `GobangBoard`.
- Use one stable scene coordinate system for:
  - board background and grid;
  - static stones;
  - placement bloom;
  - 3/4/5 wave pulses and replay waves;
  - New Game reset wave crests;
  - New Game physical stones before and after they leave the board;
  - Undo running-cat swat and swatted stone.
- Do not convert reset/undo stones between board-local and viewport coordinates
  during animation.
- Do not switch a stone between canvases or rendering layers during reset/undo
  animation.
- Allow the single canvas to render visual content outside the board rectangle
  so stones can leave the board without being clipped by `.board-surface`.
- Preserve deterministic draw order inside one render pipeline:
  - board and grid first;
  - non-hidden logical stones;
  - hover/focus markers;
  - placement/wave effects;
  - reset wave crests;
  - reset/undo physical stones;
  - undo cat on top of its swat interaction where appropriate.
- Keep game rules in `game-logic.ts` and hooks; the canvas component may
  snapshot move data for animation but must not mutate rule state directly.
- Keep mobile-first behavior: touch placement, responsive board sizing, and
  local testing at `http://localhost:5173/` must continue to work.
- Preserve existing replay requirements:
  - latest placement wave replay at 2s, 5s, 10s, then every 10s;
  - undo-restored latest replay where applicable;
  - victory replay remains independent.
- Preserve existing physics constraints:
  - no spin/rotation for reset stones;
  - smooth low-friction movement;
  - collision handling while stones are on board;
  - near-zero momentum nudge as a fallback;
  - reset wave crests stay visually and physically bound.

## Acceptance Criteria

- [ ] `GobangBoard` renders exactly one canvas and no longer imports or uses
      `createPortal`.
- [ ] `.physics-overlay-canvas` CSS is removed or unused.
- [ ] Reset stones do not store or use `boardOrigin` for renderer handoff.
- [ ] New Game stones remain in the same scene coordinate system from click,
      through wave impact, through board exit, and through fall/fade.
- [ ] Undo cat and swatted stone remain in the same scene coordinate system for
      their full animation.
- [ ] No visible left/right offset occurs when reset waves hit stones or when
      stones leave the board.
- [ ] Stones leaving the board are drawn above board/grid visuals and are not
      clipped by the board border or dropped below edge lines.
- [ ] Existing Gobang rules, placement, undo, reset, replay, and victory
      behavior remain intact.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
      `git diff --check` pass.
- [ ] `http://localhost:5173/` remains reachable for Windows-side local
      testing.
- [ ] Work is committed and pushed to GitHub `main`.

## Out of Scope

- Changing Gobang rules.
- Adding online/Worker APIs.
- Replacing the current cat artwork or reset force tuning beyond what is needed
  for the unified scene.
- Committing local reference zip files.
