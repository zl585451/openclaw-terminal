# 2026-04-28 低风险依赖统一（第一阶段）

## 本次目标

在不引入大版本迁移的前提下，先收敛一批重复且低风险的依赖，降低维护复杂度：

- 统一根目录与 `oct-gateway/` 的 `dotenv`
- 统一根目录与 `oct-gateway/` 的 `ws`
- 让根目录 `@types/node` 与当前 Node 24 LTS 运行时对齐

## 具体调整

- [package.json](/E:/windows-window/OpenClaw-Terminal/package.json:1)
  - `dotenv`：`^16.3.1` -> `^16.6.1`
  - `ws`：`^8.16.0` -> `^8.20.0`
  - `@types/node`：`^20.10.0` -> `^24.12.2`
- [oct-gateway/package.json](/E:/windows-window/OpenClaw-Terminal/oct-gateway/package.json:1)
  - `dotenv`：`^16.4.5` -> `^16.6.1`
  - `ws`：`^8.17.0` -> `^8.20.0`

## 说明

- 本次没有升级 React / Vite / Electron / TypeScript 主版本
- `undici` 仍保持根目录 `6.x`、gateway `7.x` 的分层状态，避免跨主版本统一带来额外风险
- lockfile 的较大 diff 主要来自在 Node 24 / npm 11 环境下重新解析和收敛可选平台包，不代表本次主动大规模升级依赖

## 验证

- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm outdated --json`
- `cd oct-gateway && npm outdated --json`
