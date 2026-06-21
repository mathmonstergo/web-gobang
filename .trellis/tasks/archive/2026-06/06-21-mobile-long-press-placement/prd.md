# Add mobile long press placement

## Goal

Improve mobile placement accuracy for the Gobang board by changing touch placement from immediate tap-to-place to a long-press preview flow that behaves like the iOS text magnifier: hold to inspect the target intersection, drag to adjust, then release to place.

## Confirmed Facts

- The Gobang board uses a single fixed viewport canvas for board, stones, effects, reset physics, and undo cat animation.
- `.board-surface` is the accessible pointer target, and its bounding rect defines the board's scene-space canvas position.
- Current pointer handling places immediately on `pointerdown`, which makes nearby-cell mistakes easy on phones.
- Existing game rules and effect state are separate from canvas rendering and should remain separate.

## Requirements

- Touch input must not place a stone on `pointerdown`.
- Touch input must require a short long-press before showing the placement preview.
- Once the long-press preview is active, moving the finger must update the candidate intersection.
- Releasing the active touch over an empty intersection must place the stone at the currently previewed position.
- Releasing before long-press activation, moving outside the board, or releasing on an occupied point must cancel without placing.
- Mouse users should keep the current direct click-to-place behavior.
- Pen input should use the same precise direct placement behavior as mouse unless the browser reports it as touch-like.
- The magnified preview must be rendered inside the existing single canvas scene, not as a second overlay canvas or portal.
- The preview must remain aligned with the board under viewport resizing and WSL/browser differences.
- Keyboard placement and existing animations must keep their current behavior.

## Acceptance Criteria

- [ ] On a touch device, tapping briefly on the board does not place a stone.
- [ ] On a touch device, holding on a valid empty intersection shows a magnified circular preview above the finger.
- [ ] While holding, dragging within the board updates the previewed intersection smoothly.
- [ ] Releasing after long-press activation places exactly one stone at the previewed empty intersection.
- [ ] Releasing on an occupied intersection or outside the board cancels without placing.
- [ ] Mouse click placement still works on desktop.
- [ ] The board still renders through a single `.board-canvas`.
- [ ] Lint, typecheck, tests, and production build pass.

## Out of Scope

- Online mode, speech undo verification, backend APIs, and multiplayer.
- Replacing the existing reset physics or cat undo animation.
- Adding a separate DOM or canvas overlay for the magnifier.
