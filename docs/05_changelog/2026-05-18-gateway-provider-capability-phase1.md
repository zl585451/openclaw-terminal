# 2026-05-18 Gateway Provider Capability Phase 1

## What Changed

- 新增 `oct-gateway/runtime/providerCapabilities.js`
- 将 `oct-gateway/ai.js` 与 `oct-gateway/gateway/slash.js` 中重复的 provider capability 逻辑抽到共享模块
- 统一了以下行为：
- chat completion 请求头生成
- tool support probe
- probe failure 分类
- probe 结果缓存写回

## Why

- 之前 `ai.js` 和 `slash.js` 各自维护一份近似实现
- 后续调整 Google / Vertex / OpenAI 兼容层时，容易只改到一边
- 先把这层收口，后面的 `config.js` 拆分和 provider 行为整理才不会继续扩散重复代码

## Files

- `oct-gateway/runtime/providerCapabilities.js`
- `oct-gateway/ai.js`
- `oct-gateway/gateway/slash.js`
- `docs/02_architecture/01-gateway.md`

## Notes

- 本阶段只处理网关共享能力层，不扩大到 `llmClient.js`、`image_analyzer.js` 等其他调用点
- 下一阶段继续拆 `config.js`
