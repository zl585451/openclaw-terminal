# 2026-04-18 · 工具能力自动判定修复（/status）

## 问题
- `/status` 显示 `Tool 执行: unknown（默认禁用）`，即使用户已配置为 OpenAI 兼容模型。
- 日志出现 `resolve model caps failed, using defaults`，导致能力展示和执行判断偏保守。

## 修复
1. 修复网关能力读取异常
- 在 `oct-gateway/index.js` 中补齐 `ProviderRouter` 初始化，避免 `providerRouter is not defined`。

2. `/status` 增加自动探测
- 在 `oct-gateway/gateway/slash.js` 中新增运行时探测逻辑：
  - 当模型能力为 `unknown` 时，自动向当前模型发起一次 noop tools probe；
  - 将探测结果写入 probe cache；
  - `/status` 直接显示探测后的 `supported / unsupported / unknown`。

3. 能力来源修正
- 仅当模型条目明确声明 `tools: true/false` 时，来源显示 `provider_model_def`。
- 未显式声明时，优先显示 `runtime_probe` 或 registry 来源，避免误导。

## 结果
- 用户不需要理解 provider/model 细节，执行 `/status` 即可看到当前模型工具能力是否可用。
- unknown 状态会自动收敛，不再长期停留在“默认禁用”且无解释的状态。
