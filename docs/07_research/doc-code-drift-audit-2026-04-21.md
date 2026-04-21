# OCT 文档 ↔ 代码一致性审计报告 — 2026-04-21

> 基线：post `cleanup-phase1-done` + `electron/main_utf8.ts` 已删除  
> 审计者：Cursor  
> 审计依据：`阶段2-文档一致性审计-执行计划.md`

## 执行摘要

- 审计范围：`docs/` + `src/` + `oct-gateway/` + `electron/`
- 发现漂移项：高置信 11 个 / 中置信 7 个 / 低置信 3 个
- 最紧迫的 TOP 5：
  1. `WEBSOCKET_PROTOCOL.md` 仍描述 `stream.delta / stream.done / thinking / tool_call`，实际主链路已统一为 `event: "chat" / "tool" / "agent-phase" / "keepalive"`
  2. `ELECTRON_IPC_CHANNELS.md` 缺失多组真实已注册通道，尤其是脚本、MCP、音乐、AI.library 保存、本地视觉占位通道
  3. `99_known_issues.md` 的 #8、#10、#13 与代码现实不一致或证据路径漂移
  4. 入口文档 `image-flow-entry.md` 与 `audio-entry.md` 仍保留旧链路描述：`imageAnalyzer.analyzeImages()` 直连主链、ASR/录音输入
  5. `FEATURE_MAP.md` 在 `main_utf8.ts` 已删除后仍保留并列入口描述，且仍有 ASR 流程残影

## 一、入口文档对照

### 1.1 chat-stream-entry.md

- **[中置信]** 文档把流式主链概括为 `useMessages.ts -> runStreamPaintTick`，这条路径仍存在，但已不是唯一关键入口。代码实际还强依赖 [`src/hooks/useWebSocket.ts:10`](</E:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts:10>) 的 `onChatDelta/onChatDone` 和 [`src/hooks/useMessages.ts:518`](</E:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts:518>) 的事件接线，文档对 `turnId` 过滤与 `agent-phase`/`keepalive` 新语义覆盖不足。
- **[低置信]** 文档强调 `runStreamPaintTick` 是排查入口之一，这点仍成立；但如果按文档只盯 DOM paint，很容易漏掉 [`oct-gateway/index.js:352`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:352>) 的 `keepalive` 和 [`oct-gateway/index.js:395`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:395>) 的 `onDone` 收尾。

### 1.2 image-flow-entry.md

- **[高置信]** 文档仍把 `imageAnalyzer.analyzeImages()` 画成旧链路分支：`docs/00_ai_entry/image-flow-entry.md:29,95`。代码现状是 [`oct-gateway/index.js:94`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:94>) 先构造 `ImageService`，再由 [`oct-gateway/services/imageService.js:46`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/services/imageService.js:46>) 间接调用 `analyzeImages()`；文档缺少 `ImageService` 这一层。
- **[中置信]** 文档把 `imageAnalyzer` 作为主判断节点，但代码现在已经有服务层封装与后处理器分层，读文档的人会低估 `services/imageService.js` 和 `services/postProcessor.js` 的职责。

### 1.3 audio-entry.md

- **[高置信]** `FEATURE_MAP` 已写明“2026-04-19 移除录音转文字（ASR）链路”，但入口文档族仍保留 ASR 语义残影。证据：[`docs/02_architecture/FEATURE_MAP.md:98`](</E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:98>) 写“移除录音转文字（ASR）链路”，而 [`docs/02_architecture/FEATURE_MAP.md:140`](</E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:140>) 还写“录音 → IPC → 云端 ASR → 文本回填”。
- **[高置信]** 代码侧对 `ASR|speechToText|recordAndTranscribe` 的全仓搜索无命中；说明产品主链路里确实已无 ASR 实现。入口文档如果继续把音频入口理解成“打字音效 / TTS / ASR”三条并列，会误导排查顺序。

### 1.4 bug-triage.md

- **[低置信]** 文档列出的关键路径 [`src/hooks/useWebSocket.ts`](</E:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts:1>)、[`src/hooks/useMessages.ts`](</E:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts:1>)、[`oct-gateway/transport/ws.js`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/transport/ws.js:1>) 都还存在，主路径未失效。
- **[中置信]** `bug-triage.md` 仍把 `runStreamPaintTick` / `stream interrupted` 当成核心检索词，这在今天仍能命中 [`src/hooks/useMessages.ts:321`](</E:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts:321>) 与 [`oct-gateway/ai.js:1662`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js:1662>)，但没有把 `turnId`、`keepalive`、`agent-phase` 纳入排错词表，已落后于当前协议层。

## 二、架构文档对照

- **[高置信]** `01-gateway.md` 的“调用链”还写着 `orchestrator.dispatch -> ai.js streamChat`，但运行时已经抽出 [`oct-gateway/runtime/chatEngine.js`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/chatEngine.js:1>)、[`contextBuilder.js`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/contextBuilder.js:1>)、[`providerRouter.js`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/providerRouter.js:1>)。文档只在 [`docs/02_architecture/FEATURE_MAP.md:47`](</E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:47>) 提到 runtime 分层，`01-gateway.md` 本身未同步。
- **[中置信]** `provider-system.md` 对 Provider 列表基本跟上了 Google / bailian-coding，但它仍把主执行文件描述成 `ai.js` 与 `index.js`，没有覆盖 [`oct-gateway/runtime/providerRouter.js:45`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/providerRouter.js:45>) 的 `GOOGLE_TOOLS_MODE` 动态探测分支，能力协商深度描述不足。
- **[低置信]** `config-system.md` 与代码基本对齐。文档已提到 `MODEL_REGISTRY`、`bailian-coding`、`supportsTools`，代码也能在 [`oct-gateway/config.js:143`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/config.js:143>)、[`oct-gateway/config.js:340`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/config.js:340>) 找到对应实现。

## 三、协议规范对照 ⭐ 最严重

### 3.1 WEBSOCKET_PROTOCOL.md

- **[高置信]** 文档主表仍把流式事件写成 `stream.delta | stream.done | thinking | tool_call`：见 [`docs/03_specs/WEBSOCKET_PROTOCOL.md:169`](</E:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md:169>) 和 [`:177-181`](</E:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md:177>)。代码实际主链路统一发送 `event: "chat"`、`event: "tool"`、`event: "agent-phase"`、`event: "keepalive"`：见 [`oct-gateway/index.js:268`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:268>)、[`:352`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:352>)、[`:386`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:386>)、[`oct-gateway/transport/ws.js:93`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/transport/ws.js:93>)。
- **[高置信]** 文档“消息路由”仍写 `chat.send -> orchestrator.dispatch -> ai.js streamChat`：[`docs/03_specs/WEBSOCKET_PROTOCOL.md:245-246`](</E:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md:245>)。代码实际是 `orchestrator` 后进入 [`oct-gateway/index.js:330`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:330>) 的 `contextBuilder.build()` 与 [`:364`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:364>) 的 `chatEngine.execute()`，不再是直接 `ai.js`。
- **[低置信]** `turnId`、25s ping、`sessionKey` 这些新字段文档已经跟上，和 [`oct-gateway/transport/ws.js:119`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/transport/ws.js:119>)、[`:151`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/transport/ws.js:151>)、[`oct-gateway/index.js:231`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:231>) 基本一致。

### 3.2 ELECTRON_IPC_CHANNELS.md

- **[高置信]** 文档缺失真实已注册且已在 preload 暴露的通道：
  - `parse-script-file`：[`electron/main.ts:1760`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:1760>) / [`electron/preload.ts:43`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:43>)
  - `save-script-draft-cache`：[`electron/main.ts:1732`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:1732>) / [`electron/preload.ts:49`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:49>)
  - `save-persona-settings`：[`electron/main.ts:3369`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:3369>) / [`electron/preload.ts:126`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:126>)
  - `music-generate` / `lyrics-generate`：[`electron/main.ts:3882`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:3882>), [`4009`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:4009>) / [`electron/preload.ts:139`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:139>), [`145`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:145>)
  - `save-ai-library-plugin`：[`electron/main.ts:2405`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:2405>) / [`electron/preload.ts:165`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:165>)
  - MCP 管理：`mcp-get-status` / `mcp-add-server` / `mcp-remove-server`：[`electron/main.ts:2480`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:2480>)、[`2487`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:2487>)、[`2505`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:2505>) / [`electron/preload.ts:192-194`](</E:/windows-window/OpenClaw-Terminal/electron/preload.ts:192>)
- **[中置信]** 文档没有反映“本地视觉功能已移除但兼容通道仍保留”的现状。代码中 [`electron/main.ts:3403-3405`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:3403>) 仍注册 `get-local-vision-status`、`save-local-vision-settings`、`download-local-vision-model`，但返回的是占位/移除提示。

### 3.3 99_known_issues.md 逐条核查表

| # | 文档状态 | 代码实际 | 证据 | 结论 |
|---|---|---|---|---|
| 1 | ✅ 已修复 | ✅ 已验证，但实现位置漂移 | [`oct-gateway/services/postProcessor.js:28`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/services/postProcessor.js:28>) 调 `detectAndSaveFeedback()`；不在 `index.js` 直接调用 | 状态一致，说明文字过时 |
| 2 | ✅ 已修复 | ✅ 已验证 | [`oct-gateway/clarification_memory.js:2`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/clarification_memory.js:2>) 文件存在；[`services/postProcessor.js:44`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/services/postProcessor.js:44>) 已接线 | 一致 |
| 3 | 🔇 已停用 | ✅ 基本一致 | 活跃链路未检出 `selfEval.evaluateReply` 调用；仅剩 [`oct-gateway/self_eval.js`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/self_eval.js:460>) 存档式实现 | 一致 |
| 4 | 🔇 已删除 | ✅ 基本一致 | 搜索未发现 `SOUL.md` 中仍有“自动学习规则”段；该标记只存在 [`oct-gateway/self_eval.js:430`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/self_eval.js:430>) | 一致 |
| 5 | 🚧 待修复 | ✅ 基本一致 | Gateway 5 处已在阶段 1 修；前端与主进程仍有残留，见 [`oct-gateway/services/postProcessor.js:127`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/services/postProcessor.js:127>) 以外仍有 `.catch` | 基本一致 |
| 6 | 🟡 已优化待验证 | ✅ 已验证“已优化”部分 | [`oct-gateway/memory.js:48-68`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/memory.js:48>) 有 retry；[`oct-gateway/nocturne_task_queue.js:11-25`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/nocturne_task_queue.js:11>) 有健康检查与节流 | 一致 |
| 7 | 🚧 待完善 | ✅ 已验证 | [`oct-gateway/memory_history.js:168-190`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/memory_history.js:168>) 明写“仅打日志” | 一致 |
| 8 | ✅ 已接入 | ❌ 未验证到调用 | 只找到 [`oct-gateway/index.js:67`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/index.js:67>) `require('./hypothesis')` 与 [`oct-gateway/hypothesis.js:6`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/hypothesis.js:6>) 定义，未找到 `selectBestApproach()` 活跃调用 | **高置信漂移** |
| 9 | 🚧 待统一 | ✅ 已验证 | `docs/01_system_prompts/` 与 `resources/system_prompts/` 并存；代码默认走 [`oct-gateway/config.js:963-964`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/config.js:963>) 与 [`electron/main.ts:448-456`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:448>) 的 `docs/01_system_prompts` | 一致 |
| 10 | ⚠️ 代码与文档不一致 | ❌ 关键修复证据缺失 | [`oct-gateway/ai.js:71`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js:71>) 仍有 `truncateHistory()`；未找到 `validateAndFixMessages` 实现；实际收敛依赖 [`ai.js:1216`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js:1216>) 的 `preserveToolChain` 分支 | **高置信关键漂移** |
| 11 | ✅ 已修复 | ✅ 已验证 | [`oct-gateway/tools/exec_command.js:37`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/tools/exec_command.js:37>) 仍显式插入 `chcp 65001` | 一致 |
| 12 | ✅ 已修复 | ✅ 已验证 | [`src/utils/optionBoxParser.ts:199`](</E:/windows-window/OpenClaw-Terminal/src/utils/optionBoxParser.ts:199>) 用 `split('\n')`；[`221`](</E:/windows-window/OpenClaw-Terminal/src/utils/optionBoxParser.ts:221>) 与 [`303`](</E:/windows-window/OpenClaw-Terminal/src/utils/optionBoxParser.ts:303>) 保护表格行 | 一致 |
| 13 | ✅ 已修复 | ✅ 逻辑已修，但文件路径漂移 | 实现现在位于 [`src/ui/chat/markdownComponents.tsx:158`](</E:/windows-window/OpenClaw-Terminal/src/ui/chat/markdownComponents.tsx:158>) 的 `!inline && (...)`，不是文档写的 `ChatTab.v2` | 状态一致，证据路径过时 |
| 14 | 🚧 阶段 3 处理 | 跳过 | 阶段 1 新增基线项 | 按计划跳过 |
| 15 | 🚧 单独 sprint | 跳过 | 阶段 1 新增基线项 | 按计划跳过 |

## 四、Changelog 漂移

- **[中置信]** 最近 20 次提交中，`563c0d7 refactor: remove legacy theme var compatibility`、`1bee093 chore: 删除混入源码树的 2 个备份文件`、`2539399 chore: 清理未定义主题变量引用`、`f787056 chore: 为 gateway 静默 catch 补充诊断日志` 都没有在 `docs/05_changelog/` 看到一一对应的独立记录，说明“代码已落地但 changelog 缺口”仍存在。
- **[低置信]** `docs/05_changelog` 最近修改时间排在前面的多份 2026-04-08/04-15 文档，其 `LastWriteTime` 是 2026-04-21，疑似批量触碰过时间戳，不适合直接把文件时间当成真实更新时间。
- **[低置信]** `2026-04-17-session-reliability-p2.md` 声称的 `getToolMeta()/timeoutMs` 代码证据是存在的：[`oct-gateway/tool_loader.js:166`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/tool_loader.js:166>)、[`oct-gateway/runtime/toolLoop.js:67`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/toolLoop.js:67>)；这部分未发现漂移。

## 五、系统提示词归属表

| 文件名 | `docs/01_system_prompts/` | `resources/system_prompts/` | 代码实际加载 | 建议 |
|---|---|---|---|---|
| `AGENTS.md` | ✓ | ✓ | 默认 `docs/01_system_prompts`，见 [`oct-gateway/config.js:963-964`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/config.js:963>) 与 [`electron/main.ts:448-456`](</E:/windows-window/OpenClaw-Terminal/electron/main.ts:448>) | 明确谁是源码、谁是打包副本 |
| `SOUL.md` | ✓ | ✓ | 默认 `docs/01_system_prompts`；`self_eval.js` 还会尝试多路径写回，见 [`oct-gateway/self_eval.js:417-421`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/self_eval.js:417>) | 高风险重复维护点 |
| `USER.md` | ✓ | ✓ | 默认 `docs/01_system_prompts` | 建议明确资源目录仅用于打包 |
| `OCT_PROTOCOL.md` | ✓ | ✓ | 默认 `docs/01_system_prompts` | 同上 |
| `MEMORY.md` | ✓ | ✗ | 只在 `docs/`；[`oct-gateway/ai.js:251`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js:251>) 会写回该文件 | 现状清晰 |

- **[中置信]** 代码默认把 `docs/01_system_prompts` 当运行源，而 `resources/system_prompts` 更像打包副本；但仓库里没有明确的“单一真相源”说明。

## 六、FEATURE_MAP 真实性

- **[高置信]** [`docs/02_architecture/FEATURE_MAP.md:133`](</E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:133>) 仍写 `electron/main.ts` 和 `main_utf8.ts` 并列；`main_utf8.ts` 已在 commit `24a6808` 删除。该条已经从“文档漂移”变成“失效路径”。
- **[高置信]** `FEATURE_MAP.md` 顶部写“2026-04-19 移除 ASR”，但正文 [`:140`](</E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:140>) 仍保留“录音 → IPC → 云端 ASR → 文本回填”，前后自相矛盾。
- **[中置信]** `oct-gateway/FEATURE_MAP.md` 仍保留 BUG1/2/4/6/8 等老编号体系，和 [`docs/03_specs/99_known_issues.md`](</E:/windows-window/OpenClaw-Terminal/docs/03_specs/99_known_issues.md:1>) 当前 1-15 编号并不对齐；两套“问题编号宇宙”会误导后续 AI 交叉引用。

## 七、归档边界

- **[中置信]** 归档文件仍在当前文档与代码搜索结果里频繁出现，最明显的是 `docs/_archive/historical_reviews/FULL_PROJECT_REVIEW.md` 与 `docs/_archive/legacy_model_context/...` 在 `optionBoxParser`、`truncateHistory`、`clarification_memory` 等关键词搜索时大量抢占结果。虽然不代表运行时引用，但会显著污染 AI 搜索上下文。
- **[低置信]** [`docs/03_specs/DOCUMENTATION_GAP_REPORT.md`](</E:/windows-window/OpenClaw-Terminal/docs/03_specs/DOCUMENTATION_GAP_REPORT.md:1>) 已属历史性质，却仍停留在 `03_specs` 正式目录而非 `_archive/`，目录边界不够清晰。

## 八、PROPOSAL vs 已落地

- **[高置信]** [`docs/06_features/WORKBENCH_ARCHITECTURE_PLAN.md:3`](</E:/windows-window/OpenClaw-Terminal/docs/06_features/WORKBENCH_ARCHITECTURE_PLAN.md:3>) 仍标 `PROPOSAL（设计稿，待落地）`，但 `src/workbench/` 已存在，且 Git tag 中已有 `workbench-phase1-start-2026-04-12`。文档状态显然滞后于代码落地。
- **[中置信]** `canvas` 相关 tag 已有 `v2-canvas-done`、`canvas-document-p0-p1a`，说明部分 plan/proposal 文档至少不该再用“待落地”笼统表述。

## 九、AGENTS 规则执行

- **[低置信]** `AGENTS.md` 里“禁止 memory_write 写任务”在代码里能看到守卫痕迹：[`oct-gateway/services/postProcessor.js:127-130`](</E:/windows-window/OpenClaw-Terminal/oct-gateway/services/postProcessor.js:127>) 用 `blockedPaths = ['taskboard', 'tasks', 'parking', 'parking_lot']` 跳过记忆抽取写入；这一条基本落实。
- **[低置信]** `.cursor/rules/local-doc-sync-preference.mdc` 和仓库根 `AGENTS.md` 都强调“改代码默认补 docs”，但最近若干代码提交没有逐一对应 changelog，说明“规则存在”不等于“执行稳定”。

## 附录 A：建议修复清单（按文档粒度分组）

- 修 `docs/03_specs/WEBSOCKET_PROTOCOL.md` 可一次解决 3 个高置信漂移：事件名、消息路由、聊天/工具相位语义。
- 修 `docs/03_specs/ELECTRON_IPC_CHANNELS.md` 可一次补齐脚本、MCP、音乐、AI.library、本地视觉占位通道。
- 修 `docs/03_specs/99_known_issues.md` 的 #8、#10、#13 说明，可解决 2 个关键误导和 1 个证据路径漂移。
- 修 `docs/00_ai_entry/image-flow-entry.md` 与 `audio-entry.md` 可解决图片服务层与 ASR 移除后的入口失真。
- 修 `docs/02_architecture/FEATURE_MAP.md` 可同时消除 `main_utf8` 残留和 ASR 自相矛盾。

## 附录 B：需人工决策项

- 两套提示词目录是否长期都保留，还是明确 `docs/01_system_prompts` 为唯一源、`resources/` 仅做打包镜像？
- `oct-gateway/FEATURE_MAP.md` 是否继续保留旧 BUG 编号体系，还是并入当前 `99_known_issues`？
- `WORKBENCH_ARCHITECTURE_PLAN.md` 这类已落地 proposal，是否要改状态、迁档，还是继续保留为“设计基线”？
- `self_eval.js` 既然主链停用，是否要在文档层统一标成“保留代码，不在主链启用”？

## 附录 C：原始命令输出（关键摘录）

### C1. WebSocket 协议 vs 代码

`rg -n "stream\.delta|stream\.done|thinking|tool_call|canvas|workbench|keepalive|chat\.send|chat\.done|turnId|ping" docs/03_specs/WEBSOCKET_PROTOCOL.md`

- `169: "event": "stream.delta | stream.done | thinking | workbench | canvas | ..."`
- `177-183: stream.delta / stream.done / thinking / keepalive / tool_call / workbench / canvas`

`rg -n "event: 'chat'|event: 'keepalive'|event: 'tool'|event: 'workbench'|event: 'canvas'|event: 'agent-phase'|turnId" oct-gateway/index.js oct-gateway/transport/ws.js src/hooks/useWebSocket.ts`

- `oct-gateway/index.js:352` `event: 'keepalive'`
- `oct-gateway/index.js:386` `event: 'chat'`
- `oct-gateway/index.js:268` `event: 'tool'`
- `oct-gateway/transport/ws.js:93` `event: 'agent-phase'`
- `src/hooks/useWebSocket.ts:186-189` 读取 `turnId`

### C2. IPC 漏项

`rg -n "ipcMain\.handle\('" electron/main.ts`

关键缺失通道：
- `save-script-draft-cache` `1732`
- `parse-script-file` `1760`
- `mcp-get-status` `2480`
- `mcp-add-server` `2487`
- `mcp-remove-server` `2505`
- `save-persona-settings` `3369`
- `music-generate` `3882`
- `lyrics-generate` `4009`

### C3. main_utf8 / FEATURE_MAP 漂移

`rg -n "main_utf8" .`

- `docs/02_architecture/FEATURE_MAP.md:133`
- `docs/07_research/main_utf8-evaluation-2026-04-21.md:*`

### C4. 99_known_issues 关键核查

`rg -n "selectBestApproach\(|require\('./hypothesis'\)" oct-gateway/index.js oct-gateway/hypothesis.js`

- `oct-gateway/index.js:67` only `require('./hypothesis')`
- `oct-gateway/hypothesis.js:6` function definition

`rg -n "truncateHistory\(|validateAndFixMessages" oct-gateway/ai.js`

- `oct-gateway/ai.js:71` `function truncateHistory(messages) {`
- `validateAndFixMessages`：无命中
