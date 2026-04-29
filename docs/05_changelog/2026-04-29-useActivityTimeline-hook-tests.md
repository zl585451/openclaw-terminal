# 变更：useActivityTimeline 测试与 CoT 标记对齐 cotExtract

**日期：** 2026-04-29  
**分支：** `test/coverage-round2`

- `src/utils/cotExtract.ts`：导出 `AssistantCotTagSpec` 与 `ASSISTANT_COT_MARKER_SPECS`（内容与内部 `TAG_SPECS`/`findNextTag` 一致）。

- **`scheduleCotSyncFromFullText` 支持的三种思维链包裹**（在同一字符串中按**开标签出现位置取最早者**，与 `cotExtract` 的首段逻辑一致）：
  1. **方括号：** `[cot]` … `[/cot]`
  2. **短 XML：** `THINK_OPEN` / `THINK_CLOSE`（见 `cotExtract.ts`，对应 MiniMax / DeepSeek 等常见短标签）
  3. **长 XML：** `REDACTED_THINK_OPEN` / `REDACTED_THINK_CLOSE`（见 `cotExtract.ts`，MiniMax M2.7+ 等长标签）

  具体字面量以源码 `src/utils/cotExtract.ts` 对应常量的引号内字符串为准。

- `src/hooks/useActivityTimeline.ts`：`scheduleCotSyncFromFullText` 使用导入的 `ASSISTANT_COT_MARKER_SPECS` 做「最早开标签 + 配对的 close」截取，避免只保留 `[cot]` / 单独一种 thinking 写法而导致行为回退。

- `src/hooks/__tests__/useActivityTimeline.test.ts`：新增 1 例短标签（`ASSISTANT_COT_MARKER_SPECS[1]`）；长标签用例改为 `MARKER_SPECS[2]` 拼串。共 **11** 例。
