# Plan mobile-first Gobang PWA deployment

## Goal

Plan and then build a mobile-first web Gobang game that can be pushed to GitHub
and deployed quickly through Cloudflare. The game should feel polished on phones,
support custom board effects based on stone patterns, and support offline play
where the platform allows it.

The first version should focus on classic single-device Gobang gameplay first:
placing stones, alternating players, detecting wins, undoing moves, starting a
new game, and fitting well on mobile. The user's main long-term goal is a
satisfying, mobile-first game feel with cool effects for placing stones,
detecting notable board shapes, and ending the game. Online mode and
Worker-backed voice undo are deferred to a later version.

## Confirmed Facts

- At planning time the repository had no application source files yet; the
  implementation now adds the first Vite React application source tree.
- The GitHub repository has already been created at
  `git@github.com:mathmonstergo/web-gobang.git`, and the user has configured a
  GitHub SSH key.
- The local project root has been initialized as a Git repository with the
  GitHub SSH remote configured.
- Project specs target a Cloudflare Workers full-stack architecture with React
  Router v7, Vite, TypeScript, TailwindCSS, shadcn/ui, Hono APIs, and static
  assets served from Cloudflare Workers. This first version uses a static Vite
  React single-screen app and defers React Router/API layers until there are
  multiple routes or online features.
- The implementation must be planned before code starts. This is a complex task
  because it spans frontend game UX, PWA/offline behavior, GitHub/Cloudflare
  deployment, and a board-state-driven visual effects system.
- The first implementation pass should prioritize the classic Gobang game loop,
  then add a lightweight first-pass ink-style placement effect preview once the
  game is playable. The full ink system remains iterative and must not block the
  core game.
- Cloudflare Pages Git integration deploys automatically from connected GitHub
  or GitLab repositories on every push to the configured production branch.
- Cloudflare Pages Functions run server-side code on the Cloudflare network
  using Cloudflare Workers under the hood.
- Cloudflare Workers AI exposes an `@cf/openai/whisper` automatic speech
  recognition model. Cloudflare docs show it returns a `text` transcription and
  can be called from Worker code through `env.AI.run(...)` when an AI binding is
  configured. This remains feasible for a future online-mode task, but is not in
  the first MVP.
- For Pages Functions, the Workers AI binding is configured through the
  Cloudflare dashboard. This is relevant for the deferred online-mode work.

## Feasibility Notes

- Offline browser play is feasible as a PWA using a web app manifest and service
  worker caching for static assets. Mobile users can add the app to the home
  screen. Android Chrome support is generally strong; iOS Safari supports
  install-to-home-screen and offline caching but has stricter storage/background
  behavior, so real-device verification is required.
- Custom effects such as a visual outline when three stones are connected are
  feasible because the board state can be analyzed after each move and rendered
  as CSS/canvas overlays.
- The proposed ink-style placement effect is technically feasible as a later
  Canvas 2D particle overlay with separate static board, static stones, and
  transient effect layers. It should be implemented after the basic game is
  playable.
- A future frontend online/offline feature switch is feasible. Offline mode can
  keep all core gameplay local. Online mode can later enable Worker API calls
  for features such as speech-gated undo.
- Voice-gated undo is feasible online in a future task, with caveats:
  - Browser microphone capture requires a secure context such as HTTPS and user
    permission.
  - `MediaRecorder` can record a `MediaStream` into `Blob` chunks, but supported
    audio MIME types vary by mobile browser and must be detected at runtime with
    `MediaRecorder.isTypeSupported(...)`.
  - Speech-to-text requires a backend model/provider, for example Cloudflare
    Workers AI if available for the account or another transcription API called
    from the Worker with a secret.
  - The phrase match should normalize punctuation and whitespace because speech
    recognition may return `我是猪。` or similar variants.
  - The feature cannot work fully offline unless a local on-device speech model
    is added, which would be too heavy for the first version.

## Requirements

- Mobile-first Gobang board with touch-friendly interaction and responsive
  layout.
- Core game loop playable without network after the app has been installed or
  cached by the browser.
- Visual effect system driven by board state, prioritizing:
  - basic stone placement feedback in the first pass;
  - a lightweight first-pass ink-style stone placement preview using a Canvas
    particle layer after classic gameplay is working;
  - notable shape effects such as connected three-stone hints;
  - a clear, polished victory/ending effect.
- GitHub-ready repository with Cloudflare deployment configuration.
- Local Git repository initialized with the GitHub SSH remote
  `git@github.com:mathmonstergo/web-gobang.git` before first push.
- First MVP does not include Worker APIs, microphone capture, online mode,
  speech-to-text, multiplayer, accounts, or cloud persistence.
- Local gameplay should include normal single-device controls such as new game
  and undo, without requiring online verification.
- Open-source Gobang examples may be reviewed for common UX and rule handling,
  but project code should be implemented locally and not copied from unknown or
  incompatible licenses.

## Acceptance Criteria

- [ ] The planning phase documents the MVP scope, offline behavior, deployment
      target, and visual effects priorities before implementation starts.
- [ ] The first MVP scope is clearly single-device/offline-first and excludes
      online Worker features.
- [ ] The plan identifies mobile browser risks for PWA install/offline caching.
- [ ] The plan defines effect categories for stone placement, notable shapes,
      and victory/ending states.
- [ ] The first implementation pass produces a playable classic local Gobang
      game before the ink-style placement preview is added.
- [ ] The first implementation pass includes a visible, mobile-conscious
      first-pass ink-style placement effect that can be refined later.
- [ ] Before implementation starts, create `design.md` and `implement.md` for
      the complex cross-layer work.
- [ ] After a full Trellis workflow is completed for this project, Codex sends a
      concise completion email using the personal `send-email-notification`
      skill. SMTP credentials must remain outside the project repository.

## Out of Scope For Initial Planning Unless Explicitly Added

- Multiplayer networking.
- User accounts, leaderboards, or persistent cloud saves.
- Fully offline speech recognition.
- Worker-backed voice-gated undo.
- Online mode and microphone capture.
- Production-grade ink audio, residual mist, shader/filter tuning, and
  long-running particle effects.
- Payment, analytics, or advertising.
- Project-scoped storage of personal SMTP credentials.

## Open Questions

- None blocking implementation. The user approved prioritizing classic Gobang
  basics first and keeping ink-style placement effects as the next visual
  priority.

## Research Sources

- Cloudflare Pages Git integration:
  https://developers.cloudflare.com/pages/get-started/git-integration/
- Cloudflare Pages Functions:
  https://developers.cloudflare.com/pages/functions/
- Cloudflare Workers AI bindings:
  https://developers.cloudflare.com/workers-ai/configuration/bindings/
- Cloudflare Workers AI Whisper model:
  https://developers.cloudflare.com/workers-ai/models/whisper/
- MDN getUserMedia documentation:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN MediaRecorder documentation:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- MDN PWA offline/background operation:
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
