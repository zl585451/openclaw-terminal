# Changelog: 文本改编师 Gateway 真实 LLM（Week 3 Track 1）

日期：2026-04-26

## 摘要

从 `summarizer` 抽取共用 `llmClient`；`adapter.audiobook_text_rewriter@1.0` 在 feature flag 与非空 `sourceText` 下可走真实 JSON 台本改编；失败回退占位产物不中断 pipeline。工作台开工确认书增加测试原文输入框；IPC / Gateway 透传 `sourceText`。

## 改动文件

| 路径 | 说明 |
|------|------|
| `oct-gateway/services/llmClient.js` | 新建：非流式 chat completion、`resolveProviderFor('script_adapter')` |
| `oct-gateway/services/summarizer.js` | 改用 `llmClient.chatCompletion`，超时/HTTP 错误映射保持原摘要语义 |
| `oct-gateway/script_adapter/agents/textRewriterAgent.js` | 新建：真实改编 prompt + JSON 解析 |
| `oct-gateway/script_adapter/mockArtifactFactory.js` | `createArtifactForAgent` 改为 async dispatcher |
| `oct-gateway/script_adapter/agentRunner.js` | `await createArtifactForAgent`，`ctx.sourceText` |
| `oct-gateway/script_adapter/mock_execution.js` | 透传 `sourceText`，启动日志 `sourceTextLen` |
| `oct-gateway/config.js` | 暴露 `config.scriptAdapter`（读 env / `config.json` 合并） |
| `oct-gateway/test/textRewriterAgent.test.js` | 新建：空输入、超长、可选 live |
| `electron/main.ts` / `electron/preload.ts` | `script-adapter-run-start` 增加 `sourceText` |
| `src/types/electronAPI.ts` | 类型追加 `sourceText?` |
| `src/modules/script-adapter/services/gatewayExecution.ts` | `StartGatewayExecutionPayload.sourceText` |
| `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx` | 测试原文 textarea |
| `src/modules/script-adapter/styles/scriptAdapter.module.css` | `.testInputArea` 样式 |
| `docs/02_architecture/summarizer-service.md` | 记录 `llmClient` |
| `docs/02_architecture/script-adapter-gateway-protocol.md` | dispatcher / 真实 agent / `sourceText` |
| `docs/02_architecture/FEATURE_MAP.md` | 服务与 script_adapter 一行 |
| `docs/03_specs/内容创作工作台/00_项目接手指南.md` | V2.23、5.1 状态 |
| `docs/03_specs/内容创作工作台/内容创作Gateway执行桥接协议.md` | `sourceText` 字段 |
| `docs/00_ai_entry/content-creation-entry.md` | Gateway 真实改编师与文档指针 |

## 配置项

| 变量 / 配置键 | 默认 | 说明 |
|---------------|------|------|
| `SCRIPT_ADAPTER_REAL_AGENTS` | 空（关） | `off` / `0` / `false` 关；`all` / `1` / `true` / `on` 全开；或逗号分隔 agent id |
| `SCRIPT_ADAPTER_BASE_URL` | 空 | 完整 triplet 时优先于 summarizer |
| `SCRIPT_ADAPTER_API_KEY` | 空 | 同上 |
| `SCRIPT_ADAPTER_MODEL` | 空 | 同上；否则经 `SUMMARIZER_*` 或当前 Gateway provider 解析 |

启用示例（PowerShell）：

```powershell
$env:SCRIPT_ADAPTER_REAL_AGENTS='adapter.audiobook_text_rewriter@1.0'
$env:SCRIPT_ADAPTER_MODEL='qwen-max-latest'   # 可选
# 重启 oct-gateway
```

## 已知限制

- 仅第一个 Agent（文本改编师）有真实分支；其余仍为 mock。
- 执行单未持久化，刷新即丢（Week 4+）。
- `response_format: json_object` 对部分 OpenAI 兼容端可能不支持；若 400 可改网关侧关闭该字段（见 Week3 handoff 卡壳速查）。
- 单次 live 调用成本量级参考：qwen-max 约 0.05 元/次、deepseek 约 0.02 元/次（随厂商计价变动）。

## 验收日志（占位）

人工验收时请在 Gateway 日志中确认：`script adapter run start` 含 `sourceTextLen`；启用真实改编后首段 artifact 为 LLM 产出 segments。

---

## 修正轮（同日）

下游 mock 与上游 `adapted_script` 对齐、`config.scriptAdapter` 运行时生效：见 `docs/05_changelog/2026-04-26-script-adapter-track1-downstream-config-fix.md`。
