# 2026-04-20 · ClarifyCard Phase B-R v1.1 — 重构为 InlineInquiry（含 Codex 审核修订）

## 变更摘要

Phase B v1.1 的浮层 + 遮罩方案因用户体验问题被重构为 Claude 风格的内联询问器。同时合并 Codex 本地审核的 4 点修订。

## 新增

- `src/hooks/useInlineInquiry.ts` — 内联询问器控制 Hook（分页、字段草稿、跳过、取消、openSpec 测试入口）
- `src/components/inlineInquiry/InlineInquiry.tsx` — 询问器主组件
- `src/components/inlineInquiry/InlineInquiry.css` — 询问器样式

## 删除

- `src/components/clarifyCard/ClarifyCardOverlay.tsx`
- `src/components/clarifyCard/ClarifyCardOverlay.css`

## 修改

### Phase A 产物（合并 Codex 修订 1：title 可选）

- `src/core/clarifyCard/types.ts` — `ClarifyCardSpec.title` 改为 `title?: string`
- `src/core/clarifyCard/parser.ts` — `normalizeSpec` 删除 title 必填断言
- `src/core/clarifyCard/formatter.ts` — title 为空时使用默认"澄清"兜底
- `src/core/clarifyCard/parser.test.ts` — 新增 "title 省略时 spec 仍可解析" 测试，拆分原"title 或 fields 空返回 null"为两个独立用例

### ChatInput（合并 Codex 修订 3：定点撤销而非整文件回退）

- `src/ui/chat/ChatInput.tsx` — 定点删除 Phase B 加入的 disabled 改动：
  - Props 接口的 `disabled?: boolean` 和 `disabledPlaceholder?: string`
  - `handleSend` / `handleQuickCommand` / `handlePickFiles` 开头的 `if (disabled) return;`
  - textarea / 发送按钮 / 附件按钮 / 快捷命令按钮 / QuickCommandMenu 入口上的 disabled 绑定
  - 其他功能逻辑保持不变

### ChatTab（合并 Codex 修订 2、4）

- `src/ui/chat/ChatTab.v2.tsx`
  - import 换为 `useInlineInquiry` / `InlineInquiry`
  - Hook 消费者由 `clarifyCard` 改名 `inquiry`
  - 发送入口修正为 `msgs.wsConnected + msgs.sendMessage(text, null)`
  - 原 Overlay 挂载改为条件性替换 ChatInputArea
  - 删除原 Overlay JSX
  - DEV 按钮改为 `inquiry.openSpec(spec)`，可反复触发

### 协议

- `resources/system_prompts/OCT_PROTOCOL.md` 增补 InlineInquiry v1.1 规则：
  - field.label 必须写成完整问句
  - title 改为可选
  - 字段顺序按"用户心智流畅"排
  - 明确不做追问

## 保留不变

- `src/utils/optionBoxParser.ts` 的 clarify_card 剥离 + 代码块保护
- Phase B 的 parseOptionBox / TAG_STRIP_RX 改动

## 验证

- `npx tsc --noEmit` / `npm run build` / `npx vitest run` 全部通过
- 手动验收清单（见 Phase B-R v1.1 执行文档）全部通过
