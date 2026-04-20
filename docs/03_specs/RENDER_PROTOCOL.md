# OCT 渲染标签协议

> 定义 AMY 输出中的成对渲染标签，前端解析后映射到对应交互组件。  
> **版本**: v1.0.0 | **更新日期**: 2026-03-14
> **2026-04-20**：澄清“单一格式 vs 多标签”历史口径冲突，明确三种模式；补充 `[clarify_card]` 协议口径。

---

## 一、协议概述

OCT 前端支持 **6 种成对标签**，AMY 可在一条消息中使用多个标签，每个标签内的内容会被解析为独立的交互组件，标签外的内容作为正文保留。

> **模式区分**：
> - 成对标签模式下支持多段标签混排（本文档描述的协议）
> - 自动检测模式下建议单一格式（避免解析冲突）
> - `clarify_card` 渲染为输入框位置的内联询问器，一条消息最多 1 张，不与其他标签并列

**优先级**：成对标签 > `[RENDER:xxx]` > `[选项框开始]` > 自动检测

---

## 二、标签定义

### 2.1 `[pills]...[/pills]` — 胶囊按钮

- **组件**: `PillOptionBox`（`OptionBox` with `forcePills=true`）
- **交互**: 单击即发送
- **内容格式**: 每行一个 `■ 选项文本`

```
少爷，想先做哪个？

[pills]
■ 修复 Bug
■ 写文档
■ 录视频
[/pills]
```

### 2.2 `[checkbox]...[/checkbox]` — 复选框

- **组件**: `OptionBox`（`forcePills=false`）
- **交互**: 勾选 → 确认发送
- **内容格式**: 每行一个 `- [ ] 选项文本`

```
今天想推进哪些？

[checkbox]
- [ ] 修复登录 Bug（30分钟）
- [ ] 完善 README（1小时）
- [ ] 录演示视频（30分钟）
[/checkbox]
```

### 2.3 `[question]...[/question]` — 问题卡片

- **组件**: `QuestionCards`
- **交互**: 点击 → 填充到输入框
- **内容格式**: `1. 问句？` 编号问句列表

```
帮你理理思路：

[question]
1. 最让你纠结的点是什么？
2. 如果不考虑成本，你会怎么选？
3. 这个决定半年后有什么影响？
[/question]
```

### 2.4 `[tasklist]...[/tasklist]` — 任务清单

- **组件**: `TaskList`
- **交互**: 勾选标记完成（不发送给 AMY）
- **内容格式**: 每行一个 `- [ ] 任务文本`

```
帮你列好了：

[tasklist]
- [ ] 写 README 文档
- [ ] 修复登录 Bug
- [ ] 录演示视频
[/tasklist]
```

### 2.5 `[text]...[/text]` — 纯文本

- **组件**: `MarkdownContent`（原生 Markdown 渲染）
- **交互**: 无
- **用途**: 在多标签消息中显式标记一段纯文本，防止被自动检测误识别

```
[text]
这段内容包含 ■ 符号和 - [ ] 格式，但不应触发任何交互。
[/text]
```

### 2.6 `[clarify_card]...[/clarify_card]` — 澄清询问器（内联）

- **组件**: `InlineInquiry`（位于输入框位置，活跃时替换 `ChatInputArea`）
- **解析**: `src/core/clarifyCard/parser.ts` → `parseClarifyCard()`
- **Hook**: `src/hooks/useInlineInquiry.ts`
- **交互**: 用户在询问器内分页填写，完成后以 `[澄清回执]` 作为用户消息回发；取消则聊天流零痕迹
- **内容格式**: 标签内为 JSON，包含 `fields[]`（`title` 可选）
- **代码块保护**: 代码块内的 `[clarify_card]` 示例保持原样，不会触发询问器

**字段类型**：

| type | 用途 | 必填字段 |
|---|---|---|
| `single` | 单选 | `options`（至少 2 项） |
| `multi` | 多选 | `options`（至少 2 项） |
| `text` | 自由文本 | 可选 `placeholder` |
| `confirm` | 确认型选项 | `options`（至少 2 项） |

**字段规则**：

- `label` 必须写成完整问句（例如“想写什么风格？”）
- `title` 可选；省略时前端按 `field.label` 展示每页标题
- `allow_custom: true` 时追加“自己说”自填入口
- 一条消息最多 1 张 `clarify_card`

### 2.6.1 双通道触发（工具路径 + 文本路径）

**工具路径（优先）**：

当 gateway 侧 `toolsSupport === 'supported'` 时，{{AI_NAME}} 通过调用 `request_clarify` 工具触发 InlineInquiry，而不是输出 `[clarify_card]` 文本标签。

- gateway 在 `oct-gateway/tools/request_clarify.js` 注册该工具
- 工具 execute 立即 `onToolEvent({ type: 'clarify_open', payload: { spec } })` 并返回 `waiting_user_reply` 占位
- `index.js` 的 `sendToolEvent` 把 `clarify_open` 转为 WS 事件 `{ type: 'event', event: 'clarify', payload: { spec } }`
- 前端 `useWebSocket.ts` 路由该事件到 `onClarifyOpen` 回调，最终调用 `inquiry.openSpec(spec)`

**文本路径（兜底）**：

当 `toolsSupport !== 'supported'` 时，{{AI_NAME}} 输出 `[clarify_card]...[/clarify_card]` 文本标签，前端 `parseClarifyCard` 解析后由既有 effect 调用 `inquiry.maybeTrigger`。

两条路径汇聚到同一前端入口 `useInlineInquiry.openSpec(spec)`。

---

## 三、混合使用

一条消息可包含**多个标签**，按出现顺序依次渲染：

```
少爷，先看几个问题：

[question]
1. 你更看重速度还是稳定性？
2. 预算有上限吗？
[/question]

或者直接选一个方案：

[pills]
■ 方案 A：快速上线
■ 方案 B：稳扎稳打
[/pills]
```

渲染结果：正文 → 问题卡片 → 正文 → 胶囊按钮，四段独立渲染。

---

## 四、解析规则

| 规则 | 说明 |
|------|------|
| 优先级 | 成对标签最高，有标签时跳过所有自动检测 |
| 标签外文本 | 作为 `text` 段保留，用 Markdown 渲染 |
| 标签内无有效内容 | 降级为按行提取纯文本选项 |
| 标签大小写 | 不敏感（`[Pills]` = `[pills]`） |
| 嵌套标签 | 不支持 |

---

## 七、与 Markdown 表格 / 代码块共存（强烈建议）

### 7.1 不要把交互选项放进代码块

原因：前端会刻意跳过 fenced code block（``` ... ```）内部的解析，以保证代码内容原样显示。

推荐写法：

```
这里是说明正文（可包含代码块）：

```ts
console.log('hello');
```

[pills]
■ 继续
■ 停止
[/pills]
```

### 7.2 表格旁边需要 `■` 选项时，优先用成对标签把选项圈起来

原因：自动检测会扫描文本行；虽然解析器会跳过 `|` 表格行，但“成对标签”仍然是最稳定、最可控的输出方式。

推荐写法（表格 + pills）：

```
| 字段 | 含义 |
|---|---|
| a | 1 |
| b | 2 |

[pills]
■ 继续
■ 改一下表格
[/pills]
```

---

## 五、与其他协议的关系

| 协议 | 优先级 | 是否共存 |
|------|--------|---------|
| 成对标签 `[pills]...[/pills]` | 最高 | 有标签时，`[RENDER:xxx]` 和自动检测均跳过 |
| `[RENDER:xxx]` | 次高 | 无标签时生效 |
| `[选项框开始]...[选项框结束]` | 中 | 无标签、无 RENDER 时生效 |
| 自动检测（`■` / `- [ ]` / `1. xxx`） | 最低 | 以上均无时生效 |

---

## 六、前端实现映射

| 标签 | 解析函数 | 渲染组件 | 文件 |
|------|---------|---------|------|
| `[pills]` | `parseSymbolOptions` → `parsePlainLines` | `OptionBox (forcePills=true)` | `src/components/OptionBox.tsx` |
| `[checkbox]` | `parseCheckboxOptions` → `parsePlainLines` | `OptionBox (forcePills=false)` | `src/components/OptionBox.tsx` |
| `[question]` | `parseNumberedOptions` → `parseLineOptions` | `QuestionCards` | `src/components/QuestionCards.tsx` |
| `[tasklist]` | `parseCheckboxOptions` → `parsePlainLines` | `TaskList` | `src/components/TaskList.tsx` |
| `[text]` | 无 | `MarkdownContent` | `src/components/ChatTab.tsx` |
| `[clarify_card]` | `parseClarifyCard` | `InlineInquiry` | `src/components/inlineInquiry/InlineInquiry.tsx` |

**解析入口**: `src/utils/optionBoxParser.ts` → `parseTaggedContent()`

---

## 更新日志

| 版本 | 日期 | 内容 |
|------|------|------|
| 1.0.0 | 2026-03-14 | 初始版本：定义 5 种成对标签协议 |
| 1.0.1 | 2026-03-30 | 补充与 Markdown 表格/代码块共存的输出建议（避免误解析与内容丢失） |
| 1.1.0 | 2026-04-20 | 新增 `[clarify_card]`（InlineInquiry）并补充模式区分口径 |
