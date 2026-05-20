# OmniRoute 迁移路线图

本文档是 OCT OmniRoute 迁移的当前执行基准。后续 Kilo/Cursor/Gemini 执行与 Codex 阶段验收都应以本文档为准。

执行原则：

- 一个 Phase 是一个完整交付物，不拆成多轮碎片任务。
- 每个 Phase 完成后停止，由 Codex 做代码审查、测试验证、commit 与 tag。
- 不临时新增阶段；如需改变阶段边界，先说明原因。
- 默认保持后向兼容，不破坏 `/model`、现有 Provider、现有工具执行逻辑。

---

## 当前完成状态

| Phase | 状态 | Tag | 实际交付 |
| --- | --- | --- | --- |
| Phase 1: Observe + Draft | 已完成 | 包含于后续提交 | 调用入口盘点、配置来源盘点、三条最小能力别名设计、静态映射草案 |
| Phase 2: Soft Integration | 已完成 | `omniroute-phase2-oct-plan-soft-routing` / `omniroute-phase2-capability-passthrough` | `oct-plan` 软接入 script_adapter 与 summarizer；主聊天链路具备 capability 透传能力 |
| Phase 3: Tool-Safe Governance | 已完成 | `omniroute-phase3-tool-safe-governance` | 工具循环与带工具 Agent 自动尝试 `oct-tool-safe`；无工具 Agent 保持原行为 |
| Phase 4: Config Governance Status | 已完成 | `omniroute-phase4-config-governance` | 能力路由定义抽离、轻量 CredentialResolver、只读状态诊断、仅本机可访问的 `/omniroute/status` |
| Phase 5: Request Fallback & Error Governance | 已完成 | `omniroute-phase5-request-fallback` | 统一网络与可恢复 HTTP 错误分类分类器、非流式与流式下受控能力候选集循环自愈重试机制 |
| Phase 6: ToolAdapter Minimal Governance | 已完成 | `omniroute-phase6-tool-adapter` | 最小 ToolAdapter 参数清洗、尾逗号修复、Markdown 脱壳与截断 JSON 的保守失败防护 |

---

## 当前实际能力

OCT 当前已经具备以下实际功能：

- 对内有三条核心能力别名：
  - `oct-chat`：普通聊天与轻量对话。
  - `oct-plan`：规划、摘要、剧本整理等非工具型任务。
  - `oct-tool-safe`：工具循环与带工具 Agent 的安全工具通道。
- `oct-plan` 已接入 script_adapter 子 Agent 与 summarizer。
- 主聊天链路已支持 capability 透传，为 `oct-chat` 继续接入保留入口。
- 工具循环与带工具 Agent 已具备 `oct-tool-safe` 隔离能力。
- OmniRoute 可以诊断每条能力背后的候选通道是否具备 Base URL、API Key、Model。
- `/omniroute/status` 提供本地只读诊断，不返回 API Key 明文，且非本机请求被拒绝。

当前尚未具备：

- 统一 Vault 或加密凭证管理。
- 完整策略化 fallback 配置、权重治理与 UI 可视化管理。
- ToolAdapter、VisionAdapter 或 provider-specific payload adapter。
- 成本统计、token 账单、限流。
- UI 配置页或用户可视化路由权重调整。

---

## Phase 1: Observe + Draft

### 阶段目标

不修改任何核心调用链代码，完成架构盘点、资产梳理，定义最小逻辑路由，并以解耦草案文件落地。

### 已完成交付

- `docs/02_architecture/omniroute-ai-call-sites.md`
- `docs/02_architecture/omniroute-config-sources.md`
- `docs/02_architecture/omniroute-minimal-capabilities.md`
- `oct-gateway/runtime/omniRoute.mapping.draft.js`

### 验收状态

已完成。该阶段只做观察与草案，不改核心调用链。

---

## Phase 2: Soft Integration

### 阶段目标

以低侵入方式引入 `oct-plan` 与 capability 透传。默认物理 Provider、模型名、凭证来源保持不变。

### 已完成交付

- `oct-gateway/services/llmClient.js` 支持可选 `capability`。
- script_adapter 子 Agent 显式传入 `oct-plan`。
- `oct-gateway/services/summarizer.js` 在原 summarizer 配置缺失时可走 `oct-plan`。
- `oct-gateway/runtime/chatEngine.js` 与 `oct-gateway/transport/httpRoutes.js` 支持 capability 透传占位。
- 对应 Vitest 覆盖已补齐。

### 验收状态

已完成并打标：

- `omniroute-phase2-oct-plan-soft-routing`
- `omniroute-phase2-capability-passthrough`

---

## Phase 3: Tool-Safe Governance

### 阶段目标

接入 `oct-tool-safe`，让工具循环与带工具 Agent 在需要工具调用时优先走稳定工具通道，同时保持无工具任务原行为不变。

### 已完成交付

- 新增 `oct-gateway/runtime/omniRoute.js` 作为 OmniRoute 主解析入口。
- `oct-gateway/ai.js` 支持 capability 解析，并在工具续轮场景触发 `oct-tool-safe`。
- `oct-gateway/runtime/toolLoop.js` 在工具结果续轮时传入 `oct-tool-safe`。
- `oct-gateway/agents/agent_runner.js` 仅在 `allowedTools` 非空时尝试 `oct-tool-safe`。
- 测试覆盖工具 Agent、无工具 Agent、fallback 保留等关键契约。

### 验收状态

已完成并打标：

- `omniroute-phase3-tool-safe-governance`

---

## Phase 4: Config Governance Status

### 阶段目标

建立轻量配置治理基础。将能力路由定义、候选物理通道、Key/Base URL 可用性判断整理成独立可测试模块，并提供本地只读状态诊断。

### 已完成交付

- `oct-gateway/runtime/omniRoute.routes.js`
  - 抽离三条能力别名与候选物理通道定义。
- `oct-gateway/runtime/omniRoute.credentials.js`
  - 只读封装现有 `config.PROVIDERS` 与 `config.getEnvOrConfig`。
  - 判断候选通道是否具备 Base URL、API Key、Model。
- `oct-gateway/runtime/omniRoute.js`
  - 保留原 `resolveCapability` 等 API。
  - 新增 `inspectCapability`、`listCapabilityStatus`。
- `GET /omniroute/status`
  - 本地只读诊断接口。
  - 非本机请求返回 403。
  - 不返回 API Key 明文。

### 验收状态

已完成并打标：

- `omniroute-phase4-config-governance`

---

## Phase 5: Request Fallback & Error Governance

### 阶段目标

在不改变默认行为的前提下，为 OmniRoute 建立请求级错误治理基础。重点处理 429、5xx、网络超时等可恢复错误，并允许能力别名在同一请求上下文中尝试下一个可用候选。

### 范围

允许做：

- 为 OmniRoute 增加统一错误分类。
- 为能力路由增加“请求失败后尝试下一个候选”的最小机制。
- 仅对显式 capability 调用启用 fallback。
- 保留原 providerRouter 既有 fallback 语义。
- 增加详细测试覆盖。

禁止做：

- 不做 Vault。
- 不做 UI。
- 不做成本统计。
- 不做 ToolAdapter。
- 不改变 `/model` 命令。
- 不让无 capability 的普通调用进入新 fallback。

### 预期交付

- 新增或扩展 OmniRoute fallback helper。
- `ai.js` 或统一调用出口在显式 capability 下支持受控重试。
- 测试覆盖：
  - 429/5xx 触发下一候选。
  - 401/403 不盲目重试。
  - 无 capability 保持原行为。
  - `originalResolve` 路径不破坏原 fallback 属性。

---

## Phase 6: ToolAdapter Minimal Governance

### 阶段目标

治理工具调用最容易失败的输入输出格式问题，但不改工具执行语义。

### 范围

允许做：

- Tool Schema pre-flight 检查。
- tool call 参数 Markdown code fence 清理。
- 明显 JSON 字符串包裹修正。
- 截断 JSON 的保守失败报告。
- 测试覆盖常见 tool_calls 参数异常。

禁止做：

- 不改变 tools 目录下具体工具实现。
- 不做命令注入复杂策略。
- 不做跨供应商完整 tool spec adapter。
- 不让 adapter 自动执行任何工具。

### 预期交付

- 最小 ToolAdapter 模块。
- 接入点仅在 tool call 参数解析前后。
- 失败时给出清晰错误，不进入死循环。

### 验收状态

已完成并打标：

- `omniroute-phase6-tool-adapter`

---

## Phase 7: Credential Vault / 配置收敛

### 阶段目标

开始从“读取旧配置”走向“统一凭证与路由配置”，但必须渐进迁移，避免破坏用户现有配置。

### 范围

允许做：

- 设计并实现最小 `omniRoute.config.json` 或等价配置结构。
- 支持为 `oct-chat`、`oct-plan`、`oct-tool-safe` 配置候选优先级。
- 旧 `.env`、`config.json` 继续兼容。
- 提供迁移提示和配置校验。

禁止做：

- 不一次性删除旧配置。
- 不强制用户迁移。
- 不把 Key 明文暴露给 renderer。
- 不做复杂 UI。

### 预期交付

- 最小配置结构。
- 只读/写入 helper。
- 迁移兼容测试。

---

## Phase 8: Observability, Cost & Rate Limits

### 阶段目标

为 OmniRoute 增加运行时观测能力，记录每条能力、每个 provider 的延迟、错误率和 token 使用，为后续成本治理打基础。

### 范围

允许做：

- 记录能力别名、provider、model、耗时、状态码、错误类型。
- 如果响应中有 token usage，则记录 usage。
- 提供本地只读状态接口。
- 增加简单限流预留接口。

禁止做：

- 不做复杂账单系统。
- 不做云端上报。
- 不上传用户 prompt 或响应内容。
- 不默认阻断用户请求。

### 预期交付

- 本地 metrics 聚合。
- 只读诊断输出。
- 测试覆盖脱敏与无内容泄露。

---

## Phase 9: UI / Operations Panel

### 阶段目标

在前面配置、fallback、观测能力稳定后，再考虑 UI 化，让用户能看到逻辑能力状态，而不是直接面对一堆物理模型。

### 范围

允许做：

- 展示 `oct-chat`、`oct-plan`、`oct-tool-safe` 当前解析结果。
- 展示候选通道是否可用。
- 展示最近错误与延迟。
- 提供只读优先的运维面板。

禁止做：

- 不在 UI 中显示 API Key。
- 不在未完成 Vault 前做复杂 Key 编辑。
- 不改变 `/model` 原命令语义。

---

## 后续执行规则

后续每个 Phase 都应由 Codex 输出一次完整 Kilo/Cursor 执行口令。执行 AI 完成后必须输出：

```text
完成内容：
- 修改文件列表：
- 每个文件改了什么：

未做内容：
- 是否改了禁止文件：
- 是否改了核心调用链：
- 是否改了工具执行逻辑：
- 是否引入新依赖：

验证状态：
- 执行了什么测试：
- 测试结果：

风险/备注：
- 是否存在默认行为变化：
- 需要 Codex 重点审查的文件/逻辑：
```

Codex 验收规则：

- 先看 git diff 与关键文件。
- 再跑必要测试。
- 先给“通过 / 不通过”。
- 通过后 commit + tag。
- 不通过时只给一个集中返工口令。
