# Implementation Plan

## Checklist

- [x] Add pure helper types/functions for touch placement candidate validation.
- [x] Add touch placement refs and cleanup helpers to `GobangBoard`.
- [x] Split pointer handling so mouse remains direct and touch uses long-press preview.
- [x] Add the canvas magnifier drawing path inside the single `drawMainCanvas` render.
- [x] Add focused unit tests for helper behavior and preserve single canvas markup test.
- [x] Run quality checks.

## Validation Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

## Risk Points

- Pointer capture must be released safely even when pointer cancellation happens.
- The preview must not call `onPlace` twice when touch events generate compatibility mouse events.
- The magnifier must use scene-space coordinates, not a DOM overlay coordinate system.
- Touch cancellation must clear pending timers to avoid stale previews after reset/unmount.
