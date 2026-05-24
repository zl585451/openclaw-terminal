# OCT 瘦身 Phase F-2：AI.library knowledge client 按需加载

日期：2026-05-25

## 背景

AI.library 当前默认承担“项目书库核心”的 Electron 内置能力；旧的专业知识检索/RAG 已默认关闭。Gateway 侧 `tools/ai_library.js` 仍是专业知识检索 HTTP client，用于 `/status` 健康检查、`search_knowledge` 工具和可选 context injection。

在默认配置 `ai_library.knowledge_search_enabled = false` 下，普通聊天不需要加载这个专业知识检索 client。

## 本次变更

- 新增 `oct-gateway/runtime/lazyAiLibrary.js`
  - 提供 lazy proxy：首次调用 `searchKnowledge` / `formatKnowledgeForPrompt` / `checkHealth` / `clearCache` 时才加载真实 `tools/ai_library.js`。
- 调整 `oct-gateway/index.js`
  - 删除启动期 eager `require('./tools/ai_library')`。
  - Gateway 入口向 slash/status 与 context builder 注入 lazy proxy。
- 调整 `oct-gateway/runtime/contextBuilder.js`
  - 仅当 `config.ai_library.knowledge_search_enabled === true` 时才尝试知识检索注入。
  - 默认聊天不加载 AI.library knowledge client。
- 调整 `oct-gateway/tools/search_knowledge.js`
  - 工具定义仍可被 ToolLoader 启动期发现。
  - 真实 AI.library client 只在工具执行时加载。
- 新增 `oct-gateway/test/lazyAiLibrary.test.js`
  - 锁定首次方法调用前不加载模块。
  - 锁定后续方法复用同一实例。

## 非目标

- 不改变 Electron 内置项目书库 IPC / HTTP bridge。
- 不删除 `search_knowledge` 工具。
- 不恢复默认专业 RAG；`knowledge_search_enabled` 继续保持显式启用。

## 验证

- `node oct-gateway/test/lazyAiLibrary.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/chatRequestHandler.test.js`
- `npx tsc --noEmit`
- `npx vitest run`
