# Implementation Plan

## Steps

1. Read frontend specs before editing.
2. Introduce scene layout support in `gobang-board.tsx`:
   - add `SceneLayout`;
   - add a `boardSurfaceRef`;
   - resize one fixed viewport canvas;
   - derive board size and board offset from `.board-surface` rect.
3. Remove overlay canvas architecture:
   - remove `createPortal` import and usage;
   - remove `overlayCanvasRef`;
   - remove `DrawOverlayCanvasInput`, `drawOverlayCanvas`, and
     `resizeOverlayCanvas`;
   - remove `.physics-overlay-canvas` CSS.
4. Convert reset wave and physics coordinates to scene space:
   - reset origin from button center converted into scene coordinates;
   - fallback origin as scene-space board center;
   - reset stones created at scene-space cell centers;
   - remove `boardOrigin` from reset/swat stone types;
   - apply impulses using scene positions;
   - board exit checks against scene-space board rect.
5. Convert undo cat swat to scene space:
   - convert removed stone position to scene point;
   - compute entry/swat/exit around scene-space board rect;
   - launch swatted stone into the same scene-space physics queue.
6. Restructure draw loop:
   - one animation frame updates physics and draws all layers;
   - board-local visuals are drawn under board transform;
   - reset wave crests, physics stones, and cat are drawn in scene space after
     board/grid/logical stones.
7. Update pointer hit testing:
   - subtract canvas rect and scene board offset before converting to row/col.
8. Update tests:
   - static markup contains `board-canvas`;
   - static markup does not contain `physics-overlay-canvas`;
   - existing reset crest helper test remains.
9. Run validation:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `git diff --check`
   - `curl -I http://localhost:5173/`
10. Commit and push to `origin/main`.
11. Send the required Chinese email notification after the complete Trellis
    flow.

## Risk Areas

- Scene/board offset must be applied exactly once.
- Reset and undo physics must never convert to viewport coordinates after
  creation.
- The fixed single canvas must not disrupt layout size, controls, or mobile
  touch placement.
- Reference zip files remain untracked and must not be staged.

## Rollback Point

Current pushed state before this task is `d04c657`.
