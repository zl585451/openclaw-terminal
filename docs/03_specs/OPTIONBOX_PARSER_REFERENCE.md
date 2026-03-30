# OptionBox 解析器参考 · 前端交互标签

> **最后更新时间**：2026-03-30  
> **为谁而写**：AI 协作伙伴  
> **用途**：排查 [pills]/[question]/[tasklist] 等标签不渲染问题时定位解析逻辑

---

## 一、解析入口

- **文件**：`src/utils/optionBoxParser.ts`
- **主函数**：`parseContent(content: string): ParsedContent`
- **调用方**：`ChatTab.tsx` 在渲染 assistant 消息时调用

---

## 二、优先级顺序

1. **成对标签** `[pills]...[/pills]` 等 — 最高
2. **`[RENDER:xxx]` 显式标记** — 次高
3. **自动检测**（`■`、`- [ ]`、`1. 问句？`）— 最低

有成对标签时，自动检测和 RENDER 均跳过。

---

## 三、成对标签与解析函数

| 标签 | 解析函数 | 输出 segment.type | 渲染组件 |
|------|----------|-------------------|----------|
| `[pills]...[/pills]` | parseSymbolOptions | pills | OptionBox (forcePills=true) |
| `[checkbox]...[/checkbox]` | parseCheckboxOptions | checkbox | OptionBox (forcePills=false) |
| `[question]...[/question]` | parseNumberedOptions（问句） | question | QuestionCards |
| `[tasklist]...[/tasklist]` | parseCheckboxOptions | tasklist | TaskList |
| `[text]...[/text]` | 无 | text | Markdown |

---

## 四、正则与检测规则

### 成对标签正则

```ts
/\[\s*(pills|checkbox|question|tasklist|text)\s*\]([\s\S]*?)\[\s*\/\s*\1\s*\]/gi
```

- 大小写不敏感
- 标签内内容不得跨代码块（代码块内的标签会被忽略）

### 任务清单触发词

`任务清单：`、`待办清单：`、`任务列表：`、`todo:`、`checklist:`、`步骤清单：`、`执行步骤：`

### 符号选项

支持 `■ ● ◆ ○ ◉ ▪ ▸ • ·` 等符号

### 问句判断

`isQuestionLabel(label)`：以 `？` 或 `?` 结尾，长度 5–120

---

## 五、常见不渲染原因

1. **标签在代码块内**：`getCodeBlockRanges` 会排除代码块内的标签
2. **标签不完整**：缺少 `[/pills]` 等闭合标签
3. **大小写/空格**：`[Pills]` 可用，`[ pills ]` 可用，但 `[pill]` 无效
4. **流式输出截断**：标签被分批发送，首包未包含完整 `[pills]...[/pills]`，可能导致解析失败
5. **混用格式**：同一条消息中 `■` 和 `- [ ]` 混用，若未用成对标签包裹，可能被误识别

---

## 八、与 Markdown（表格 / 代码块）共存的关键规则（重要）

### 8.1 代码块内必须“完全不解析”

- `getCodeBlockRanges()` / `isInsideCodeBlock()` 用于确保：
  - **代码块内的 `■`、`- [ ]`、`1.` 都不触发自动检测**
  - **代码块内的 `[pills]...[/pills]` 等标签也应被忽略**
- 现象：如果误解析了代码块内的符号行，会导致代码块内容被改写/丢失，表现为“代码框内容不完整/错位”。

### 8.2 表格行必须“原样保留”，不能被当成选项行移除

Markdown 表格通常以 `|` 开头，例如：

```
| a | b |
|---|---|
| 1 | 2 |
```

在 `hint='pill'` 分支和“无 hint 自动检测分支”中，处理符号选项（`■ ...`）时要：

- **逐行处理**（基于真正的换行符 `\n`）
- **跳过表格行**：`/^\s*\|/` 命中则直接 `push(line)`，不做任何替换
- 仅对“符号选项行”做替换/删除，并在首个命中处插入 `<!--OPTIONS_HERE-->`

### 8.3 警惕“双转义”导致的灾难性解析退化

如果源代码里出现以下错误写法：

- `split('\\n')` / `join('\\n')`（变成字面量反斜杠+n，**不会按真实换行拆分/拼接**）
- `/^\\s*\\|/`（匹配字面量 `\s`，**无法识别表格行**）

那么整段文本会被当作“一行”处理，表格跳过逻辑失效，最终表现为：

- 多表格内容被错误移除（尤其当消息里同时存在 `■` 选项行时）
- `<!--OPTIONS_HERE-->` 可能异常露出

修复策略：把上述写法恢复为 `split('\n')`、`join('\n')`、`/^\s*\|/`。

---

## 六、关键函数

| 函数 | 用途 |
|------|------|
| `parseTaggedContent(content)` | 解析成对标签，返回 segments |
| `parseSymbolOptions(text)` | 解析 `■ 选项` |
| `parseCheckboxOptions(text)` | 解析 `- [ ] 选项` |
| `parseNumberedOptions(text)` | 解析 `1. xxx 2. xxx` |
| `parseLineOptions(text)` | 解析行列表 |
| `getCodeBlockRanges(text)` | 获取代码块范围，用于排除 |
| `stripFencedCodeBlocks(text)` | 剥离代码块 |
| `stripMarkdownTables(text)` | 剥离表格，避免误触发 |

---

## 七、segment 结构

```ts
interface RenderSegment {
  type: 'text' | 'pills' | 'checkbox' | 'question' | 'tasklist';
  content: string;
  options: OptionItem[];
}

interface OptionItem {
  num: number;
  label: string;
  value: string;
}
```

---

*与 `OCT_PROTOCOL.md`、`RENDER_PROTOCOL.md` 配合使用，协议定义输出格式，本文档定义解析实现。*
