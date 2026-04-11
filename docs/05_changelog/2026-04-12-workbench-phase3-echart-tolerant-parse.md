# 2026-04-12 Workbench Phase 3 ECharts Tolerant Parse

## 背景

在多类型 artifact 切换测试中，Markdown / React Flow 正常，但部分 ECharts 文档会显示：

- `⚠ 无法解析图表数据`
- 下方直接回退为原始 JSON 代码

根因不是切换器串了 renderer，而是模型输出的 ECharts payload 偶尔会被截断，常见形态是尾部残留半个字段、逗号或引号。之前聊天入口、插件识别、渲染器三处各自独立 `JSON.parse`，任何一处失败都会让图表退回代码预览。

## 本次修复

新增统一的 ECharts 容错解析工具：

- `src/utils/echartsPayload.ts`

能力包括：

- 统一识别 wrapped payload / bare option / tool-call 内嵌 payload
- 自动去掉 fenced code block 包裹
- 对常见的尾部截断做 best-effort 修补
  - 去掉悬空的逗号、冒号、引号、反斜杠
  - 对未闭合的字符串补引号
  - 对未闭合的 `{` `[` 自动补齐闭合符
  - 优先取最长的平衡 JSON 前缀

接入位置：

- `src/components/canvas/EChartsRenderer.tsx`
- `src/workbench/plugins/echartsPlugin.tsx`
- `src/ui/chat/markdownComponents.tsx`

## 结果

- `Open` 时的 ECharts 识别与标题提取统一
- Workbench 插件能识别“轻微损坏但可修补”的 ECharts payload
- 文档切换回 ECharts 时，不再因为尾部截断直接退回代码块

## 验证

- `npx tsc --noEmit`
- `npm run build`
