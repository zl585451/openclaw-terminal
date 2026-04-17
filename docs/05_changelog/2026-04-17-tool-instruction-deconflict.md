# 2026-04-17 工具指令去冲突（提示词清洗 + strict 安全网）

## 背景

- 部分 strict 模型在工具调用漂移时，会把 `tool_call>canvas(...)` 或 `canvas("create", ...)` 直接输出到正文。
- 现有策略下伪调用检测仅对 `loose` 生效，导致 strict 模型的正文伪调用无法兜底执行。
- 同时，系统提示词与上下文提示里存在函数签名式示例（如 `canvas(action, ...)`），会诱导模型输出调用文本。

## 改动

### 1) 清洗系统提示词中的函数签名式工具示例

- 文件：`oct-gateway/ai.js`
- 将工具描述从函数签名风格改为自然语言：
  - `web_search(query)` -> `web_search 工具`
  - `read_file(path)` -> `read_file 工具`
  - `exec_command(command)` -> `exec_command 工具`
  - `canvas(action, ...)` -> `canvas 工具`
- 保留工具用途与路由规则，不再在提示词展示调用格式。

### 2) 清洗动态 Canvas 上下文提示中的调用格式

- 文件：`oct-gateway/runtime/contextBuilder.js`
- `_buildCanvasSuggestion()` 与 `_buildCanvasRoundtrip()` 中，移除 `canvas(action="...")` 形式文本，改为“使用 canvas 工具 + action 意图”的自然语言描述。

### 3) 清洗结构图协议中的调用格式

- 文件：`docs/01_system_prompts/DIAGRAM_PROTOCOL.md`
- 将 `调用 canvas(...)` 改为 `使用 canvas 工具创建结构图`。

### 4) strict 模型伪调用安全网

- 文件：`oct-gateway/ai.js`
- 在 stream 收尾阶段，保留原有 `loose` 模型伪调用检测。
- 新增 strict 安全网：当本轮无伪调用解析结果、但正文含明显工具调用残留（如 `tool_call>canvas` / `canvas("create"... )` / `<tool_call>`）时，触发一次 `extractAllPseudoToolCalls` 兜底解析并记录 warn 日志。

## 验证

- `node --check oct-gateway/ai.js` 通过
- `node --check oct-gateway/runtime/contextBuilder.js` 通过
- `contextBuilder.js` 与 `DIAGRAM_PROTOCOL.md` 中 `canvas(` 已清零（提示词字符串层面）

