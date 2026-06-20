# Design: Single canvas Gobang scene

## Boundary

Primary code boundary:

- `app/modules/gobang/components/gobang-board.tsx`
- `app/app.css`
- focused tests under `app/modules/gobang/components/`
- frontend spec update if the single-scene convention changes project rules

Do not change game rules, storage, Worker deployment, or API code.

## Root Cause

The current visual system mixes two coordinate spaces:

- board canvas coordinates inside `.board-surface`;
- viewport coordinates on a fixed overlay canvas mounted on `document.body`.

Reset/undo animations therefore require renderer handoff and coordinate
conversion. Moving the handoff later only moves the visible bug: the user still
sees offset or layering artifacts at board exit because the stone changes
rendering context.

## Architecture

Use a single canvas as the visual stage. The canvas remains owned by
`GobangBoard`, but its CSS box is fixed to the viewport. The square
`.board-surface` remains the accessible/touch target and reserves layout space.
Each frame/resize projects `.board-surface.getBoundingClientRect()` into the
viewport stage and draws the board at that rect.

Conceptual scene:

```text
viewport scene canvas
  ├─ board rect from .board-surface.getBoundingClientRect()
  ├─ board-local cell coordinates converted once to scene coordinates
  ├─ reset and swat physics positions stored in scene coordinates
  └─ off-board animation remains in scene coordinates
```

This removes:

- full-viewport overlay canvas;
- React portal;
- `boardOrigin` renderer conversion;
- any main-canvas/overlay handoff.

## Coordinate Contracts

`CanvasLayout` still describes board geometry:

- `size`
- `padding`
- `cellSize`

`SceneLayout` adds:

- `canvasWidth`
- `canvasHeight`
- `boardOffsetX`
- `boardOffsetY`

Rules:

- Board drawing happens under `context.translate(boardOffsetX, boardOffsetY)`,
  where offset values are viewport coordinates.
- Logical stone cell positions are computed with `getBoardPoint(...)` and then
  drawn under the board transform.
- Physics stones store scene-space `x/y` from creation onward.
- Reset wave origins are scene-space points.
- Pointer hit testing subtracts both the canvas DOM rect and the board offset.
- Canvas DPR scaling remains centralized in resize.

## Render Order

One frame should execute in this order:

1. Clear full scene canvas.
2. Translate to board offset and draw board background/grid.
3. Draw logical stones under board transform unless hidden by active animation.
4. Draw last-move marker, hover, and focus under board transform.
5. Draw placement blooms and wave highlights under board transform.
6. Draw reset wave crests in scene space.
7. Update and draw reset/undo physics stones in scene space.
8. Draw cat swat removals in scene space.

The reset/undo physical stones are drawn after board/grid so off-board stones
never appear under edge lines.

## Reset Physics

Current reset physics can remain custom, but its coordinates must change:

- reset stones are created at scene-space cell centers;
- impulses use scene-space origin and scene-space stone positions;
- board collision and exit checks compare against a scene-space board rect;
- when a stone exits board bounds, only `isOnBoard/depth` changes, not renderer
  or coordinate system;
- depth/fall still changes scale/alpha without rotation.

## Undo Cat Swat

Cat path and swatted stone use scene-space points:

- removed stone cell center converted to scene point;
- cat entry/swat/exit calculated relative to the scene-space board rect;
- swatted stone is added to the same physics stone queue in scene coordinates.

## CSS

`.board-surface` should not own visible board chrome that can conflict with the
canvas render. It should remain the layout, focus, and pointer target. The
single `board-canvas` uses `position: fixed; inset: 0; pointer-events: none;`
and draws transparent pixels outside active scene content.

## Compatibility

- Existing game layout size remains based on `.board-shell`.
- Existing buttons and status UI stay unchanged.
- Existing static-markup test should continue to find `board-canvas`.
- Tests should assert there is no `physics-overlay-canvas` or `<svg>`.

## Risks

- Pointer hit testing can be off if board offset is not applied consistently.
- Resize must keep canvas CSS dimensions, DPR buffer, board offset, and board
  layout in sync.
- Drawing reset wave crests in scene space must preserve timing and force
  behavior.

## Rollback

Rollback commit before this task: `d04c657`.
