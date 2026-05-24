# OCT 瘦身 Phase F-2：script_adapter gateway runtime 懒加载

日期：2026-05-25

## 背景

Phase F-1 已把 `tools`、`mcp_tools`、`script_adapter`、`image_analysis`、`memory`、`ai_library` 标为可选能力包，但当时只建立可观测边界，没有改变运行时加载方式。

`script_adapter` 属于内容生产/工作台能力，不是核心聊天主链。它适合作为 Phase F-2 的第一条懒加载试点，因为入口协议已经在 Phase C-1 收口到 `scriptAdapter.*` message handler。

## 本次变更

- 新增 `oct-gateway/script_adapter/lazyMessageHandler.js`。
  - 非 `scriptAdapter.*` 请求直接 fallthrough，不加载内容工作流 runtime。
  - 首个 `scriptAdapter.*` 请求才加载 chapter pipeline、batch/intake/analysis/handoff orchestrators、persistence、connection registry 和真实 message handler。
  - runtime 加载失败时返回 gateway error response，避免请求悬空。
- 调整 `oct-gateway/index.js`。
  - 删除 gateway 启动期对 `script_adapter` runtime 子模块的 eager require。
  - 保留原有 `scriptAdapter.*` 方法形状与真实 handler 行为。
  - 只有 lazy runtime 已经加载后，新连接才补订阅 running batches，避免普通聊天连接初始化内容工作流。
- 新增 `oct-gateway/test/scriptAdapterLazyMessageHandler.test.js`。
  - 锁定非脚本请求不加载 runtime。
  - 锁定脚本请求只加载一次并委托真实 runtime。
  - 锁定加载失败时的 gateway 错误响应。

## 非目标

- 不删除 `oct-gateway/script_adapter/`。
- 不改变 `scriptAdapter.*` 协议、payload 或 UI workbench 行为。
- 不拆前端 `src/modules/script-adapter` bundle；这是后续 Phase F 前端拆包任务。
- 不触碰 provider fallback、tool loop、memory 搜索主链。

## 验证

- `node oct-gateway/test/scriptAdapterLazyMessageHandler.test.js`
- `node oct-gateway/test/scriptAdapterMessageHandler.test.js`
- 后续批次继续跑 gateway smoke、optional capabilities、TypeScript。
