# Design

## Architecture

The feature stays inside `GobangBoard` because it is an input and rendering concern for the existing single-canvas board. Game mutation still flows only through `onPlace(position)`.

No second canvas is introduced. The touch magnifier is modelled as transient canvas state and drawn by `drawMainCanvas` after the board and stones are rendered.

## Touch Placement State

Add a mutable `touchPlacementRef` with these states:

- `idle`: no active touch placement.
- `pressing`: a touch pointer is down and waiting for the long-press threshold.
- `previewing`: threshold elapsed, preview is visible, release may place if the candidate is valid.

The state stores:

- `pointerId`
- current finger scene point
- candidate board `Position | null`
- whether the current candidate is placeable
- timer id for long-press activation

React state is not used for every touch move. The canvas render loop already runs continuously and reads refs, so pointer moves can update refs without causing React re-renders.

## Event Flow

Mouse:

- `pointerdown` keeps current behavior: compute position and call `onPlace`.

Touch:

- `pointerdown`: capture pointer, compute candidate, start a 300ms timer, but do not call `onPlace`.
- timer fires: transition to `previewing` and draw the magnifier if the pointer is still active.
- `pointermove`: update finger scene point and candidate while pressing or previewing.
- `pointerup`: if `previewing` and candidate is empty, call `onPlace(candidate)`. Always clear timer/state.
- `pointercancel` / `pointerleave`: cancel and clear timer/state.

## Candidate Validation

`isPositionPlaceable(state, position)` checks:

- game status is `playing`
- position is not null
- target board cell is empty

The helper is pure and testable.

## Canvas Magnifier

`drawTouchMagnifier` receives the current touch preview and draws:

- an iOS-style circular lens offset above the finger.
- a clipped magnified board patch centered on the candidate intersection.
- the candidate ghost stone using `state.currentPlayer`.
- a small connector stem toward the finger.
- an invalid state when the candidate is occupied or outside the board.

The magnifier uses the same `layout` and `sceneLayout` as the board render, converting candidate board points through the existing scene transform. This avoids separate overlay coordinate systems.

## Compatibility

- Keyboard and mouse behavior remains unchanged.
- Existing effect queues are not mutated by preview movement.
- Board resizing is handled by the current render loop calling `resizeSceneCanvas`.

## Rollback

The change is localized to pointer handling, pure input helpers, and one canvas drawing function. Rollback is deleting the touch placement ref/state and returning `handlePointerDown` to immediate placement.
