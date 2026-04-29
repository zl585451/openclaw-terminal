# 2026-04-29 文本改编 JSON 截断重试

## 本次改动

1. 调整 `oct-gateway/script_adapter/agents/textRewriterAgent.js`：
   - 文本改编默认 `max_tokens` 从 2000 提升为 6000。
   - 新增 `SCRIPT_ADAPTER_TEXT_REWRITER_MAX_TOKENS` / `scriptAdapter.textRewriterMaxTokens` 覆盖，范围 `2000` 到 `16000`。
   - 长章节分片从约 3500 字收紧到约 2200 字，降低单次 JSON 输出被截断的概率。
   - JSON 解析支持从 markdown 围栏或前后解释中提取第一个完整 JSON 对象。
   - 首次输出为空或坏 JSON 时，用更低温度和更紧凑提示自动重试一次。
2. 更新测试覆盖：
   - 围栏/前后缀 JSON 提取。
   - 坏 JSON 自动重试。
   - 切片失败必须显式失败，不交付半成品。
3. 同步更新内容创作入口与 Gateway 执行桥接文档。

## 背景

用户将真实制作模型切到硅基流动 Kimi 后，最后一步文本改编报：

`TEXT_REWRITER_REAL_FAILED: TEXT_REWRITER_BAD_JSON: Unterminated...`

这类错误通常不是鉴权或模型不可用，而是产物生成请求输出太长，模型在 JSON 对象闭合前被 `max_tokens` 截断。

## 结果

真实模式仍保持失败显式暴露，不会回退 mock；但对常见的 JSON 围栏、前后缀和一次性截断会自动修复或重试，减少用户手动换模型/重跑的次数。
