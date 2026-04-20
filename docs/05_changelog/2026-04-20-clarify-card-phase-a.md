# 2026-04-20 · ClarifyCard Phase A — 基础骨架

## 新增

- `src/core/clarifyCard/types.ts` — 字段类型、卡片规格、回执类型
- `src/core/clarifyCard/parser.ts` — `[clarify_card]...[/clarify_card]` 标签解析
- `src/core/clarifyCard/formatter.ts` — 回执格式化为 `[澄清回执]` 文本
- `src/core/clarifyCard/parser.test.ts` — 解析器单元测试
- `src/components/clarifyCard/ClarifyCardOverlay.tsx` — 浮层组件（三字段类型 + 自填选项）
- `src/components/clarifyCard/ClarifyCardOverlay.css` — 浮层样式

## 未做（留给 Phase B）

- 未接入 `ChatTab.v2.tsx`，组件尚未挂载
- 未在 `optionBoxParser` 里注册标签
- AMY 系统提示词未更新（暂时 AMY 不会输出此标签）

## 验证

- `npx tsc --noEmit` 通过
- `npx vitest run src/core/clarifyCard/parser.test.ts` 通过
- `npm run build` 通过
- 手动回归：原有 pills / checkbox / question / tasklist 均正常
