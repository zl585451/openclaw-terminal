# 2026-04-22：AI 连接错误 humanize 单元测试

## 摘要

为 `src/utils/aiConnectionErrors.ts` 的 `humanizeAiConnectionError` 新增 `src/utils/aiConnectionErrors.test.ts`，覆盖空输入、MiniMax Token Plan 专支、`401/403` 与超时、`404`+`model`、默认截断及分支优先级；未修改生产逻辑。

## 涉及文件

- `src/utils/aiConnectionErrors.test.ts`（新增）
