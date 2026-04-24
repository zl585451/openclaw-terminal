# 2026-04-24 DeepSeek V4 模型更新

## 变更内容

根据 [DeepSeek 官方 API 文档](https://api-docs.deepseek.com/zh-cn/)，`deepseek-chat` 与 `deepseek-reasoner` 将于 **2026/07/24** 弃用，官方已推出替代模型：

| 旧模型（弃用倒计时） | 新模型 | 说明 |
|---|---|---|
| `deepseek-chat` | `deepseek-v4-flash` | 通用对话，推荐使用 |
| `deepseek-reasoner` | `deepseek-v4-pro` | 深度推理（思考模式） |

新模型上下文窗口从 64K 提升至 **128K**。

## 涉及文件

### 前端（`src/`）
- `src/hooks/settings/useApiKeys.ts` — provider 定义，`defaultModel` 更新
- `src/hooks/settings/recommendedModels.ts` — 推荐模型列表更新
- `src/components/FirstLaunchSetup.tsx` — 新手引导文案更新
- `src/ui/chat/ChatTabRightPanel.tsx` — context window 配置更新

### 后端（`oct-gateway/`）
- `oct-gateway/providers.js` — provider 模型列表新增 V4，保留旧版兼容
- `oct-gateway/config.js` — 模型配置新增 V4，context window 更新
- `oct-gateway/ai.js` — fallback 默认模型、context window、maxTokens 更新
- `oct-gateway/config.json.example` — 示例配置更新

### Electron（`electron/`）
- `electron/main.ts` — provider 定义、context window 配置更新

## 兼容性

旧模型（`deepseek-chat`/`deepseek-reasoner`）保留但标记为弃用，现有配置不受影响，建议用户尽快切换至新模型。
