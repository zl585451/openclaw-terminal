# OCT 瘦身 Phase F-2：ToolLoader 静态工具按需加载

日期：2026-05-25

## 背景

`oct-gateway/tool_loader.js` 被 Gateway 入口、AI 请求、图片 fallback、agent runner、HTTP 工具路由、MCP manager 等多处 require。此前模块初始化时会立即扫描并 require `oct-gateway/tools/*.js`，导致普通启动也加载全部静态工具。

Phase F-2 的目标是降低启动主链负担，同时不改变工具定义和执行契约。

## 本次变更

- `oct-gateway/tool_loader.js`
  - 移除模块底部的启动期 `loadTools()`。
  - 新增 `ensureToolsLoaded()`。
  - `getDefinitions()`、`executeTool()`、`getToolMeta()` 首次调用时加载静态工具。
  - 显式 `loadTools()` 仍保留，用于热重载或测试。
  - `registerProvider()` 不触发静态工具加载，MCP 动态 provider 可继续在启动期注册。
- `oct-gateway/test/toolLoaderLazyInit.test.js`
  - 覆盖 require `tool_loader` 不加载静态工具。
  - 覆盖首次 `getDefinitions()` 加载一次，重复调用不重复加载。

## 非目标

- 不改变工具定义结构。
- 不改变 `executeTool()` 的权限检查、MCP fallback 或错误行为。
- 不拆分具体工具文件。

## 验证

- `node oct-gateway/test/toolLoaderLazyInit.test.js`
- `node oct-gateway/test/toolLoopReasoningContent.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/optionalCapabilities.test.js`
