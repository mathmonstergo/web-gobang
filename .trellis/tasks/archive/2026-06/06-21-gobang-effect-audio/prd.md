# Add Gobang effect audio

## Goal

Add a first playable pass of responsive sound effects for the existing Gobang visual effects so the user can listen locally and tune the direction.

## Requirements

- Add placement sounds for stones.
- Add sound for 3/4/5 stone wave effects.
- Add sound for New Game shockwave crests.
- Add sound for physics stone collisions.
- Add cat footstep sounds during undo / "耍赖皮" cat movement.
- Add a swat/impact sound when the cat hits a stone away.
- Sounds must work with mobile browser audio restrictions by unlocking audio from user gestures.
- Mobile tap-to-place must continue to work while audio unlock and long-press preview are enabled.
- Long-press preview should be an additional precision mode with a larger rounded-square magnifier.
- Sounds must not require network access or external hosted assets.
- Keep the existing single-canvas rendering architecture.

## Acceptance Criteria

- [ ] First click/touch primes audio without blocking gameplay.
- [ ] Mobile short tap places a stone normally; long press shows the precision preview.
- [ ] Placing a stone plays a short stone placement sound.
- [ ] Shape/victory/replay wave effects play a soft wave sound.
- [ ] Each New Game shockwave crest plays a larger ripple sound once.
- [ ] Reset physics collisions play throttled collision taps without overwhelming audio.
- [ ] Undo cat movement plays footstep sounds and a swat impact when the stone is launched.
- [ ] Lint, typecheck, tests, build, and diff checks pass.

## Out of Scope

- Final sound design polish.
- External audio asset packs.
- User-facing volume/mute settings.
