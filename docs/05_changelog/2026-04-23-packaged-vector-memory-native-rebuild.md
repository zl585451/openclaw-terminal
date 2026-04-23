# 2026-04-23 打包版向量记忆原生模块 ABI 修复

## 问题

打包版客户端中，`oct-gateway` 的向量记忆会在启动时出现类似报错：

- `better_sqlite3.node was compiled against a different Node.js version`
- `NODE_MODULE_VERSION 127`
- `This version of Node.js requires NODE_MODULE_VERSION 119`

根因是打包流程会把 `oct-gateway/node_modules` 作为 `extraResources` 直接复制进安装包，但之前没有在出包前把其中的原生模块按 Electron 运行时重新编译。

## 修复

新增打包前脚本 [scripts/rebuild-oct-gateway-native.js](/E:/windows-window/OpenClaw-Terminal/scripts/rebuild-oct-gateway-native.js:1)，专门对 `oct-gateway` 下的原生模块执行 Electron ABI 对齐：

- `better-sqlite3`
- `sqlite-vec`

并把它接入所有 Electron 打包命令：

- `electron:build:win`
- `electron:build:win:nolocal`
- `electron:build:mac`
- `electron:build:linux`
- `electron:build:all`

## 验证

已验证两层：

1. `electron-rebuild -m oct-gateway -w better-sqlite3,sqlite-vec` 可成功完成
2. 使用 Electron 运行时直接加载：
   - `./oct-gateway/node_modules/better-sqlite3`
   - `./oct-gateway/node_modules/sqlite-vec`

均能成功，不再触发 ABI mismatch。
