# 2026-04-17 会话可靠性整改 P1（能力三态 + 自定义模型工具开关）

## 变更目标

- 将工具能力从布尔值升级为三态：`supported | unknown | unsupported`。
- 自定义 OpenAI 兼容模型默认关闭工具执行，避免误判导致 400/不稳定行为。
- 在状态输出中明确能力来源，降低排障成本。

## 代码变更

- [oct-gateway/config.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/config.js)
  - `getModelCaps()` 增强：返回 `toolsSupport` 与 `capabilitySource`。
  - 未知模型能力改为 `unknown`（运行时仍保守不执行工具）。
  - 新增 `CUSTOM_MODEL_SUPPORTS_TOOLS` 显式开关（默认 `false`）。
  - `getEnvOrConfig()` 修复：保留显式 `false` 配置值，避免被 `||` 覆盖。

- [oct-gateway/runtime/providerRouter.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/providerRouter.js)
  - 统一输出 `toolsSupport` / `capabilitySource`，并兼容 `supportsTools` 旧布尔字段。

- [oct-gateway/gateway/slash.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/gateway/slash.js)
  - `/status` 新增工具能力三态和来源显示。
  - `/model` 切换后对 `unknown/unsupported` 给出差异化提示。

- [oct-gateway/index.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/index.js)
  - `hello-ok.capabilities` 新增 `toolsSupport` 与 `capabilitySource`。

- [electron/main.ts](/e:/windows-window/OpenClaw-Terminal/electron/main.ts)
  - 扩展能力透传类型，保留三态字段。

- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts)
  - 扩展能力字段类型，支持三态透传。

- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts)
  - 扩展 `GatewayCapabilities` 类型，支持三态字段。

- [src/ui/chat/ChatTab.v2.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTab.v2.tsx)
  - 状态栏根据能力三态显示 `TOOL UNKNOWN` 或 `NO TOOL EXEC`。

## 文档同步

- [docs/02_architecture/provider-system.md](/e:/windows-window/OpenClaw-Terminal/docs/02_architecture/provider-system.md)
  - 新增能力三态与自定义工具开关说明。

- [docs/03_specs/WEBSOCKET_PROTOCOL.md](/e:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md)
  - 增补 `hello-ok.capabilities.toolsSupport` 与 `capabilitySource` 字段。
