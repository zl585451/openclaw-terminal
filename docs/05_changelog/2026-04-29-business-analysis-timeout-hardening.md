# 2026-04-29 业务分析 Agent 超时加固

## 背景

第三个确认页显示 `业务分析 Agent 初读` 失败，错误为 `LLM 请求超时:45000ms`。状态机证据显示前置规则步骤已成功，失败发生在真实 Agent 调用模型阶段。

## 根因

1. `businessAnalysisOrchestrator` 对真实 LLM 调用使用硬编码 `timeoutMs: 45000`。
2. 同一次请求最多塞入 `12000` 字正文，并要求模型输出严格 JSON。
3. 当前 provider 为 MiniMax-M2.7，长上下文 JSON 结构化输出在 45 秒窗口内不稳定，容易被 Gateway 主动 abort。

## 修改

1. 默认业务分析 LLM 超时调整为 `120000ms`。
2. 支持通过 `SCRIPT_ADAPTER_ANALYSIS_TIMEOUT_MS` 或 `scriptAdapter.analysisTimeoutMs` 配置超时。
3. 业务分析 prompt 不再直接截取前 `12000` 字，而是按头部、中段、尾段抽样，默认输入预算 `7000` 字。
4. 支持 `SCRIPT_ADAPTER_ANALYSIS_INPUT_CHARS` / `scriptAdapter.analysisInputCharBudget` 调整首轮输入预算。
5. 对超时、JSON 截断等可恢复错误，使用更紧凑样本重试一次；重试仍调用真实 LLM，不降级为 mock。
6. 重试成功时模型字段会标记 `(compact retry)`，方便前端状态机留痕。
7. 当业务分析 Agent 因额度不足、限流、超时或 provider 网络错误失败时，Gateway 会追加 `rule_strategy_fallback` 规则步骤，生成保守策略报告并允许继续进入工作台。
8. 规则兜底不会伪装成 Agent 成功；状态机仍保留 `business_analysis` 的 failed 证据和原始错误。
9. 修正 script_adapter LLM 选择优先级：从 `SCRIPT_ADAPTER -> SUMMARIZER -> 当前 provider` 改为 `SCRIPT_ADAPTER -> 当前 provider -> SUMMARIZER`，避免内容创作被摘要模型配置劫持。
10. 业务分析成功时，状态机 `model` 会显示模型来源和 host，便于确认实际打到哪家 provider。

## 验证

1. `node --check oct-gateway/script_adapter/businessAnalysisOrchestrator.js`
2. `node --check oct-gateway/services/llmClient.js`
3. `npx tsc --noEmit`
4. `npx tsc -p tsconfig.electron.json --noEmit`
