# 2026-04-28 打包版 Gateway 原生模块探活修复

## 问题

Windows 打包版客户端安装后，`oct-gateway` 在启动阶段会直接退出，前端表现为一直连不上 `ws://127.0.0.1:18789`。

复现日志显示：

- `better_sqlite3.node was compiled against a different Node.js version`
- 安装包内 `better-sqlite3` 实际是 `NODE_MODULE_VERSION 127`
- 但打包版 Electron 28 运行时要求的是 `NODE_MODULE_VERSION 119`

更隐蔽的问题是：`scripts/ensure-oct-gateway-native.js` 之前会优先相信 `oct-gateway/node_modules/.native-runtime.json`，只要元数据写着 `electron 28.3.3`，就直接跳过重建。这样在 `node_modules` 被后续 `npm install` 或其他流程改回 Node ABI 后，脚本仍会误判“已经对齐”，最终把错误二进制打进安装包。

## 修复

更新 [scripts/ensure-oct-gateway-native.js](/E:/windows-window/OpenClaw-Terminal/scripts/ensure-oct-gateway-native.js:1)：

- 新增实际探活脚本，不再只看元数据
- `node` 目标使用当前 Node runtime 真正加载并打开 `better-sqlite3` / `sqlite-vec`
- `electron` 目标使用 Electron 可执行文件配合 `ELECTRON_RUN_AS_NODE=1` 做同样探活
- 只有“元数据匹配且真实可加载”时才跳过重建
- 重建完成后再做一次探活；如果仍失败则直接返回非零退出码，阻止带病打包

## 结果

- 打包前的原生模块检查从“只看标记”升级为“看标记 + 真探活”
- 能拦住 `better-sqlite3` ABI 已回退但元数据未更新的假阳性状态
- Windows 安装包里的 `oct-gateway` 不会再因为这类静默失配而启动即崩
