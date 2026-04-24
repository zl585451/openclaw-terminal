# 2026-04-24 开发态 Gateway 原生模块运行时自动对齐

## 问题

昨天已修复“打包版 / Electron 运行时”下 `oct-gateway` 原生模块的 ABI 对齐，但开发态仍可能复现相反方向的问题：

- 打包前执行 `electron-rebuild` 后，`oct-gateway/node_modules` 会被改写为 Electron ABI
- 随后在开发环境里通过 `node index.js` 或 Electron 主进程 `spawn('node', ...)` 启动网关时
- `better-sqlite3` / `sqlite-vec` 会因为当前 Node ABI 与 Electron ABI 不一致而报错

典型日志：

- `better_sqlite3.node was compiled against a different Node.js version`
- `NODE_MODULE_VERSION 119`
- `This version of Node.js requires NODE_MODULE_VERSION 127`

## 修复

新增 [scripts/ensure-oct-gateway-native.js](/E:/windows-window/OpenClaw-Terminal/scripts/ensure-oct-gateway-native.js:1)：

- 为 `oct-gateway/node_modules` 记录当前原生模块面向的运行时元数据
- 支持按 `node` 或 `electron` 运行时检查是否需要重编
- `electron` 目标继续走 `electron-rebuild`
- `node` 目标自动执行 `npm rebuild better-sqlite3 sqlite-vec`

同时接入两条链路：

- 开发态启动 Gateway 前，Electron 主进程会先执行一次 `--runtime node` 检查与自愈
- 打包前脚本 `rebuild:gateway:native` 改为复用同一个检查/重编脚本，继续对齐 Electron ABI

## 结果

- 昨天修好的“打包版 / Electron”路径继续保留
- 今天报错的“开发态 / Node”路径也会在启动前自动修复
- 两套运行时不再共享一份无标记的原生产物，减少来回切环境后的 ABI 回退问题
