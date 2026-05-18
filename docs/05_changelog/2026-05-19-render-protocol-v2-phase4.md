# Render Protocol v2 Phase 4：真实坏样例回归集

日期：2026-05-19

分支：`codex/render-protocol-v2`

## 背景

Render Protocol v2 的目标不只是“当前能修”，还要防止后续模型、提示词或前端渲染调整再次把说明文字、表格、代码块和交互标签混在一起。

## 改动

- 新增 `src/utils/renderProtocolRegression.test.ts`。
- 覆盖真实使用中容易出错的混排样例：
  - 中文说明误进命令代码块。
  - 表格 + 命令代码块 + `[pills]` 同时出现。
  - 流式阶段未闭合代码围栏。
  - 模型输出 `code` 这类模糊语言标记。

## 价值

这些测试把“用户实际看到的坏渲染”转成稳定回归用例。后续如果有人改 Gateway normalizer、Markdown 预处理或选项解析，只要破坏其中任一链路，测试会提前失败。

## 验收

- `npx vitest run src/utils/renderProtocolRegression.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`
