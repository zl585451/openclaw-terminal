# 2026-04-17 会话稳定性止血：sidecar 并发收口与空回复兜底

## 背景
- 线上出现“工具调用中会话像断开”的问题。
- 日志显示同一用户请求出现并发流：主链路 `turnId=req-*` 与旁路 `turnId=null` 同时运行。
- 在 `finishReason=unexpected_state` 场景，主链路可能出现 `done(len=0)`，用户端感知为“断开且无输出”。

## 本次修复
1. 暂停并发 hypothesis sidecar
- 文件：`oct-gateway/runtime/contextBuilder.js`
- 调整：停用 `hypothesis.selectBestApproach` 的异步 sidecar 调用，避免并发 `streamChat` 污染主会话链路。

2. `unexpected_state` 明确走错误出口
- 文件：`oct-gateway/ai.js`
- 调整：当 `finishReason=unexpected_state` 且未产出正文/无有效工具调用时，直接 `onError`，不再走空 `done` 收尾。

3. 空回复兜底文案
- 文件：`oct-gateway/runtime/chatEngine.js`
- 调整：若最终 `sanitizedReply` 为空，替换为可读提示，避免用户看到“无内容结束”。

## 预期效果
- 避免同轮并发 sidecar 干扰主会话稳定性。
- 避免 `done(len=0)` 导致的“会话断开”错觉。
- 异常场景可见、可解释、可重试。
