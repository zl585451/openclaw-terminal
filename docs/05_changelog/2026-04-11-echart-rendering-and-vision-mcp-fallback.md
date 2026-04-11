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

## 影响文件

- `src/utils/markdownPreprocess.ts`
- `src/ui/chat/markdownComponents.tsx`
- `oct-gateway/image_analyzer.js`
