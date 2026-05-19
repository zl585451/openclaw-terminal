# Render Protocol v3 Phase 10：Raw Output 占位文件索引

日期：2026-05-19

## 变更摘要

- 为真实模型 corpus 中 Gemini / DeepSeek 共 8 条 run 增加 `rawOutputPath`。
- 新增 8 个 raw output 占位文件，用于后续补录真实模型原始输出。
- 扩展 `src/utils/renderProtocolV3Corpus.test.ts`，验证：
  - 每个 `rawOutputPath` 指向存在的本地 corpus 文件。
  - `rawOutputStatus: "missing"` 的 run 拥有显式占位文件。
  - 真实 raw output 内容断言继续保持 pending/skip。

## 约束

- 未调用 Gemini、DeepSeek 或任何外部 API。
- 未修改 Gateway normalizer、前端 renderer 或 `optionBoxParser`。
- 未从截图反推或伪造 raw model output。
- 未修改 corpus 中既有审查结论。
- 未提交、未推送、未合并。

## 验证

- `npx vitest run src/utils/renderProtocolV3Corpus.test.ts`
- `npx tsc --noEmit`
- `git diff --check`
