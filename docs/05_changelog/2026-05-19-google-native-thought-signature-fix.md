# 2026-05-19 Google Native thoughtSignature 修复

## Summary

修复 Google Vertex 原生 SDK 通道在工具调用续轮时丢失 Gemini `thoughtSignature` 的问题。

## Root Cause

Gemini 3 / 2.5 thinking 模型在返回 `functionCall` 时，会把 `thoughtSignature` 挂在原生 content part 上。Gateway 之前只读取 `chunk.functionCalls` 的函数名与参数，并在清洗 `google_native_content` 时丢弃 part 级 `thoughtSignature`，导致下一轮带工具结果续写时触发 Google 400：

> Function call is missing a thought_signature in functionCall parts.

## Changed

- 从 `chunk.candidates[].content.parts[]` 提取 `functionCall` 与 part 级 `thoughtSignature`。
- 将签名写入 `tool_calls[].extra_content.google_native`。
- 在转换历史消息回 Google 原生 `contents` 时，将签名原样挂回 `functionCall` part。
- 扩展 `oct-gateway/test/googleNative.test.js`，覆盖签名提取、保存与续轮回传。

## Verification

- `node oct-gateway/test/googleNative.test.js`
- `node oct-gateway/test/toolLoopReasoningContent.test.js`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`
