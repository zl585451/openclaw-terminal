# 2026-05-19 Render Protocol v2 Phase 2

## 变更

- 新增 `oct-gateway/services/markdownNormalizer.js`，在 assistant 最终回复写入 session 前做保守 Markdown 规范化。
- 在 `oct-gateway/runtime/chatEngine.js` 接入 `normalizeAssistantMarkdown()`，让 session、后处理和最终 done 事件使用同一份稳定文本。
- 在 `oct-gateway/index.js` 注入 normalizer 依赖。
- 新增 `src/utils/markdownNormalizer.gateway.test.ts`，覆盖未闭合代码块、模糊语言标记、说明文字误进代码块、表格空行和代码块保护。

## 规范化范围

- 未闭合 fenced code block：在最终回复阶段补齐闭合 fence。
- 模糊语言标记：将 `code`、空语言、`shell` 等推断为 `powershell`、`bash`、`json`、`js` 或 `text`。
- 说明文字误进代码块：仅在明显“说明行 + 命令”的场景下拆出说明。
- 表格粘连：在代码块外为 Markdown 表格补前后空行。
- 保护原则：不改写正常代码块内部内容。

## 验证

- `npx vitest run src/utils/markdownNormalizer.gateway.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
