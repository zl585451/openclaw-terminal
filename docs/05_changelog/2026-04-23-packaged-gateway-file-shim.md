# 2026-04-23 打包版 Gateway 启动兼容修复

## 问题

Windows 打包版客户端启动内置 `oct-gateway` 时，前端会持续出现：

- `connect ECONNREFUSED 127.0.0.1:18789`
- `WebSocket 已断开 code=1006`

根因不是前端连错地址，而是打包版通过 Electron 内嵌 Node 18 启动 Gateway 时，`undici` 初始化读取全局 `File`，但该运行时没有提前挂载，导致 Gateway 进程刚启动就崩溃。

## 修复

在 [oct-gateway/index.js](/E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:1) 顶部增加最早期的 `File` 兼容 shim：

- 优先使用 `node:buffer` 导出的原生 `File`
- 若运行时仍未提供，则回退到基于 `Blob` 的最小 `FileShim`
- 保证任何 `require('undici')` 之前就完成兼容注入

## 结果

- 打包版 Gateway 启动链不再因为 `ReferenceError: File is not defined` 直接崩溃
- 客户端可正常连回 `ws://127.0.0.1:18789`

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- 通过删除 `globalThis.File` 后手动启动 `oct-gateway/index.js`，确认 Gateway 仍能正常监听 `18789`
