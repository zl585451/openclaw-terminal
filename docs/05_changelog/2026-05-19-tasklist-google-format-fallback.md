# 2026-05-19 TaskList Google 输出格式兜底修复

## Summary

修复 Google 渠道模型在测试 4 中输出自然语言任务清单标题与加粗 checkbox 项时，前端未稳定渲染为 `TaskList` 的问题。

## Root Cause

Google 模型常输出类似：

```md
接下来你需要执行的任务清单

- [ ] **任务 1**：提供 Bug 现象
- [ ] **任务 2**：确认复现步骤
```

旧版 `optionBoxParser` 对 checkbox 行过于保守，只要行内含 `*` 就跳过，导致加粗任务项不会被解析。同时，任务标题识别要求更接近固定冒号格式，无法覆盖“接下来你需要执行的任务清单”这类自然标题。

## Changed

- `parseCheckboxOptions()` 支持 checkbox 行内 Markdown 加粗，并在解析 label 时剥离 `**...**` / `__...__`。
- checkbox 清理逻辑支持 `☐` / `□` / `☑` 等模型常见空框符号。
- TaskList 标题识别支持“接下来/下面/以下/需要/执行 + 任务清单/待办清单/任务列表”等自然标题。
- 成对标签混排路径同步使用同一任务标题判断，避免 `[tasklist]` / `[pills]` 混排时分段错误。
- 新增 Google 风格 TaskList 与 TaskList + pills 混排回归测试。
- 同步更新 Render Protocol 与 OCT Protocol 文档，明确加粗 checkbox 任务项的兼容兜底。

## Verification

- `npx vitest run src/utils/optionBoxParser.test.ts src/utils/renderProtocolRegression.test.ts src/utils/markdownPreprocess.test.ts src/utils/markdownNormalizer.gateway.test.ts`
