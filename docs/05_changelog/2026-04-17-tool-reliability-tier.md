# 2026-04-17 工具可靠性分级与伪调用兼容

## 变更摘要

- 在 `oct-gateway/providers.js` 增加 `toolReliability` 分级机制：
  - `strict`：优先用于官方稳定 function-calling 通道
  - `loose`：允许工具注入，并启用伪工具调用兜底解析
  - `none`：不注入工具，仅纯对话
- 增加 provider 级默认策略，避免逐模型硬编码：
  - `bailian / bailian-coding / deepseek / moonshot / openai / minimax` 默认 `strict`
  - `siliconflow / groq / custom` 默认 `loose`
  - `ollama` 默认 `none`

## 网关路由与能力透传

- `oct-gateway/runtime/providerRouter.js` 在 `caps` 中透传 `toolReliability`
- 未显式声明时，按当前模型工具能力回退：
  - 非 `supported` -> `none`
  - `supported` -> `loose`

## 配置归一化

- `oct-gateway/config.js` 增加 `normalizeToolReliability()`，统一输出 `strict|loose|none`
- `getModelCaps()` 结果新增 `toolReliability`
- 动态自定义模型与 fallback 模型列表同步带上 `toolReliability`

## AI 执行链调整

- `oct-gateway/ai.js`
  - 工具注入条件改为：`supportsTools && toolReliability !== 'none' && !hasImage`
  - 伪工具检测仅在 `toolReliability === 'loose'` 时启用
  - 新增函数调用风格解析：`canvas("create", "...", "...", {...})`
  - 新增统一入口 `extractAllPseudoToolCalls()`（兼容旧格式 + 函数风格）
  - `enforceExecutionContract` 依据“实际可注入工具能力”判断，避免 none 级误报

## 影响

- 对稳定模型减少伪解析干扰（strict 不跑伪检测）
- 对格式漂移模型提升兼容性（loose 可从正文恢复工具调用）
- 对不支持工具模型彻底隔离工具路径（none）
