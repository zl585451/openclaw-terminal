# Fix: 拦截模型输出的 [canvas] 标签，防止 echart 代码泄漏到聊天区

**日期**: 2026-04-11  
**类型**: Bug Fix  
**影响范围**: oct-gateway / src/utils

---

## 问题

MiniMax-M2.7 在接收到 "使用 canvas echart" 指令后，没有触发 `canvas()` 工具调用，而是直接在聊天正文输出 `[canvas] {...JSON...} [/canvas]` 格式的文本。由于前端只处理 `[echart]...[/echart]` 和 ` ```echart``` ` 两种格式，`[canvas]` 标签原样透出，导致大段 JSON 代码裸露在聊天窗口中。

---

## 修改

### 1. `oct-gateway/runtime/contextBuilder.js` — 收紧系统提示（治本）

原提示：
```
[系统] 使用 canvas echart。content={"title":"...","option":{...}}，纯 JSON，不硬编码颜色。
```

新提示：
```
[系统] 调用 canvas(action="create", artifactType="echart", content=...) 输出图表。
若无法调用工具，则改用 ```echart\n{...}\n``` 代码块格式。
严禁在正文输出 [canvas]...[/canvas] 标签，严禁在聊天正文暴露 JSON 图表代码。
```

明确给出两条合法路径（工具调用 / echart 代码块），并明确禁止 `[canvas]` 标签格式。

### 2. `src/utils/markdownPreprocess.ts` — 前端兜底（治标）

扩展 `normalizeCustomEchartBlocks`，新增对 `[canvas]...[/canvas]` 格式的检测：
- 若 payload 包含 `"option":` 或 `"series":` 字段，识别为 echart 数据，自动转换为 ` ```echart``` ` 代码块
- 否则原样保留，不误处理非图表内容

---

## 效果

- 模型若走工具调用：Canvas 正常打开
- 模型若输出 ` ```echart``` `：前端 EchartBlock 组件接管，显示 "Open" 卡片
- 模型若仍输出 `[canvas]...[/canvas]`（旧行为兜底）：前端自动转换为 echart 卡片，不再裸露 JSON
