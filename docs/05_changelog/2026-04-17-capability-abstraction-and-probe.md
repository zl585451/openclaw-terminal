# 2026-04-17 跨供应商模型能力抽象与动态探测

## 背景

不同供应商对同一模型家族使用不同命名：
- `glm-5`
- `Pro/zai-org/GLM-5`
- `Qwen/Qwen3.5-32B`

仅靠静态模型名单容易误判工具能力（尤其是列表外模型）。

## 方案

### 1) 模型 ID 抽象层（config）

- 新增 `normalizeModelId(modelId)`
- 新增 `detectModelFamily(modelId)`
- 新增 `buildModelIdCandidates(modelId)`
- `getModelCaps()` 使用候选 ID 进行匹配，优先 `registry_exact`，其次 `registry_prefix`

### 2) 动态探测层（runtime probe）

- 当 `toolsSupport=unknown` 时，`ai.js` 在正式请求前执行轻量探测：
  - 向目标模型发送最小 `tools + tool_choice(function)` 请求
  - 根据返回结果判定 `supported/unsupported/unknown`
- 探测结果写入缓存并带 TTL（7d/7d/1d）

### 3) 缓存复用层（providerRouter）

- `providerRouter.resolve()` 对 unknown 模型读取探测缓存：
  - 命中后能力来源记为 `runtime_probe_cache`
  - 避免重复探测、降低延迟

## 涉及文件

- [oct-gateway/config.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/config.js)
- [oct-gateway/runtime/providerRouter.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/providerRouter.js)
- [oct-gateway/ai.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js)
- [oct-gateway/gateway/slash.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/gateway/slash.js)

## 验收要点

1. `Pro/zai-org/GLM-5` 能命中归一化后能力，不再固定 `fallback_unknown`。
2. 真正未知模型首次请求后，`/status` 的能力来源可出现 `runtime_probe` 或 `runtime_probe_cache`。
3. 第二次同模型请求不再重复探测（命中缓存）。
