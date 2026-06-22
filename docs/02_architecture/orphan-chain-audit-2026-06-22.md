# 孤儿代码与废弃链路审计 - 2026-06-22

## 范围

这份文档最初用于审计 `E:\windows-window\OpenClaw-Terminal` 中可能存在的孤儿代码路径和休眠链路，随后作为 `codex/orphan-chain-audit-goal-20260622` 分支上的低风险清理执行记录。

执行模型路由建议：

- `gpt-5.4-mini`：负责收集 frontend / Electron / IPC / gateway / scripts / resources 的证据。
- 主审模型：负责交叉核对入口点、动态加载风险和候选项分类。

当前只执行了 Batch 1。后续批次仍然必须先做证据收集，并且只有满足该批次的验证边界后，才允许删除代码。

当前工作区注意事项：`start.bat` 在本次审计前已经被修改。它属于用户已有工作区状态，清理时不要重写或删除它。

## 真实入口点

### 根应用

- 根 `package.json` 入口：`"main": "dist-electron/main.js"`。
- 开发启动命令：`npm run dev`、`npm run start`、`npm run start:fast`、`npm run electron:dev`。
- Electron 运行时源码：`electron/main.ts`。
- Renderer 运行时源码：`src/main.tsx` 挂载 `src/App.tsx`。
- Vite 开发服务：`vite.config.ts` 使用端口 `5176`；开发环境下 Electron 加载 Vite URL，生产环境下加载 `dist/index.html`。

### Electron IPC

IPC 注册集中在 `electron/ipc/index.ts`，它会注册：

- `window.ts`
- `code-window.ts`
- `terminal.ts`
- `file-dialog.ts`
- `gateway.ts`
- `chat.ts`
- `ai-library.ts`
- `ai-config.ts`
- `memory.ts`
- `mcp.ts`
- `media.ts`
- `logs.ts`
- `library.ts`
- `delivery.ts`
- `image.ts`
- `script-adapter/index.ts`

面向 renderer 的桥接文件是 `electron/preload.ts`，它暴露 `window.electronAPI`。

重要注意：前端仍然混合使用 `window.electronAPI` 和直接的 `window.require('electron').ipcRenderer` 调用。因此，“某个能力暴露在 preload 里，但没有通过 `electronAPI` 使用”本身不足以证明它可以删除。

### Gateway

- Gateway 包入口：`oct-gateway/package.json` 运行 `node index.js`。
- Gateway 组合根：`oct-gateway/index.js`。
- 路由入口：`oct-gateway/gateway/router.js`。
- HTTP transport 路由：`oct-gateway/transport/httpRoutes.js`。
- 工具注册表：`oct-gateway/tool_loader.js`。
- MCP 动态工具 / provider 注册：`oct-gateway/mcp/manager.js`。
- 内置 agent 注册：`oct-gateway/orchestrator.js`。

不要把 `gateway/router.js`、`tool_loader.js`、`mcp/manager.js` 或 `orchestrator.js` 判定为孤儿代码。它们都是活动入口面。

### 打包资源

根 `package.json` 的 `build.extraResources` 包含：

- `oct-gateway/node_modules`
- `oct-gateway/optional-tools/node_modules`
- 整个 `oct-gateway` 目录，但排除部分 runtime / temp / docs / log 产物
- `docs/01_system_prompts`，打包后复制为 `prompts`

这意味着即使某些文件没有前端 import，`oct-gateway` 文件和 prompt 文档仍然可能在运行时或打包产物中可达。

## 高风险动态链路

下面这些链路不能只因为静态 `rg` 搜不到引用就删除：

- `oct-gateway/tool_loader.js` 会懒加载 `oct-gateway/tools/*.js`。
- `oct-gateway/mcp/manager.js` 会动态注册 MCP tools / providers。
- `oct-gateway/index.js` 会通过 `createLazyScriptAdapterRuntime` 懒加载 script-adapter runtime。
- `oct-gateway/runtime/lazyAiLibrary.js` 和 `oct-gateway/tools/search_knowledge.js` 可以按需加载 AI.library。
- `electron/code-window.html`、`electron/terminal-window.html`、`electron/float.html` 是独立 renderer 入口，使用 React 主应用之外的事件通道。
- `oct-gateway/transport/httpRoutes.js` 暴露的路由可能被外部客户端、移动端视图、测试或手工工具调用。
- `docs/01_system_prompts` 会作为运行时 prompt 材料打包。

## 保留项

| 路径 | 链路 | 证据 | 原因 |
|---|---|---|---|
| `oct-gateway/gateway/router.js` | Gateway 消息路由 | 由 `oct-gateway/index.js` 实例化 | 活动的 `chat.send`、`chat.cancel`、`sessions.list` 和 slash routing 表面。 |
| `oct-gateway/tool_loader.js` | 工具注册表 | 被 `oct-gateway/ai.js`、`oct-gateway/index.js` 和 agent runner 路径 require | 懒加载动态工具，仅靠静态 import 检查不够。 |
| `oct-gateway/mcp/manager.js` | MCP 工具 / provider 注册 | 被 `oct-gateway/index.js` 和 IPC / gateway 表面 require | 动态 provider 表面，不是孤儿候选。 |
| `oct-gateway/orchestrator.js` | 内置 agent 分发 | 注册 Coder、Writer、Researcher agents | agent 风格任务的活动编排表面。 |
| `oct-gateway/optional-tools` | 可选依赖 | document / email tools 通过 `optionalDependency.js` 使用 | package scripts 和运行时工具仍依赖这个边界。 |
| `electron/code-window.html` | 辅助 renderer | 使用 `code-window-ready` / `code-window-close` 事件通道 | 不会出现在 React import 图里。 |
| `electron/terminal-window.html` | 辅助 renderer | 使用 `terminal-ready`、`terminal-input`、`terminal-resize`、`terminal-close` | 不会出现在 React import 图里。 |
| `electron/float.html` | 辅助 renderer | 使用 `float-restore` | 不会出现在 React import 图里。 |
| `docs/01_system_prompts` | 运行时 prompt 资源 | 由 `package.json` `extraResources` 复制 | 是打包 prompt 来源，不能当作普通文档噪声删除。 |

## 隔离候选

这些链路可能处于休眠状态，但当前证据还不足以直接删除。

| 路径 | 链路 | 证据 | 动态风险 | 建议 |
|---|---|---|---|---|
| `oct-gateway/transport/httpRoutes.js` 的部分路由 | Gateway HTTP 路由 | 暴露 `/tool`、`/api/polish`、`/api/script-format`、`/api/script-role-detect`、`/mcp/status`、`/mcp/server`、`/mobile` | 中高：外部客户端可能直接调用 | 单独做 route 级使用审计。不要删除整个文件。 |
| `oct-gateway/tools/ai_library.js` | Gateway tool / AI.library bridge | 仍可通过工具注册表加载；错误和文档里还引用旧 `api_server.py` 语义 | 中：工具表面可能被模型调用 | 审计 `search_knowledge` 和 Electron 原生 library 是否已经完全替代此路径。 |
| `resources/system_prompts/` | prompt 镜像 | 当前 package 复制 `docs/01_system_prompts`；`oct-gateway/config.js` 也有 prompt-dir 逻辑 | 中：可能是手工同步镜像 | 删除前确认当前 `PROMPTS_DIR` 解析和 release 打包逻辑。 |
| `scripts/build-nocturne-exe.ps1` | 旧 Nocturne 打包脚本 | 脚本指向已不存在的 `resources/nocturne_server`；当前根 scripts 没有调用它 | Nocturne 拆包证据下较低 | 仅限未来批次；当前 Batch 1 目标下没有删除。 |
| `electron/ipc/ai-config.ts` 的 `test-log-write` handler | 诊断 IPC | 没有 preload export，也没有前端 caller；只有 IPC spec 记录它 | 文档 grep 后较低 | 仅限未来批次；IPC handlers 不在当前 Batch 1 目标范围内。 |
| `electron/preload.ts` 的 `parseScriptFile` | script adapter 导入辅助 | 当前上传流似乎使用 `library.pickFile` 和 `uploadBook` | 中：script-adapter UI 可能有替代路径 | 删除 bridge / handler 前，必须先通过 UI workflow 和测试确认。 |

## 删除候选

这些是低风险清理候选。这里的条目不是继续删除的许可；每个未来批次仍然需要自己的验证。

| 路径 | 链路 | 证据 | 风险 | 删除前验证 |
|---|---|---|---|---|
| `src/components/TitleBar.tsx` props `isAlwaysOnTop` / `onToggleTop` 以及 `setAlwaysOnTop` / `getAlwaysOnTop` bridge 使用 | 窗口置顶 UI | props 在 `TitleBar` 内未使用；没有找到 `src` 对 `setAlwaysOnTop` / `getAlwaysOnTop` 的调用 | 如果没有隐藏 UI 使用，风险低 | `rg -n "setAlwaysOnTop|getAlwaysOnTop|isAlwaysOnTop|onToggleTop" src electron`；`npx tsc --noEmit`；`npm run build`。 |
| `electron/preload.ts` wrappers `readLogFile` / `watchLogFile` | 日志 bridge wrapper | 当前前端路径使用 `get-env` 和 raw `start-log-watch`；没有找到 wrapper 调用 | 低 | `rg -n "readLogFile|watchLogFile|start-log-watch|openclaw-log-lines" src electron`；做 log panel smoke。 |
| `electron/preload.ts` wrapper `openCodeWindow` | code window bridge wrapper | handler 存在，但没有找到 `src` caller | 中低，因为辅助 window 存在 | `rg -n "openCodeWindow|open-code-window|code-window-ready" src electron`；如果功能仍存在，做手工 code-window smoke。 |
| `electron/preload.ts` wrappers `openFileDialog` / `openTerminalWindow` | 仅 bridge wrapper | 前端当前通过 raw IPC 调用 `open-file-dialog` / `open-terminal-window` | 删除 wrapper 风险低；删除 handler 不在此范围 | `rg -n "openFileDialog|openTerminalWindow|open-file-dialog|open-terminal-window" src electron`；做文件上传和 terminal smoke。 |
| `scripts/chat-pipeline-trace-phase0.js` | 手工 trace 脚本 | 被 `docs/refactors/chat-pipeline-phase0-trace.md` 引用；不在 package scripts 中 | 低 | 确认 chat 审计文档不再需要重跑；如果保留 trace 能力重要，则运行 `node scripts/chat-pipeline-trace-phase0.js`。 |
| `scripts/start-nocturne-dashboard.ps1` | 旧 Nocturne dashboard helper | 被旧 Nocturne guide 引用；不在 package scripts 中 | Nocturne 拆包证据下较低 | 仅限未来批次；当前 Batch 1 目标下没有删除。 |
| `resources/ai_library/` | 旧 AI.library 资源 | Electron 原生 library 路径现在使用 userData；根 package 没有单独包含 `resources/ai_library` | 中：历史文档多，且可能存在本地数据预期 | 确认 release / package config 不复制它；做 library upload/list smoke；先验证 `oct-gateway/tools/ai_library.js` 替代策略。 |

## 已注册但没有暴露到 preload 的 IPC

这些不自动等于孤儿代码；其中多个通过 raw IPC 或辅助 renderer 使用。

| Channel | 注册位置 | 当前判断 |
|---|---|---|
| `open-image-dialog` | `electron/ipc/file-dialog.ts` | 未暴露到 preload。只有确认没有 raw IPC caller 或旧 image upload workflow 后，才可作为候选。 |
| `kill-port-18789` | `electron/ipc/gateway.ts` | 诊断 / 管理辅助。隔离，不直接删除。 |
| `stop-log-watch` | `electron/ipc/logs.ts` | 与 `start-log-watch` 配套；除非证明 log watcher 生命周期不用它，否则保留。 |
| `minimize-for-capture` / `restore-after-capture` | `electron/ipc/window.ts` | 截图 / 文件附件流通过 raw IPC 使用。保留。 |
| `show-notification` | `electron/ipc/chat.ts` | notification hooks 通过 raw IPC 使用。保留。 |
| `code-window-ready` / `code-window-close` | `electron/ipc/code-window.ts` | 被 `electron/code-window.html` 使用。保留。 |
| `terminal-ready` / `terminal-input` / `terminal-close` / `terminal-resize` | `electron/ipc/terminal.ts` | 被 `electron/terminal-window.html` 使用。保留。 |
| `float-restore` | `electron/ipc/window.ts` | 被 `electron/float.html` 使用。保留。 |
| `test-log-write` | `electron/ipc/ai-config.ts` | 放入未来诊断 IPC 审查的隔离候选；当前 Batch 1 目标下没有删除。 |

## 后续清理批次

### Batch 1：Preload Wrapper Cleanup

状态：已在 `codex/orphan-chain-audit-goal-20260622` 上完成。

已完成变更：

- 删除未使用的 `TitleBar` props：`isAlwaysOnTop` 和 `onToggleTop`。
- 删除未使用的 `window.electronAPI` preload wrappers：
  - `setAlwaysOnTop`
  - `getAlwaysOnTop`
  - `readLogFile`
  - `watchLogFile`
  - `openCodeWindow`
  - `openTerminalWindow`
  - `openFileDialog`
- 保留 `electron/ipc/*` 下所有底层 IPC handlers。
- 保留 `parseScriptFile` 在隔离候选中，因为 script-adapter 的替代上传路径需要更强 workflow 证据后才能删除 bridge。

已运行验证：

- `rg -n "setAlwaysOnTop|getAlwaysOnTop|readLogFile|watchLogFile|openCodeWindow|openFileDialog|openTerminalWindow|isAlwaysOnTop|onToggleTop" src electron -g "*.ts" -g "*.tsx"`
- `rg -n "set-always-on-top|get-always-on-top|read-log-file|open-code-window|open-file-dialog|open-terminal-window" electron src -g "*.ts" -g "*.tsx" -g "*.html"`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`

结果：

- 前端 TypeScript 通过。
- Electron TypeScript 通过。
- 生产构建通过。
- Vite 只输出既有 chunk-size warning。
- 回退超出范围的 Batch 2 变更后，重新验证同一组 TypeScript 检查和生产构建，仍然通过。

允许范围：

- `electron/preload.ts`
- `src/types/electronAPI` 或等价类型声明文件，如果存在
- 聚焦的测试 / 类型修复

候选：

- 未使用的 always-on-top wrapper / types
- `readLogFile` / `watchLogFile` wrappers
- `openCodeWindow` wrapper
- `openFileDialog` / `openTerminalWindow` wrappers，前提是 raw IPC 路径被有意保留

禁止：

- 本批次不要删除 `electron/ipc/*` 中的 IPC handlers。
- 不要改 raw IPC 调用点。
- 不要碰 gateway。

验证：

- `rg -n "setAlwaysOnTop|getAlwaysOnTop|readLogFile|watchLogFile|openCodeWindow|openFileDialog|openTerminalWindow" src electron`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`

### Batch 2：Diagnostic Script and Handler Review

状态：当前 Batch 1 目标下未执行。

当前边界：

- 保留 `scripts/start-nocturne-dashboard.ps1`。
- 保留 `scripts/build-nocturne-exe.ps1`。
- 保留 `electron/ipc/ai-config.ts` 中的诊断 IPC handler `test-log-write`。
- 保留 `docs/03_specs/ELECTRON_IPC_CHANNELS.md` 中对 `test-log-write` 的记录。
- 在专门的 Nocturne 清理批次获批前，保持历史 Nocturne guide 不变。

证据：

- `docs/05_changelog/2026-05-18-nocturne-unbundle.md` 说明 Windows 打包不再运行 `build:nocturne`，也不再携带 `resources/nocturne_memory` 或 `resources/nocturne_server`。
- 当前工作区没有 `resources/nocturne_memory`，也没有 `resources/nocturne_server`。
- `test-log-write` 没有 preload export，也没有前端 caller；只有 IPC spec 记录它。

验证命令：

- `rg -n "test-log-write|chat-pipeline-trace-phase0|start-nocturne-dashboard|build-nocturne-exe" package.json electron src scripts docs -g "!node_modules/**" -g "!dist/**" -g "!dist-electron/**"`
- `rg -n "nocturne|Nocturne|build:nocturne|resources/nocturne|resources\\nocturne" package.json electron oct-gateway scripts -g "!node_modules/**" -g "!*.log"`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`

结果：

- 当前目标不包含任何 Batch 2 删除。
- `scripts/chat-pipeline-trace-phase0.js` 继续保留，因为 `docs/refactors/chat-pipeline-phase0-trace.md` 仍记录手工 trace 命令。
- Nocturne 脚本和诊断 IPC handler 仍然只是单独未来批次的候选项，不属于 Batch 1。

禁止：

- 不要大范围删除 Nocturne 文档。
- 不要删除 runtime memory code。
- 不要删除 gateway handlers。

验证：

- `rg -n "chat-pipeline-trace-phase0|start-nocturne-dashboard|build-nocturne-exe|test-log-write|Nocturne|nocturne" . -g "!node_modules/**" -g "!release/**" -g "!dist/**" -g "!dist-electron/**"`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`

### Batch 3：AI.library Resource Strategy

允许范围：

- 第一阶段只做文档和 resource packaging 决策。

禁止：

- 不要在同一批次删除 `oct-gateway/tools/ai_library.js` 和 `resources/ai_library/`。
- 在验证 tool-loader 行为前，不要删除 `search_knowledge`。

验证：

- `rg -n "resources/ai_library|tools/ai_library|search_knowledge|ai_library_data|OCT_AI_LIBRARY" . -g "!node_modules/**" -g "!release/**" -g "!dist/**" -g "!dist-electron/**"`
- AI.library list / upload smoke。
- `node oct-gateway/test/lazyAiLibrary.test.js`
- `node oct-gateway/test/toolLoaderLazyInit.test.js`

### Batch 4：HTTP Route Usage Audit

允许范围：

- 只读 route 级审计和测试。

禁止：

- 不要删除 `oct-gateway/transport/httpRoutes.js`。
- 没有外部客户端决策前，不要删除 `/mobile`、`/tool`、`/mcp/status` 或 script-format endpoints。

验证：

- `rg -n "/api/polish|/api/script-format|/api/script-role-detect|/mobile|/tool|/mcp/status|/mcp/server" . -g "!node_modules/**" -g "!release/**" -g "!dist/**" -g "!dist-electron/**"`
- `node oct-gateway/test/bootstrapTransports.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`

## 验收说明

- Phase 0 / 1 证据收集已完成。
- Phase 2 分类故意保持保守。
- 本文档没有任何条目被预先批准删除。
- `delete candidate` 的意思是“未来可以在独立聚焦批次中验证后清理”，不是立即删除。
