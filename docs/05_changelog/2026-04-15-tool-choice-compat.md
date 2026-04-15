# fix: tool_choice 对象形式兼容硅基流动等服务商

> Date: 2026-04-15  
> Type: Bug Fix  
> 影响范围: 使用硅基流动 / 自定义 OpenAI 兼容服务商时触发 Canvas 模式

## 问题

用户使用硅基流动 KEY（Qwen、Kimi 等）点击欢迎界面「画布」卡片时，返回 HTTP 400：
```
{"code":20015,"message":"Value error, Specifying functions for tool_choice is not yet supported."}
```

## 根因

Canvas 模式触发后，`index.js` 向 `streamChat` 传入 `tool_choice: { type: 'function', function: { name: 'canvas' } }`。
硅基流动 API 不支持此对象形式，仅支持字符串 `'auto'` / `'none'`。

## 修复

### oct-gateway/providers.js
- `bailian`、`bailian-coding`、`openai` 新增 `supportsToolChoiceFunction: true`
- 其他 provider（siliconflow、custom、moonshot、groq 等）不设该字段，默认视为不支持

### oct-gateway/ai.js（line ~920）
- 发送请求前检查：若 `toolChoice` 为对象 且 `provider.supportsToolChoiceFunction` 不为 true，
  则自动降级为 `'auto'`，并打印 warn 日志
- 百炼 / OpenAI 行为不变，仍发对象形式强制 canvas 工具
