# OCT 瘦身 Phase F-2：前端 ScriptAdapterApp 路由级懒加载

日期：2026-05-25

## 背景

Gateway 侧 `script_adapter` runtime 已改为首个 `scriptAdapter.*` 请求时懒加载。前端仍在 `src/App.tsx` 顶层静态导入 `ScriptAdapterApp`，导致普通聊天首屏也会把完整内容制作工作台 UI 模块纳入启动加载图。

## 本次变更

- `src/App.tsx`
  - 将 `ScriptAdapterApp` 改为 `React.lazy(() => import('./modules/script-adapter'))`。
  - 只有用户点击“内容制作工作台”或“项目素材库”进入 script-adapter 视图时才加载该 UI 模块。
  - 用 `Suspense` 包裹工作台视图，保留原 `initialScreen` 与 `onBack` 行为。
- `src/styles/App.css`
  - 新增 `.script-adapter-loading`，提供工作台模块加载态。

## 非目标

- 不改 Electron IPC。
- 不改 `src/modules/script-adapter` 内部状态、store、工作台协议或素材库行为。
- 不拆更细粒度的 Workbench / Library 子路由；本次只做 App 入口级拆分。

## 验证

- `npx tsc --noEmit`
- `npx vitest run`
- `npm run build`
