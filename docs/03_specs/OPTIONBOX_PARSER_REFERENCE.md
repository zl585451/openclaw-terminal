# OptionBox 解析器参考 · 前端交互标签

> **最后更新时间**：2026-03-24  
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
