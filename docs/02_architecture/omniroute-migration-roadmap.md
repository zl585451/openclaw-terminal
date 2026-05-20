# OmniRoute 迁移路线图 (Phase 1)

为确保 OpenClaw Terminal (OCT) 在向多模型、多通道自适应路由演进的过程中不发生破坏性回归，本路线图规划了分阶段的迁移和整合战略。整体迁移分为三个核心阶段。

---

## Phase 1: Observe + Draft (观察与静态草案阶段)

### 1.1 阶段目标
不修改任何核心调用链代码，完成架构盘点、资产梳理，定义最小的逻辑路由并以完全解耦的静态文件方式落地。

### 1.2 交付物与行动项
- **调用入口盘点**：梳理并输出 `docs/02_architecture/omniroute-ai-call-sites.md`，明确系统内大模型调用的发起位置。
- **配置来源盘点**：梳理并输出 `docs/02_architecture/omniroute-config-sources.md`，盘点所有 API Key 和 Base URL 的读取行为和 fallback 级联顺序。
- **最小能力设计**：输出 `docs/02_architecture/omniroute-minimal-capabilities.md`，完成对 `oct-chat`、`oct-plan`、`oct-tool-safe` 三大核心能力的边界界定。
- **静态映射草案**：创建 `oct-gateway/runtime/omniRoute.mapping.draft.js`。该文件仅供参考，禁止被任何主逻辑引用，且不得包含环境变量或任何对 `config.js` 的动态引用。
- **验证原则**：对整个网关进行静态扫描，确保未对主逻辑调用链文件（`config.js`、`ai.js`、`agent_runner.js`、`toolLoop.js`、`providerRouter.js`、`slash.js`）引入任何修改，保证 100% 后向兼容。

---

## Phase 2: Soft Integration (轻量软件集成阶段)

### 2.1 阶段目标
以极低侵入性的方式将 `oct-chat` 和 `oct-plan` 引入核心聊天链路。此时，系统的物理行为（如默认的提供商、模型名和凭证来源）必须与此前完全一致，只有当特定参数被显示传递时，才触发能力软切换。

### 2.2 具体行动项
1. **轻量参数扩展**：
   - 保持 `/model` 切换及 `OCT_MODEL` 语义完全不变。
   - 在 `streamChat` / `chatCompletion` 入口参数中增加可选的 `capability` 字段（例如 `{ capability: 'oct-chat' }`）。若不传或传入未知能力，其调用行为与当前的全局 providerRouter 解析完全一致。
2. **打通软解析链路**：
   - 仅将逻辑能力别名应用到：
     - `oct-chat`：普通对话、文本重写。
     - `oct-plan`：工具结果自动压缩（`toolResultSummarizer.js`）、剧本引擎的提取与整理子 Agent 等。
   - **不接入** `oct-tool-safe`：主工具循环（`toolLoop.js`）及 `agent_runner.js` 在该阶段仍保持硬编码或基于原全局 Active Provider 的解析逻辑。
   - **不改动** `/model` 切换命令的行为。
3. **安全防错与回归测试**：
   - 为 `streamChat` 增加兜底防御：当通过 `capability` 查找物理模型失败（如对应候选提供商没有配置 Key）时，静默、无感地退回并使用全局当前的 Active Provider。
   - 增加回归测试单元（Vitest 脚本），证明在没有配置任何专门的能力别名 Key 时，系统读取旧版 `.env` / `config.json` 依然能完全正常地启动和响应对话。

---

## Phase 3: Governance (全面路由治理阶段)

### 3.1 阶段目标
实现高可用、可自愈、带跨商商级 Fallback 和成本限流机制的完整 OmniRoute 调用网关。在这一阶段中，彻底切断物理模型配置与业务场景的硬耦合。

### 3.2 具体行动项
1. **接入 `oct-tool-safe`**：
   - 开启工具调用隔离。即使主聊天切换到了快速/弱工具支持模型（如 R1、Thinking 等专注于思考或极速响应的纯文本模型），凡是进入 Tool 循环的任务自动路由到经过严格白盒测试的 `oct-tool-safe` 物理通道。
2. **引入统一账密解析器 (CredentialResolver / Vault)**：
   - 统一整理、解耦 `providers.js` 中的服务商，建立全新的凭证保管箱（CredentialResolver）。
   - 用户不再混用 `DASHSCOPE_API_KEY`，而是通过图形化界面为 `oct-chat`、`oct-plan`、`oct-tool-safe` 三大逻辑别名分别分配其优先级的 Key、Base URL，并支持无感绑定到多条物理中转链。
3. **引入多级 Fallback 与自愈层 (Fallback & Self-Healing)**：
   - 对 `streamChat` 和 `chatCompletion` 封装统一的逻辑层重试（例如，百炼 Coding Plan 的 `qwen3.5-plus` 如果返回 500 或 429 报错，自动降级至 DeepSeek 官方直连通道）。
4. **格式检查器与适配层 (Adapters)**：
   - 引入各物理提供商特有的适配器（Provider-specific Adapter），负责处理思考文本（Thinking/Reasoning Content）、多模态 payload 变换等底层差异，向业务层提供完全一致的统一 payload。
5. **成本统计与限流 (Rate Limiting & Token Cost)**：
   - 在统一逻辑出口处监控每一次物理调用的 Token 消耗、耗时、计费，并由 OpsScheduler 统一拦截违规的突发大流量或超时请求。
6. **最终语义重构**：
   - 将主界面底部的模型名称从单纯的「物理名称」（如 `qwen-plus`）向「逻辑角色别名」（如「极速对话」、「重推理规划」、「高刚性工具」）转换，让普通用户彻底摆脱对繁杂物理模型及中转商的记忆负担。
