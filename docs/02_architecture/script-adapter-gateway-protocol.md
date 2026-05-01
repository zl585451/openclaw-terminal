# Script Adapter Gateway Protocol

更新时间：2026-05-02（补充 voice-type / viewpoint 规则协议、系统音与 SFX 分流）

本文记录内容制作工作台 Week 2 Track C 起的 Gateway 状态机骨架。当前为「前两步可选真实 LLM + 后三步 mock」的混合 pipeline；transport、registry、cancel/list 入口已按后续真实 agent runner 的形状拆开。

## 模块边界

- `oct-gateway/script_adapter/mock_execution.js`
  - 对外暴露 `startMockScriptAdapterRun`、`cancelMockScriptAdapterRun`、`listMockScriptAdapterRuns`。
  - 负责创建 execution sheet，并把 runner、emitter、registry 串起来。
- `oct-gateway/script_adapter/runRegistry.js`
  - 记录运行中的 task。
  - 顶层 run status 支持 `running`、`completed`、`failed`、`cancelled`。
  - 对前端 sheet 仍保持现有 `pending/running/completed/failed/awaiting_review` 状态集合，避免扩大 UI 类型面。
- `oct-gateway/script_adapter/agentRunner.js`
  - 顺序执行 mock agents；每步将当前 `sheet.artifacts` 传入工厂，供下游 mock 读取已产出的 `adapted_script`。
  - 接收 `AbortSignal`，取消时抛出 `AbortError`。
- `oct-gateway/script_adapter/eventEmitter.js`
  - 将 runner 事件包装为 Gateway transport event：`{ type: 'event', event: 'script-adapter', payload }`。
- `oct-gateway/script_adapter/mockArtifactFactory.js`
  - 默认生成 mock artifact；在 `SCRIPT_ADAPTER_REAL_AGENTS`（见 `isRealAgentEnabled`）启用时：`adapter.audiobook_text_rewriter@1.0` 在开工传入非空 `sourceText` 时走 `agents/textRewriterAgent.js` 真实 LLM；`classifier.voice_role_marker@1.0` 走 `agents/voiceClassifierAgent.js` 消费上游 `adapted_script.segments`。
  - 真实模式下文本改编、演播设计、质检、打包失败仍显式抛错，不静默回退 mock/占位产物。角色音统筹是可降级分析步骤：真实 LLM 超时、网络失败或只返回旁白时，Gateway 必须基于上游 `adapted_script.segments` 生成 `degraded: true` 的规则角色音表，让章节继续交付，并在 artifact summary / metrics 中暴露降级原因。
  - 若 `artifacts` 内已有 `adapted_script`，后续三个 Agent 的 mock 产物从该 payload 推导 speaker、`segmentId`、段数与 manifest 命名，避免与真实头部穿帮。
  - 真实 Agent 开关读取顺序：`config.scriptAdapter.realAgents`（`config.json` 嵌套 `scriptAdapter` 与 env 已在 `config.js` 合并）→ 顶层 `SCRIPT_ADAPTER_REAL_AGENTS` env/配置键。
- `oct-gateway/script_adapter/agents/textRewriterAgent.js`
  - 文本改编师真实调用（JSON 台本结构）。默认切片约 2200 字，输出预算 6000 tokens；若模型返回带前后缀、围栏或不完整 JSON，会先提取 JSON 对象，解析失败时用紧凑提示自动重试一次。
- `oct-gateway/script_adapter/viewpointResolver.js`
  - 规则层章节视角推断。输入原文、quote span、候选说话人和归因结果，输出 `viewpoint/candidates/confidence/evidence`。不得使用跨书默认主角；推不出视角时返回空，OS 抽取应保守跳过。
  - 角色名清洗会剔除动作词、状态词、上下文短语，避免 `嗫嚅`、`没听过他`、`欠` 等污染 OS speaker。
- `oct-gateway/script_adapter/voiceTypeClassifier.js`
  - 规则层声音类型分类。统一识别 `narrator`、`character`、`inner_monologue`、`unresolved_voice`、`system_voice`、`device_voice`、`sfx`、`group_voice`、`cue`，供 composer、角色音降级和 QC 复用。
  - `system_voice` 只保留系统/面板/任务/奖励等语义提示；`device_voice` 保留对讲机、广播、电话等介质传声；`sfx` 保留咔、咚、滋啦等纯拟声词。
- `oct-gateway/script_adapter/innerVoiceSpanExtractor.js`
  - 规则层 OS 抽取。除原有强 OS 规则外，新增 OS Span Guard：单字、数字、孤立解释词或概念列表不独立生成 `inner_monologue`。
- `oct-gateway/script_adapter/agents/voiceClassifierAgent.js`
  - 角色音统筹真实调用：本地聚合出场统计 + 每个角色少量代表片段 + LLM 输出类别与声线建议。
  - 输入不得重复整章正文；代表片段上限为每个角色 2 条、总计 16 条。默认真实调用超时为 `35000ms`，超时后由 Gateway 生成降级角色音表。
  - 角色音表后处理必须先尊重 voice type：`unresolved_voice` 不能因出场次数升级为 main，`system_voice` / `device_voice` / `sfx` 不能进入普通角色音池，统一归入功能声音类别但保留 roleName。
- `oct-gateway/services/llmClient.js`
  - 与 `summarizer` 共用的非流式 chat completion 客户端；`resolveProviderFor('script_adapter')` 在 `SCRIPT_ADAPTER` 三元组上优先读 `config.scriptAdapter.baseUrl|apiKey|model`，再回退 `SCRIPT_ADAPTER_*`，其次 `SUMMARIZER_*`（含 memory），再降级当前 Gateway provider。

## Transport Methods

### `scriptAdapter.run.start`

请求：

```json
{
  "type": "req",
  "id": "script_adapter_...",
  "method": "scriptAdapter.run.start",
  "params": {
    "taskId": "task-id",
    "taskTitle": "多人演播有声书样章",
    "source": "content-workbench",
    "useMock": true,
    "sourceText": ""
  }
}
```

响应：

```json
{
  "type": "res",
  "ok": true,
  "method": "scriptAdapter.run.start",
  "payload": {
    "type": "script-adapter-run-started",
    "taskId": "task-id",
    "planId": "plan-task-id"
  }
}
```

### `scriptAdapter.run.cancel`

请求参数：`taskId`、可选 `reason`。

成功时 registry 顶层状态变为 `cancelled`，runner 通过 `AbortController` 停止；推送给 UI 的 sheet 使用 `overallStatus: "failed"`，当前 running agent 标记为 `failed` 并带 `error: "cancelled_by_user"`。

### `scriptAdapter.run.list`

返回 registry 中的轻量 run 列表：

```json
{
  "type": "script-adapter-run-list",
  "runs": [
    {
      "taskId": "task-id",
      "planId": "plan-task-id",
      "taskTitle": "多人演播有声书样章",
      "status": "running",
      "createdAt": "2026-04-26T...",
      "updatedAt": "2026-04-26T..."
    }
  ]
}
```

## Electron Bridge

- IPC handlers:
  - `script-adapter-run-start`
  - `script-adapter-run-cancel`
  - `script-adapter-run-list`
- Preload APIs:
  - `window.electronAPI.startScriptAdapterRun(payload)`
  - `window.electronAPI.cancelScriptAdapterRun({ taskId, reason })`
  - `window.electronAPI.listScriptAdapterRuns()`
  - `window.electronAPI.onScriptAdapterEvent(callback)`

Electron main process now tracks pending script adapter request ids, so start/cancel/list can receive Gateway `res` payloads instead of being fire-and-forget.

### 书库（Week 4 Track 1，不经 Gateway）

- IPC：`library:list`（`{ limit?, offset? }`）、`library:get`（`{ bookId }`）、`library:chapters`（`{ bookId }`）、`library:chapter`（`{ bookId, chapterIndex }`）。main 使用 `fetch` 访问 `resolvedAiLibraryUrlForGateway`（缺省 `http://127.0.0.1:8001`）下的 `/api/library/*`。
- Preload：`window.electronAPI.library.list|get|chapters|chapter`。
- 工作台封装：`src/modules/script-adapter/services/aiLibraryClient.ts`。

## Frontend Service

`src/modules/script-adapter/services/gatewayExecution.ts` exposes:

- `startGatewayExecution(payload)`
- `cancelGatewayExecution(taskId)`
- `listGatewayExecutions()`
- `subscribeGatewayExecutionEvents(callback)`

The UI does not yet show a cancel button or run history panel; this commit only opens the stable bridge for those controls.
