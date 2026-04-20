# 2026-04-20 · ClarifyCard Phase D — 工具化澄清卡片（request_clarify）

## 变更摘要

为 AMY 澄清询问器升级双通道触发架构：支持 tool_calls 的模型用 `request_clarify` 工具调用，不支持的 provider 继续用 `[clarify_card]` 文本标签兜底。两条路径汇聚到同一前端入口 `useInlineInquiry.openSpec`。

## 新增

- `oct-gateway/tools/request_clarify.js`：工具定义与执行逻辑（推送 `clarify_open` 事件 + 返回 `waiting_user_reply` 占位）

## 修改

- `oct-gateway/tool_loader.js`：`executeTool` 支持向工具透传上下文（含 `onToolEvent`）
- `oct-gateway/runtime/toolLoop.js`：执行工具时传入 `onToolEvent` 上下文
- `oct-gateway/index.js`：`sendToolEvent` 新增 `clarify_open` 分支，转为 WS `{ type: 'event', event: 'clarify' }`
- `oct-gateway/ai.js`：按 `toolsSupport` 三态注入澄清规则（工具路径优先 + 文本路径兜底）
- `src/hooks/useWebSocket.ts`：新增 `clarify` 事件分支，触发 `onClarifyOpen`
- `src/hooks/useMessages.ts`：新增 `onClarifyOpen` 透传
- `src/ui/chat/ChatTab.v2.tsx`：桥接 `onClarifyOpen` 到 `inquiry.openSpec`
- `docs/03_specs/RENDER_PROTOCOL.md`：补充 2.6.1 双通道触发说明
- `resources/system_prompts/OCT_PROTOCOL.md`：补充 2.6.1 工具路径规范

## 保持不变

- Phase A-C 产物（types/parser/formatter/InlineInquiry/能力底栏）
- 文本路径 `[clarify_card]` 解析与代码块保护
- `useInlineInquiry.openSpec` 现有 API

## 验证

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run`
