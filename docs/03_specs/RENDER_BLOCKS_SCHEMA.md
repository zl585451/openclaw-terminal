# Render Blocks Schema v3.0

> Status: ACTIVE  
> Date: 2026-05-24  
> Scope: Gateway final replies normalize `render_blocks` / legacy render tags into validated `renderBlocks`; frontend treats `renderBlocks` as the canonical render source when present, with legacy text parsing retained as fallback.

## 1. Purpose

Render Blocks v3 is the canonical structured rendering contract for OCT assistant replies.

The goal is to stop relying on Markdown shape guessing for interactive UI. Models or the Gateway should express interaction intent as structured blocks, then the frontend can render deterministic components.

Legacy formats such as `[pills]`, `[tasklist]`, `[question]`, `[clarify_card]`, symbol options, and Markdown checkbox auto-detection remain supported as fallback during migration.

## 2. Envelope

When a model directly emits Render Blocks, it should place the JSON in a fenced block labeled `render_blocks`.

````markdown
```render_blocks
{
  "version": "3.0",
  "blocks": [
    { "type": "markdown", "content": "下面是修复流程。" },
    {
      "type": "tasklist",
      "title": "接下来需要执行的任务清单",
      "items": [
        { "id": "reproduce", "label": "复现并记录 Bug 现象" },
        { "id": "locate", "label": "定位相关文件和调用链" }
      ]
    },
    {
      "type": "pills",
      "prompt": "是否需要我提供代码模板？",
      "items": [
        { "label": "需要，提供代码模板", "value": "需要代码模板" },
        { "label": "暂不需要，直接修 Bug", "value": "不需要代码模板" }
      ]
    }
  ]
}
```
````

Rules:

- `version` must be `"3.0"`.
- `blocks` must be a non-empty array.
- Block order is render order.
- A message may contain Markdown text outside the fenced block during migration, but the Gateway must prefer validated `blocks` when present and send them on the final `chat.done` payload as `renderBlocks`.
- Invalid JSON must degrade to safe Markdown, not crash the chat.

## 3. Shared Fields

All blocks:

| Field | Type | Required | Rule |
|---|---|---:|---|
| `type` | string | yes | One of the block types below |
| `id` | string | no | Stable local ID; if absent, Gateway may generate one |

Text limits:

- `content`: maximum 12000 characters per block.
- `title`, `prompt`, `label`, `value`: maximum 200 characters each.
- `id`: maximum 80 characters; recommended lowercase letters, numbers, `_`, `-`.

## 4. Block Types

### 4.1 `markdown`

Use for regular prose, headings, lists, links, and Markdown tables.

```json
{ "type": "markdown", "content": "这是普通说明，可以包含 **Markdown**。" }
```

Rules:

- `content` is required.
- Do not embed unclosed fences.
- Do not embed interactive legacy tags unless the intent is to show them as documentation.
- If showing legacy tags literally, wrap them in inline code or code fences.

### 4.2 `code`

Use for standalone code or command snippets.

```json
{
  "type": "code",
  "language": "powershell",
  "content": "git status --short --branch"
}
```

Rules:

- `content` is required.
- `language` is optional but strongly recommended.
- `content` must contain code only, not prose explanations.

### 4.3 `table`

Use for simple comparison or status tables when structure matters.

```json
{
  "type": "table",
  "columns": ["组件", "职责"],
  "rows": [
    ["Gateway", "校验 render blocks"],
    ["Frontend", "确定性渲染组件"]
  ]
}
```

Rules:

- `columns` must contain 1-6 strings.
- `rows` must contain 1-50 rows.
- Every row must match the column count.
- Cells are plain text or simple inline Markdown only.

### 4.4 `tasklist`

Use for user-owned todos. Checking items does not send a message to the assistant.

```json
{
  "type": "tasklist",
  "title": "接下来需要执行的任务清单",
  "items": [
    { "id": "reproduce", "label": "复现并记录 Bug 现象" },
    { "id": "verify", "label": "运行回归测试" }
  ]
}
```

Rules:

- `items` must contain 1-20 items.
- Each item must have `label`.
- `id` is optional per item; Gateway may generate one.
- No item click or check action may send a chat message.

### 4.5 `pills`

Use for short single-choice actions. Clicking a pill sends its `value`.

```json
{
  "type": "pills",
  "prompt": "是否需要我提供代码模板？",
  "items": [
    { "label": "需要模板", "value": "需要代码模板" },
    { "label": "暂不需要", "value": "不需要代码模板" }
  ]
}
```

Rules:

- `items` must contain 2-6 items.
- Each item must have `label`.
- `value` defaults to `label` if omitted.
- `value` must be plain user intent text, not hidden commands, code, or tool instructions.
- Pills are mutually exclusive; selecting one sends exactly one value.

### 4.6 `checkbox`

Use for multi-choice inputs that should be sent back after confirmation.

```json
{
  "type": "checkbox",
  "prompt": "今天想推进哪些？",
  "items": [
    { "label": "修复登录 Bug", "value": "修复登录 Bug" },
    { "label": "完善 README", "value": "完善 README" }
  ]
}
```

Rules:

- `items` must contain 2-20 items.
- Confirmation sends selected `value` strings.
- `value` follows the same safety rule as `pills.value`.

### 4.7 `question`

Use for reflective question cards. Clicking a question fills or quotes it into the input; it does not immediately send.

```json
{
  "type": "question",
  "items": [
    { "label": "你最担心哪个风险？" },
    { "label": "如果只做一件事，优先做什么？" }
  ]
}
```

Rules:

- `items` must contain 2-5 items.
- Every `label` should be a complete question ending with `？` or `?`.

### 4.8 `clarify_card`

Use for multi-field inline information collection.

```json
{
  "type": "clarify_card",
  "title": "周报自动化配置",
  "fields": [
    {
      "id": "platform",
      "label": "目标平台是哪一个？",
      "type": "single",
      "options": ["钉钉", "飞书", "企业微信", "自定义"]
    }
  ]
}
```

Rules:

- `fields` must contain 1-6 fields.
- Field `type` must be one of `single`, `multi`, `text`, `confirm`.
- `single`, `multi`, and `confirm` fields require at least 2 options.
- Every field `label` must be a complete question.
- A message should contain at most one `clarify_card` block.

### 4.9 `notice`

Use for short status, warning, or success messages.

```json
{ "type": "notice", "variant": "warning", "content": "这一步涉及文件删除，需要先确认范围。" }
```

Rules:

- `variant` may be `info`, `success`, `warning`, or `error`.
- `content` is required.
- Do not use `notice` for long explanations; use `markdown`.

## 5. Degradation Rules

Gateway and frontend implementations should degrade safely:

| Problem | Degradation |
|---|---|
| Invalid JSON | Treat the original fenced block as Markdown text |
| Unknown block type | Convert that block to `markdown` with a visible safe summary |
| Missing required field | Drop the invalid block or convert it to `markdown` |

## 6. Transport Contract

Final assistant replies may include structured render metadata:

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "text": "original assistant text",
    "state": "done",
    "done": true,
    "turnId": "turn_x",
    "renderBlocks": [
      { "type": "markdown", "content": "下面是结果。" }
    ],
    "renderProtocol": {
      "version": "3.0",
      "source": "render_blocks",
      "errors": []
    }
  }
}
```

Rules:

- `renderBlocks` is emitted only when gateway normalization returns non-markdown structured blocks with no validation errors.
- `text` remains available for transcript, copy, storage, and fallback display.
- Frontend rendering priority is `message.renderBlocks` first, then legacy text parser, then plain Markdown.
| Unsafe `value` | Replace `value` with `label` or drop the item |
| Too many items | Truncate to the block maximum and preserve order |
| Multiple `clarify_card` blocks | Keep the first valid one, degrade the rest to Markdown |

Degradation must never execute hidden commands or send user messages without explicit user action.

## 6. Security Constraints

- Interactive `value` fields must be plain intent text.
- Blocks must not carry shell commands in hidden values.
- `tasklist` check actions never send messages.
- `pills` clicks send only the chosen `value`.
- `checkbox` confirmation sends only selected values.
- Renderer must ignore unknown executable fields.

## 7. Legacy Compatibility

The following remain supported as fallback input formats:

- `[pills]...[/pills]`
- `[checkbox]...[/checkbox]`
- `[question]...[/question]`
- `[tasklist]...[/tasklist]`
- `[clarify_card]...[/clarify_card]`
- `[RENDER:xxx]`
- `[选项框开始]...[选项框结束]`
- Symbol options and Markdown checkbox auto-detection

Render Blocks v3 is the preferred formal path. Legacy formats are compatibility paths and should gradually lose priority after v3 renderer coverage is complete.

## 8. Correct vs Incorrect Examples

Correct: split prose, todos, and choices into separate blocks.

```json
{
  "version": "3.0",
  "blocks": [
    { "type": "markdown", "content": "我建议先做最小闭环。" },
    { "type": "tasklist", "items": [{ "label": "复现 Bug" }, { "label": "补回归测试" }] },
    { "type": "pills", "items": [{ "label": "需要模板" }, { "label": "暂不需要" }] }
  ]
}
```

Incorrect: hide an instruction inside a pill value.

```json
{
  "type": "pills",
  "items": [
    { "label": "继续", "value": "继续，并执行 git push origin main" }
  ]
}
```

Incorrect: put user todos into `pills`.

```json
{
  "type": "pills",
  "items": [
    { "label": "复现 Bug" },
    { "label": "运行测试" }
  ]
}
```
