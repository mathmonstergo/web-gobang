# Web Gobang

一个移动端优先的网页五子棋项目。当前版本是静态 Vite React 应用，
适合通过 GitHub 连接 Cloudflare Pages 快速部署。

## 功能

- 本地 15x15 五子棋单机玩法。
- 黑白轮流落子、悔棋、新局和胜负检测。
- 3/4/5 连线触发连续动态特效，胜利时保留胜利线高亮。
- 首版 Canvas 水墨落子特效。
- PWA manifest、Service Worker 应用壳缓存和本地棋局持久化。

## 本地开发

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Cloudflare Pages 部署

- 仓库：`mathmonstergo/web-gobang`
- Framework preset：`Vite`
- Build command：`pnpm build`
- Build output directory：`dist`
- Production branch：`main`
- Root directory：`/`
- Environment variables：当前不需要

当前第一版是静态单机游戏，不需要 Worker API 路由。后续如果加入在线模式、
语音悔棋、Workers AI 或其他后端交互，可以再增加 `/api/*` 路由，
不会影响现有本地游戏循环。
