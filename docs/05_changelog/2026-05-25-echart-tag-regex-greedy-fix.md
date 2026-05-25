# Fix: [echart]/[canvas] 标签正则贪婪匹配导致 payload 混入 AI 说明文字

**日期**: 2026-05-25  
**类型**: Bug Fix  
**影响范围**: src/utils/markdownPreprocess.ts / src/utils/echartsPayload.ts / system prompts

---

## 问题

AI 在回复中写"用 [echart] 标签包裹"之类的说明文字时，`normalizeCustomEchartBlocks` 的正则 `/\[echart\]\s*([\s\S]*?)\s*\[\/echart\]/gi` 从正文中第一次出现 `[echart]` 的位置开始匹配，将说明文字也吞入 payload。最终传递给 `EChartsRenderer` 的内容混入了非 JSON 文本，`parseEChartsPayload` 返回 null，Canvas 显示"⚠ 无法解析图表数据"。

---

## 修改

### Layer 1 — 正则行首匹配（治标）

`src/utils/markdownPreprocess.ts`：

- `[echart]` 正则（~298 行）：`/\[echart\].../gi` → `/(?:^|\n)\s*\[echart\].../gi`
- `[canvas]` 正则（~308 行）：同样改为行首匹配

只认**独立成行**的标签，不在句子中间匹配。

### Layer 2 — parseEChartsPayload 防御性提取（兜底）

`src/utils/echartsPayload.ts`：

若 `bestEffortRepairJson` 返回 null 且源非 `{` 开头，定位第一个 `{` 并从该处切片重试解析。

### Layer 3 — System Prompt 收紧（治本）

`docs/01_system_prompts/DIAGRAM_PROTOCOL.md` + `resources/system_prompts/DIAGRAM_PROTOCOL.md`：

新增"标签使用规范"章节：
- `[echart]` / `[canvas]` 标签必须独立成行
- 必须成对出现
- 禁止在正文中提及内部标签名

同时将滞后的 resources 镜像同步至 docs 源（补齐了"节点形状规则"和"推荐结构图样板"两节）。

---

## 效果

- 正则不再误匹配句子中间的 `[echart]` / `[canvas]`
- 即使 payload 仍有前缀文本，`parseEChartsPayload` 也能通过 `indexOf('{')` 切片兜住
- system prompt 从源头约束模型不在正文中暴露标签名
