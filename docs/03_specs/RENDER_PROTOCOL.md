# OCT 渲染标签协议

> 定义 AMY 输出中的成对渲染标签，前端解析后映射到对应交互组件。  
> **版本**: v2.0.0 | **更新日期**: 2026-05-19
> **2026-04-20**：澄清“单一格式 vs 多标签”历史口径冲突，明确三种模式；补充 `[clarify_card]` 协议口径。
> **2026-05-19 / v3 Phase 1**：新增 Render Blocks Schema 作为后续结构化渲染正式路径；本文档中的标签协议继续作为 legacy fallback。
> **2026-05-19 / v3 Phase 6**：自动检测降级为 legacy fallback；新输出应优先使用 `render_blocks` 或成对标签，裸符号仅保留兼容。

---

## 一、协议概述

OCT 前端支持 **6 种成对标签**，AMY 可在一条消息中使用多个标签，每个标签内的内容会被解析为独立的交互组件，标签外的内容作为正文保留。

Render Protocol v3 的正式结构化路径见：`docs/03_specs/RENDER_BLOCKS_SCHEMA.md`。在 v3 迁移期间，优先让 Gateway 产生或校验 `render_blocks`；当前 `[pills]`、`[tasklist]`、`[question]`、`[clarify_card]` 等标签仍作为兼容兜底继续生效。

> **模式区分**：
> - 成对标签模式下支持多段标签混排（本文档描述的协议）
> - 自动检测模式是 legacy fallback：只有明确选择语境或整段几乎全是选项列表时才触发，避免协议说明文字误变成交互组件
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
- **兼容兜底**: 自动检测路径也接受“接下来/下面/以下/需要/执行 + 任务清单/待办清单/任务列表”等自然标题，以及 `- [ ] **任务 1**：...` 这类加粗 checkbox 项；解析时会剥离加粗标记后渲染为 TaskList。

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

### 7.3 Markdown 输出稳定协议 v2

本节约束模型输出普通 Markdown 时的稳定写法。目标是让正文、命令、代码、表格和交互标签在流式渲染与最终渲染中都能收敛到同一结构。

#### 7.3.1 正文与代码块分离

- 普通说明、编号步骤、风险解释必须放在代码块外。
- 代码块只放用户需要复制的命令、代码、JSON、日志片段或纯文本样本。
- 一个代码块只表达一种内容，不要把标题、编号说明和命令混在同一个代码块里。
- 代码块前后必须各有一个空行。

错误写法：

````
```code
2. **查看当前分支状态：**
```bash
git status
```
````

正确写法：

````
2. 查看当前分支状态：

```powershell
git status
```
````

#### 7.3.2 代码块语言标记

必须使用明确语言标记：

| 内容 | 语言标记 |
|------|----------|
| Windows PowerShell 命令 | `powershell` |
| Linux/macOS shell 命令 | `bash` |
| JavaScript / TypeScript | `js` / `ts` |
| JSON | `json` |
| 普通文本、日志、示例输出 | `text` |

避免使用：

- `code`
- 空语言标记
- 模糊的 `shell`（除非无法判断平台）

#### 7.3.3 表格稳定写法

- 表格前后必须各有一个空行。
- 表格必须包含表头、分隔行、至少一行数据。
- 单元格内不要放多行内容。
- 表格列数建议不超过 5，行数建议不超过 12。
- 表格旁边如需交互选项，使用成对标签，不依赖自动检测。

推荐写法：

````
| 项目 | 状态 | 说明 |
|------|------|------|
| Gateway | 已恢复 | 18789 / 18790 已监听 |
| Memory | 待检查 | 需要单独恢复 |

[pills]
■ 继续检查记忆系统
■ 先暂停
[/pills]
````

#### 7.3.4 流式输出约束

- 不要先输出开放的三反引号再长时间输出解释文字。
- 如果需要输出代码块，先写完引导句，再一次性输出完整 fence。
- 不要在同一条消息中频繁切换多个短代码块；多个命令可以合并到一个同语言代码块。
- 消息结束前必须闭合所有 Markdown fence。

#### 7.3.5 与交互标签的关系

- `[pills]`、`[checkbox]`、`[question]`、`[tasklist]`、`[clarify_card]` 不得放入代码块。
- 代码块内出现的标签文本一律按普通代码展示，不触发前端组件。
- 当 Markdown 表格、编号列表和选项同时出现时，优先使用成对标签包裹交互部分。

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
| 2.0.0 | 2026-05-19 | 新增 Markdown 输出稳定协议：正文/代码块分离、语言标记、表格稳定写法、流式输出约束 |
| 1.0.0 | 2026-03-14 | 初始版本：定义 5 种成对标签协议 |
| 1.0.1 | 2026-03-30 | 补充与 Markdown 表格/代码块共存的输出建议（避免误解析与内容丢失） |
| 1.1.0 | 2026-04-20 | 新增 `[clarify_card]`（InlineInquiry）并补充模式区分口径 |
