# 2026-05-26 Electron IPC Handler 模块化救援

## 变更

- 补齐 `electron/ipc/` 注册中心缺失的原有 IPC：
  - 悬浮窗恢复
  - 代码窗口
  - 终端窗口
  - AI.library 插件配置
  - 聊天历史
  - OpenClaw 连接、发送、状态
  - 系统通知
- 将 `IpcDeps` 从静态对象快照扩展为 getter/setter 依赖桥，避免 `openclawWs`、窗口实例和 `terminalPty` 后续变化后 IPC 模块拿到旧引用。
- 收口首轮审查发现的状态同步问题：
  - `window` / `file-dialog` / `gateway` handler 改为动态读取当前 `mainWindow`。
  - Gateway 重启和配置保存路径通过 `setOpenclawWs(null)` 同步主进程闭包与兼容桥。
  - `save-api-keys` 异常路径不再把 boolean `suppressAutoReconnect` 当函数调用。
  - `ipcDeps` 去掉整体 `as any`，改为显式 `IpcDeps` 类型约束。
- 修复 `script-adapter` IPC 模块中的 TypeScript 语法污染。
- 恢复误删的 `scripts/*.js`，避免 `package.json` 中现有命令引用不存在脚本。

## 验证

- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build:electron`
- `npm test`：46 个测试文件通过，383 个测试通过，1 个文件跳过，9 个测试跳过。
- `npm run build`
- IPC 注册清单对比：旧主进程 101 个注册，当前 101 个注册，缺失 0，重复 0。

## 未覆盖

- 尚未手动运行 `start.bat` 做 Electron 桌面交互验证。
- Gateway 真实 AI 调用仍依赖本机有效 API key、代理和 Electron 二进制可启动状态。
