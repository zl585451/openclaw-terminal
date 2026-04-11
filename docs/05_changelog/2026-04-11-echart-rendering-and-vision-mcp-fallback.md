# 2026-04-11 ECharts 标签兼容与视觉 MCP 兜底识别修复

## 变更概览

- 聊天区新增对 `[echart] ... [/echart]` 输出的兼容处理
- 当模型吐出 ECharts payload 时，不再把它当普通代码文本显示
- 图片理解的 MCP 工具识别范围扩大，兼容 `MiniMax_understand_image` 等非 `mcp_` 前缀命名

## 细节

### 1. ECharts 输出兼容

之前模型偶发会输出：

```text
[echart]
{"title":"...","option":{...}}
[/echart]
```

前端 Markdown 渲染层不认识这种标签，导致聊天区直接显示原始 JSON。

现在会先把这类内容规范化为 `echart` 代码块，再在聊天区展示为“图表已转入 Canvas”的卡片，点击 `Open` 即可进入 Canvas 图表渲染器。

### 2. 图片理解 MCP 工具名识别

之前图片理解兜底逻辑主要匹配 `mcp_*understand_image` 风格命名。

现在新增兼容：

- `MiniMax_understand_image`
- `minimax_understand_image`
- `understand_image`
- 其他包含 `understand + image` 或 `image + understand` 的工具名

这可以避免 MCP 已连接但因工具命名风格不同而被误判为“没有可用图片理解工具”，随后直接掉到本地 BLIP 超时链路。

### 3. 流式阶段也转换 [echart]/[canvas] 标签

之前流式渲染阶段跳过了所有 `preprocessMarkdown`，导致模型流式输出 `[echart]...[/echart]` 或 `[canvas]...[/canvas]` 时，图表 JSON 会在整个流式过程中裸露为纯文本，直到流式结束后才被转换。

现在流式阶段仍然跳过完整的表格预处理（避免跳动），但会单独调用 `normalizeCustomEchartBlocks`，在收到完整标签的瞬间立即将其转换为 echart 卡片，不再等待流式结束。

### 5. 修复流程图 JSON 以 `code` 语言块输出时不被识别为图谱的问题

模型在触发 `diagram` 类型时，有时会用 ` ```code` 而不是 ` ```json` 语言标注输出图谱 JSON，导致 `parseDiagramSpec` 未被调用，渲染为普通代码块。

修复：
- `markdownComponents.tsx` — 对任何包含 `"diagramType":` 的代码块也调用 `parseDiagramSpec`，不再只检查 `language === json`
- `diagramPlugin.tsx` — Canvas 面板也兼容 `code`/`document` artifactType 但内容是图谱 JSON 的文档
- `contextBuilder.js` — 收紧 diagram 提示词，明确要求用 ` ```json` 代码块并给出格式示例

### 4. 修复 MiniMax 将 canvas content 以 JSON 对象而非字符串传递时的解析失败

MiniMax 模型在生成 canvas 工具调用时，有时会把 `content` 参数作为结构化 JSON 对象而不是 JSON 字符串传递。`canvas.js` 原来只检查 `typeof args.content === 'string'`，遇到对象时会直接存储，导致 `document.content` 是对象而非字符串，最终在 `EChartsRenderer` 的 `parseContent` 里因 `raw.trim is not a function` 而报错，Canvas 面板显示"无法解析图表数据"。

修复：
- `oct-gateway/tools/canvas.js` — `create` 和 `update` 均先做 `typeof content === 'object' ? JSON.stringify(content) : String(content)` 规范化
- `EChartsRenderer.tsx` — `parseContent` 入口加防御性 stringify，兜底二次保护

## 影响文件

- `src/utils/markdownPreprocess.ts` — `normalizeCustomEchartBlocks` 改为 export
- `src/ui/chat/MessageList.tsx` — 流式阶段应用 `normalizeCustomEchartBlocks`
- `src/ui/chat/markdownComponents.tsx`
- `oct-gateway/tools/canvas.js` — content 对象转字符串修复
- `src/components/canvas/EChartsRenderer.tsx` — parseContent 防御性输入规范化
- `oct-gateway/image_analyzer.js`
