# Implementation Plan

## Checklist

- [x] Create the Web Audio synth module.
- [x] Prime audio from board and control user gestures.
- [x] Hook placement, wave, reset crest, collision, cat footstep, and cat swat events.
- [x] Add per-event throttles / one-shot guards.
- [x] Run quality checks.

## Validation

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

## Manual Check

- Open `http://localhost:5173/`.
- Click/touch once to unlock audio.
- Verify placement, wave, New Game, collision, and undo cat sounds are audible.
