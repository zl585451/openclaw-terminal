# OmniRoute 执行计划（给 Kilo/Gemini）

> 目标：先完成 OCT AI 调用体系的盘点、边界定义和最小路由草案。第一轮不接入主流程，不重构 `config.js` / `ai.js` / `agent_runner.js`，不实现 Vault、Adapter、自愈或跨供应商 fallback。

## 0. 执行原则

- 本轮只做架构分析、文档、静态草案文件。
- 禁止修改以下核心调用链文件：
  - `oct-gateway/config.js`
  - `oct-gateway/ai.js`
  - `oct-gateway/agents/agent_runner.js`
  - `oct-gateway/runtime/toolLoop.js`
  - `oct-gateway/runtime/providerRouter.js`
  - `oct-gateway/gateway/slash.js`
- 如确实需要写代码，只允许新增一个未被任何主流程引用的静态路由草案文件。
- 不删除、不重命名、不迁移任何现有 key 字段。
- 不改变现有 `/model` 行为。
- 不改变工具调用执行逻辑。

## 1. 当前状态确认

开始执行前先确认工作区状态：

```powershell
git status --short
```

如存在无关改动，不要回滚，不要覆盖，先记录在交付说明中。只允许提交本任务明确新增的文档或草案文件。

## 2. 第 1 阶段：AI 调用入口盘点

输出文件：

- `docs/02_architecture/omniroute-ai-call-sites.md`

需要盘点所有会直接或间接调用模型的入口，至少覆盖：

- 主聊天流：`oct-gateway/ai.js`、`oct-gateway/runtime/chatEngine.js`
- HTTP 流式入口：`oct-gateway/transport/httpRoutes.js`
- 主工具循环：`oct-gateway/runtime/toolLoop.js`
- 独立 Agent：`oct-gateway/agents/agent_runner.js`
- Script Adapter 相关 Agent：`oct-gateway/script_adapter/**`
- 通用 LLM Client：`oct-gateway/services/llmClient.js`
- Summarizer：`oct-gateway/services/summarizer.js`、`oct-gateway/summarizer/client.js`
- Embedding：`oct-gateway/summarizer/embedding_client.js`
- Vision：`oct-gateway/image_analyzer.js`
- Image generation：`oct-gateway/image_gen.js`、`oct-gateway/tools/image_gen.js`
- Slash/model 能力探测：`oct-gateway/gateway/slash.js`

每个入口按表格记录：

| 模块 | 调用函数/位置 | 请求类型 | Key 来源 | Base URL 来源 | Model 来源 | 是否支持 tools | 是否主流程 | OmniRoute 第一阶段建议 |
|---|---|---|---|---|---|---|---|---|

“OmniRoute 第一阶段建议”只允许填：

- `observe-only`
- `draft-alias-only`
- `candidate-for-phase-2`
- `do-not-touch-yet`

## 3. 第 2 阶段：配置来源盘点

输出文件：

- `docs/02_architecture/omniroute-config-sources.md`

需要梳理 API key、Base URL、模型名来源。

至少覆盖这些配置源：

- Electron/userData `config.json`
- 本地 `oct-gateway/config.json`
- `.env` / `.env.local`
- 系统环境变量
- `~/.openclaw/openclaw.json`
- `google.profile.json`
- `providers.js` provider 预设
- `config.js` 中的 `getEnvOrConfig()`、`getProviderConfig()`、`DASHSCOPE_MODEL`

需要列出以下字段族：

- 主聊天：`OCT_PROVIDER`、`OCT_MODEL`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`NEWAPI_API_KEY`、`NEWAPI_BASE_URL`、`CUSTOM_*`
- Google：`GOOGLE_AI_API_KEY`、`GOOGLE_AI_BASE_URL`、`GEMINI_API_KEY`、`GOOGLE_API_MODE`、`GOOGLE_TOOLS_MODE`
- Kimi/Moonshot：`MOONSHOT_API_KEY`、`MOONSHOT_BASE_URL`
- MiniMax：`MINIMAX_API_KEY`、`MINIMAX_BASE_URL`
- SiliconFlow/Groq/OpenAI：对应 API key/baseUrl 字段以及是否复用 `DASHSCOPE_API_KEY`
- 专用链路：`SUMMARIZER_*`、`SCRIPT_ADAPTER_*`、`EMBEDDING_*`、`VISION_*`、`IMAGE_*`

每类配置按表格记录：

| 配置项 | 当前读取位置 | 优先级 | 使用模块 | 风险 | 迁移建议 |
|---|---|---|---|---|---|

重点标出：

- 哪些 provider 当前会复用 `DASHSCOPE_API_KEY`
- 哪些链路绕过了 `getProviderConfig()`
- 哪些链路有独立 key/model/baseUrl
- 哪些字段不能在第一阶段删除或改名

## 4. 第 3 阶段：最小逻辑能力设计

输出文件：

- `docs/02_architecture/omniroute-minimal-capabilities.md`

本轮只设计三条能力：

| 能力别名 | 范围 | 不包含 |
|---|---|---|
| `oct-chat` | 主聊天、普通问答、状态重写、低成本低延迟对话 | 工具调用、读图、embedding、图片生成 |
| `oct-plan` | 快速规划、摘要、结构化提取、复杂任务拆解 | 工具执行、跨供应商 fallback |
| `oct-tool-safe` | 需要 tool calling 的主工具循环和 Agent 任务 | 第一阶段不接入，只定义选择策略 |

需要说明：

- 为什么第一阶段不拆 `oct-plan-fast` / `oct-plan-deep`
- 为什么 `oct-vision`、`oct-embed` 暂缓
- 为什么工具调用必须从普通聊天模型切换中隔离出来

## 5. 第 4 阶段：静态路由草案

允许新增文件：

- `oct-gateway/runtime/omniRoute.mapping.draft.js`

要求：

- 只能导出静态对象和只读 helper。
- 不允许 require/import 现有 `config.js`。
- 不允许被任何现有文件引用。
- 不允许读取环境变量。
- 不允许实现 Vault、Adapter、fallback、自愈。

建议结构：

```js
'use strict';

const OMNI_ROUTE_CAPABILITIES = {
  'oct-chat': {
    description: 'Low-latency general chat.',
    tools: false,
    candidates: [
      { provider: 'current', model: 'current' },
      { provider: 'bailian', model: 'qwen-turbo' },
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
    ],
  },
  'oct-plan': {
    description: 'Planning and structured reasoning.',
    tools: false,
    candidates: [
      { provider: 'current', model: 'current' },
      { provider: 'bailian-coding', model: 'qwen3.5-plus' },
      { provider: 'newapi', model: 'qwen3.6-plus-2026-04-02' },
    ],
  },
  'oct-tool-safe': {
    description: 'Strict tool calling channel.',
    tools: true,
    candidates: [
      { provider: 'bailian-coding', model: 'qwen3.5-plus' },
      { provider: 'openai', model: 'gpt-4o' },
    ],
  },
};

module.exports = { OMNI_ROUTE_CAPABILITIES };
```

具体模型名可以根据现有 `providers.js` 修正，但不得引入不存在于当前 provider 预设或配置中的强假设。

## 6. 第 5 阶段：迁移路线图

输出文件：

- `docs/02_architecture/omniroute-migration-roadmap.md`

路线图必须分为三期。

### Phase 1：Observe + Draft

现在就做：

- 完成调用入口盘点。
- 完成配置来源盘点。
- 完成三条能力别名设计。
- 新增静态 mapping 草案。
- 明确第一阶段不接入主流程。

### Phase 2：Soft Integration

未来再做：

- 给主聊天入口增加可选 `capability` 参数，但默认行为必须与当前完全一致。
- 只接 `oct-chat` 和 `oct-plan`。
- 不接 `oct-tool-safe`。
- 不改 `agent_runner.js`。
- 不改 `/model`。
- 增加回归测试，证明旧配置仍然可用。

### Phase 3：Governance

长期再做：

- 接入 `oct-tool-safe`。
- 引入工具 schema 检查。
- 引入 provider-specific adapter。
- 引入 key 规范化和 CredentialResolver。
- 引入 fallback、限流、成本统计。
- 最后再考虑 `/model` 语义改造。

## 7. 验收标准

本轮完成后必须满足：

- `git diff --stat` 只出现新增文档和可选的 `omniRoute.mapping.draft.js`。
- 不出现 `config.js`、`ai.js`、`agent_runner.js`、`toolLoop.js` 的 diff。
- 文档能回答：
  - 现在有哪些模型调用入口
  - 每个入口 key/baseUrl/model 从哪里来
  - 哪些入口第一阶段不能碰
  - 三条最小能力如何映射
  - 后续每阶段做什么、不做什么
- 静态草案文件未被任何主流程引用：

```powershell
rg "omniRoute.mapping.draft" oct-gateway -g "*.js"
```

除草案文件自身外，不应有结果。

## 8. 交付说明模板

Kilo/Gemini 完成后，请按以下格式输出：

```text
完成内容：
- 新增/修改文件列表
- 每个文件用途

未做内容：
- 未改核心调用链
- 未实现 Vault/Adapter/Fallback
- 未改工具执行逻辑

发现的问题：
- key 混用点
- 独立调用入口
- 高风险迁移点

建议下一步：
- Phase 2 是否可以开始
- Phase 2 推荐先接哪个入口
```
