# API Key / Provider / Model 体验统一方案（v2，渐进式）

> **最后更新**：2026-04-22
> **状态**：设计中
> **前置阅读**：`docs/02_architecture/config-system.md`、`docs/02_architecture/provider-system.md`
> **面向读者**：Zilong（产品决策）、Cursor/Codex（执行者）、Claude Code（后续 review）

---

## 0. 为什么重写这份方案

上一版方案（v1）存在以下事实性错误，已全部丢弃：

1. **假设配置存储层走 `electron-store`**。实际上 OCT 不使用 electron-store，只有「Electron userData/config.json + 根目录 .env/.env.local + ~/.openclaw/openclaw.json」三处扁平 JSON/env，由 `oct-gateway/config.js` 的 `loadConfigFile()` 串起来。
2. **假设 gateway 是 `child_process.fork` + `process.send` IPC**。实际上 gateway 是独立 Node 进程 + WebSocket，前端通过 `electronAPI.saveApiKeys → ipcMain('save-api-keys') → CONFIG_FILE 写入 → gateway 重启 → config.js 重新加载` 这条链路同步配置。
3. **假设 `qwen / claude / gemini` 是一级 provider ID**。实际上的一级 provider ID 是 `bailian` / `deepseek` / `siliconflow` / `moonshot` / `groq` / `openai` / `ollama` / `minimax` / `google` / `custom`（见 `oct-gateway/providers.js` 中的 `PROVIDERS` 表）。Qwen 系列是 `bailian` provider 的模型，Gemini 是 `google` provider 的模型，Claude 目前只通过 `custom` 手动接入。
4. **要新建存储层、重构 ipc、新增 configReceiver.js**。本版只在当前结构上叠加"Beginner 分层 + Key 嗅探 + 默认策略"，不拆已有文件、不改已有数据流。

**本版方案目标 = 降低小白认知负担，同时保留现有多 Provider 能力，零破坏性变更。**

---

## 1. 现状梳理（以代码为准）

### 1.1 配置来源（真实加载顺序）

`oct-gateway/config.js`：

```
Electron userData/config.json      ← 设置面板写入的主来源
  ↓（同 key 不覆盖）
.env.local / .env                  ← 开发者本地
  ↓
~/.openclaw/openclaw.json          ← Legacy 旧配置，向后兼容
  ↓
PROVIDERS[id].baseUrl / defaultModel  ← 兜底默认
```

查找 userData 时会按平台尝试多个候选路径（`oct-gateway/config.js:42-53`）：
- Windows: `%APPDATA%/openclaw-terminal/config.json` 或 `%APPDATA%/OpenClaw Terminal/config.json`
- macOS: `~/Library/Application Support/openclaw-terminal/config.json`
- Linux: `~/.config/openclaw-terminal/config.json`

### 1.2 Provider 注册（`oct-gateway/providers.js`）

一级 provider ID 及关键信息：

| ID | 名称 | Key 字段 | Base URL 字段 | 备注 |
|---|---|---|---|---|
| `bailian` | 阿里云百炼 | `DASHSCOPE_API_KEY` | `DASHSCOPE_BASE_URL` | 默认 `dashscope.aliyuncs.com` |
| `deepseek` | DeepSeek 官方 | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | 默认 `api.deepseek.com/v1` |
| `siliconflow` | 硅基流动 | 复用 `DASHSCOPE_API_KEY`（另写 `SILICONFLOW_API_KEY`） | 复用 `DASHSCOPE_BASE_URL` | 共用字段历史遗留 |
| `moonshot` | Kimi 官方 | `MOONSHOT_API_KEY` / fallback `DASHSCOPE_API_KEY` | 默认 `api.moonshot.cn/v1` | |
| `groq` | Groq | `GROQ_API_KEY` / fallback `DASHSCOPE_API_KEY` | `GROQ_BASE_URL`，默认 `api.groq.com/openai/v1` | 官方 OpenAI-compatible 接法 |
| `openai` | OpenAI | `OPENAI_API_KEY` / fallback `DASHSCOPE_API_KEY` | 默认 `api.openai.com/v1` | 需翻墙 |
| `ollama` | 本地 Ollama | 固定 `ollama`（`fixedApiKey`） | `localhost:11434/v1` | 完全免费离线 |
| `minimax` | MiniMax | `MINIMAX_API_KEY`（`sk-cp-` 前缀） | `MINIMAX_BASE_URL` | 默认 `api.minimaxi.com/v1`，需 Token Plan |
| `google` | Gemini（Vertex AI OpenAI 兼容） | `GOOGLE_AI_API_KEY` | `GOOGLE_AI_BASE_URL` | 用 `x-goog-api-key` 头，支持独立 `GOOGLE_HTTPS_PROXY` |
| `custom` | 自定义 OpenAI 兼容 | `CUSTOM_API_KEY` | `CUSTOM_BASE_URL` | `CUSTOM_MODEL` 自填 |

### 1.3 MODEL_REGISTRY（`oct-gateway/config.js`）

`MODEL_REGISTRY` 声明每个模型的能力：`supportsTools`、`supportsThinking`、`thinkingFormat`、`supportsStreamOptions`、`maxTokens`。

- 覆盖了约 40 个主流模型，从 `qwen3.5-plus` 到 `gemini-3.1-pro-preview`。
- 未命中时通过 `getModelCaps()` 走 `buildModelIdCandidates` → `registry_exact` → `registry_prefix` → `fallback_unknown`。
- `fallback_unknown` 状态下，运行时探测缓存（`capability-probe-cache.json`）TTL：supported 7天、unsupported 7天、unknown 1天。

### 1.4 前端读写链路

**`electron/preload.ts`**：暴露 `getApiKeys` / `saveApiKeys` / `getProviderList` / `testAIConnection`。

**`electron/main.ts`**：
- `ipcMain('get-api-keys')`（L3272）：合并 `userData/config.json` + 根目录 `.env`（前者优先），返回一个大扁平对象（约 38 个字段）。
- `ipcMain('save-api-keys')`（L3393）：直接写回 `userData/config.json`，然后由前端触发 gateway 重启。
- `ipcMain('get-provider-list')`（L3634）：从 gateway 目录的 `providers.js` require 出 `PROVIDERS` 表。
- `ipcMain('test-ai-connection')`（L3650）：按当前 provider 拼 baseUrl/key/headers，向 `/chat/completions` 发一条 `max_tokens: 5` 的测试请求。

**`src/hooks/settings/useApiKeys.ts`**：
- `ApiKeysState` 是一个约 38 字段的扁平大对象，同一条语义（如"主对话 base url"）在不同 provider 下用不同字段承载。
- `resolveProviderId()`：优先 `OCT_PROVIDER`；否则看 `CUSTOM_*` 是否填了；再否则 `inferProviderFromBaseUrl()`。
- `buildGatewayPayload()`：根据 `currentProviderId` 把有效 baseUrl 写回对应字段，并把其他 provider 的 baseUrl 置空——字段归属耦合在前端。
- `saveGatewayAndReconnect()`：调用 `saveApiKeys` IPC 写入 config.json。

**`src/ui/settings/tabs/ConnectionTabView.tsx`**：Provider 选择器 + Key/Base URL/Model 表单 + 测试连接按钮，所有 provider 的字段在同一页平铺。

---

## 2. 用户认知负担分析

### 2.1 当前需要小白理解的概念

| 概念 | 在 UI 中出现几次 | 对小白是否必要 |
|---|---|---|
| **Provider（服务商）** | 1 个下拉 | 必要（决定在哪充钱） |
| **Model（模型）** | 1 个下拉 | 半必要（只需要"推荐/更强/更便宜"三档） |
| **API Key** | 每 provider 一个输入框 | 必要 |
| **Base URL** | 每 provider 一个输入框 | 对 90% 用户不必要 |
| **HTTPS_PROXY / HTTP_PROXY** | 2 个输入框 | 只有 Google/OpenAI 用户偶尔需要 |
| **`sk-sp-` vs `sk-` 前缀** | 仅在不兼容 provider 中防错 | 历史 Coding Plan Key 误填到其他官方接口会触发 401 |
| **`sk-cp-` 前缀** | 有滞后错误提示 | MiniMax Token Plan 踩坑重灾区 |
| **Qwen/DeepSeek/GLM 分别由哪家 provider 承载** | 无提示 | 小白经常选错服务商 |
| **`__custom__` 模型占位符** | Google / Custom 下拉里 | 反直觉概念 |
| **`CUSTOM_MODEL_SUPPORTS_TOOLS` 三态** | 无 UI 暴露 | 小白不可能理解 |
| **`SILICONFLOW_API_KEY` 同时写入 `DASHSCOPE_API_KEY`** | 无提示 | 隐藏耦合 |

### 2.2 核心痛点一句话总结

> 现在让小白一次性面对 **11 种 provider x 每家 4 个字段 x 2~3 种 Key 前缀陷阱**，而 90% 人只想选一家国内服务商填一个 Key 就开始用。

---

## 3. 设计方案：Beginner / Advanced 两层

**原则：现有所有字段、provider 表、MODEL_REGISTRY、ipc 通道全部保留。新增的只是 UI 层的"快捷通道"和一个 Key 嗅探工具函数。**

### 3.1 Beginner 模式（默认）

UI 折叠为 3 行：

1. **一句话选择**：单选卡片（不是下拉），只有 4 个推荐选项：
   - 阿里云百炼（推荐新手）→ `bailian`
   - DeepSeek（便宜够用）→ `deepseek`
   - MiniMax（自研 M2.7）→ `minimax`
   - 其它 / 高级 → 切到 Advanced

2. **API Key 粘贴框**（**只有 1 个输入框**）：
   - 粘贴任意 Key 后，前端调用 `detectProviderFromKey(key)`（见 5.1）自动识别 provider
   - 若命中 `bailian / deepseek / minimax` 三张默认卡之一，**选卡自动跟随更新**
   - 若命中 `google / groq / moonshot / openai / siliconflow / ollama / custom`，**不在 Beginner 内强行扩卡**，而是提示“检测到更适合在高级设置中配置”，并提供一键切到 Advanced
   - 识别成功 → 输入框下方显示"检测到：阿里云百炼 Coding Plan"
   - 识别失败 → 提示用户手动选或切 Advanced

3. **推荐模型**（只显示 1 个值，右侧一个"换一个"链接可在 2~3 个默认候选间切换；见 4.1）

下方 1 个按钮："保存并测试连接"。调用现有 `saveApiKeys` + `testAIConnection`，不给任何高级字段（Base URL、Proxy、自定义模型全部走默认值）。

### 3.2 Advanced 模式

保留现有 `ConnectionTabView.tsx` 的完整表单，仅做两个增量：
- 顶部加一个"切回新手模式"按钮。
- 在 Key 输入框旁加一个"嗅探 Key"图标按钮，调用 `detectProviderFromKey`，给出建议而不是强制切换。

**Advanced 模式是现有代码的叠加层，不动原有字段结构。**

### 3.3 模式持久化

用 `userData/config.json` 新增一个字段 `OCT_SETTINGS_MODE`：`'beginner' | 'advanced'`。默认 `beginner`。不传回 gateway（gateway 用不到，`config.js` 对未知字段自动忽略）。

---

## 4. 推荐模型与默认策略

### 4.1 推荐模型表

前端硬编码在新文件 `src/hooks/settings/recommendedModels.ts`，不动 `providers.js` / `config.js`。

| Provider | 第一推荐 | 第二候选 | 第三候选（便宜/快速） |
|---|---|---|---|
| `bailian` | `qwen-plus` | `qwen-max` | `qwen-turbo` |
| `deepseek` | `deepseek-chat` | `deepseek-reasoner` | — |
| `minimax` | `MiniMax-M2.7` | `MiniMax-M2.7-highspeed` | `MiniMax-M2.5` |
| `siliconflow` | `Qwen/Qwen2.5-72B-Instruct` | `deepseek-ai/DeepSeek-V3` | `Pro/Qwen/Qwen2.5-7B-Instruct` |
| `google` | `google/gemini-2.5-flash` | `google/gemini-2.5-pro` | `google/gemini-2.0-flash-001` |
| `openai` | `gpt-4o-mini` | `gpt-4o` | — |
| `moonshot` | `kimi-k2.6` | `kimi-k2.5` | `kimi-k2-turbo-preview` |
| `groq` | `llama-3.3-70b-versatile` | `llama-3.1-8b-instant` | `openai/gpt-oss-120b` / `openai/gpt-oss-20b` |
| `ollama` | `qwen2.5:7b` | — | — |
| `custom` | 用户填 | — | — |

所有 model ID 必须在 `MODEL_REGISTRY` 或 `PROVIDERS[id].models` 中可命中。

### 4.2 默认 Base URL 策略

Beginner 模式下**永远不向用户展示 Base URL**。保存时：
- 如果各 `*_BASE_URL` 字段用户没填 → 前端 `buildGatewayPayload` 已经写空串 → gateway `config.js` 里的 `preset.baseUrl` 兜底。
- 这条链路已经存在并正常工作，无需改动后端。

### 4.3 首次进入判断

- 无任何 Key → provider 卡默认高亮 `bailian`，但不写 `OCT_PROVIDER` 直到用户点"保存"。
- 老用户（config.json 已有 `OCT_PROVIDER` 且对应 Key 非空）→ 默认进入 Advanced 模式（尊重老用户的已有配置）。

---

## 5. Key 自动识别与连接测试

### 5.1 Key 前缀嗅探（纯前端，零网络请求）

追加到现有 `src/utils/providerUtils.ts`：

```ts
export function detectProviderFromKey(raw: string): {
  providerId: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  const k = String(raw || '').trim();
  if (!k) return { providerId: null, confidence: 'low', reason: '空 Key' };

  // 高置信前缀
  if (k.startsWith('sk-sp-'))
    return { providerId: null, confidence: 'medium', reason: '历史 Coding Plan Key，当前默认不自动切换 provider' };
  if (k.startsWith('sk-cp-'))
    return { providerId: 'minimax', confidence: 'high', reason: 'MiniMax Token Plan 前缀' };
  if (k.startsWith('gsk_'))
    return { providerId: 'groq', confidence: 'high', reason: 'Groq 前缀' };
  if (k.startsWith('AQ.'))
    return { providerId: 'google', confidence: 'high', reason: 'Google Vertex AI API Key 前缀' };
  if (/^AIza[0-9A-Za-z_-]{10,}$/.test(k))
    return { providerId: 'google', confidence: 'high', reason: 'Google Generative Language API Key' };

  // 中置信前缀
  if (k.startsWith('sk-or-'))
    return { providerId: 'custom', confidence: 'medium', reason: '疑似 OpenRouter，用自定义接入' };
  if (k.startsWith('sk-ant-'))
    return { providerId: 'custom', confidence: 'medium', reason: '疑似 Anthropic，用自定义或代理接入' };

  // 通用 sk- 前缀无法区分 DeepSeek/硅基/百炼/OpenAI
  if (/^sk-[A-Za-z0-9]{20,}$/.test(k))
    return { providerId: null, confidence: 'low', reason: '通用 sk- 前缀，可能是 DeepSeek / 硅基 / 百炼 / OpenAI 等，需要用户手动选择' };

  return { providerId: null, confidence: 'low', reason: '未识别前缀' };
}
```

Beginner 卡片在粘贴时实时调用：
- `high` confidence → 自动切卡
- `medium` → 提示"我们猜是 X，对吗？"
- `low` → 不动选卡，由用户手动选

### 5.2 连接测试错误分类

沿用现有 `ipcMain('test-ai-connection')`（`electron/main.ts:3650`），新增前端错误映射层（不改后端）：

| 错误特征 | 人话提示 |
|---|---|
| HTTP 401 / 403 | "API Key 无效或权限不足。MiniMax 需要 `sk-cp-` 前缀的 Token Plan Key。" |
| 超时（fetch abort） | "连接超时。如果你使用 Google 或 OpenAI，可能需要在高级设置里填写 HTTPS 代理地址。" |
| HTTP 404 + "model" | "模型不存在。请点击'换一个'尝试其他推荐模型。" |
| MiniMax + 非 `sk-cp-` | "MiniMax 现在需要 Token Plan API Key（以 sk-cp- 开头），普通按量 Key 不能用。" |
| 其它 | 原样显示前 200 字节 |

### 5.3 保存即验证流程

Beginner 的"保存并测试连接"按钮执行顺序：

1. `detectProviderFromKey` → 确认 provider（或用用户手动选）
2. `saveApiKeys` → 写 userData/config.json
3. 调用现有 `saveGatewayAndReconnect()`（内部仍走 `saveApiKeys`，并沿用当前重连/状态刷新链路；**不要单独绕过它去手写 restart-only 流程**）
4. `testAIConnection` → 返回结构化结果
5. 成功 → 快照到 `localStorage.OCT_LAST_GOOD_CONFIG`
6. 失败 → 提供"回滚到上次可用配置"按钮

---

## 6. Fallback 策略

### 6.1 配置字段兜底

保持现状：**用户填为空 → `preset.baseUrl` / `defaultModel`**。`config.js` 的 `getProviderConfig()` 已经实现这层兜底。Beginner 模式直接利用，前端不强制塞默认值进 config。

### 6.2 模型能力兜底

保持现状：`getModelCaps()` 未命中 → `fallback_unknown` → 运行时探测 → `runtime_probe` 缓存。Beginner 模式的推荐模型全部在 `MODEL_REGISTRY` 里有声明，正常命中 `registry_exact`。

### 6.3 Provider 不可用时的降级

新增前端策略（不侵入 gateway）：
- 连接测试连续失败 2 次后，给一个"换到 DeepSeek / 硅基试试"的建议按钮（小白常见救场路径）。
- 不做静默切换，要用户明确点击。

### 6.4 Key 误配防御（已有 + 增强）

- `siliconflow` provider 但 Key 为 `sk-sp-`：`config.js` 已有 warn + 置空逻辑（L799）。
- `minimax` provider 但 Key 非 `sk-cp-`：`test-ai-connection` 已有前置拦截（L3685-3689）。
- Beginner UI 新增：粘贴时如果嗅探出的 provider 和用户选的卡片不一致，弹出黄色提示。

---

## 7. 基于现有代码的渐进式落地步骤

### 阶段 A：前端主导（1~2 天，含极小 Electron 透传改动）

**目标**：上线 Beginner UI + Key 嗅探 + 推荐模型表。

| Step | 文件 | 动作 |
|---|---|---|
| 1 | `src/utils/providerUtils.ts` | 追加 `detectProviderFromKey` 函数 |
| 2 | `src/hooks/settings/recommendedModels.ts`（新建） | 导出 `RECOMMENDED_MODELS` 常量 |
| 3 | `src/hooks/settings/useApiKeys.ts` | 新增 `settingsMode` state + 读写 `OCT_SETTINGS_MODE`，并继续复用 `saveGatewayAndReconnect()` |
| 4 | `electron/preload.ts` | `saveApiKeys` 参数类型加可选 `OCT_SETTINGS_MODE` |
| 5 | `electron/main.ts` | `get-api-keys` / `save-api-keys` 加一行读写 `cfg.OCT_SETTINGS_MODE` |
| 6 | `src/ui/settings/tabs/ConnectionTabView.tsx` / `src/hooks/settings/useApiKeys.ts` / 相关类型 | 为 `SettingsApiKeysState` / `ApiKeysState` 补 `OCT_SETTINGS_MODE` 字段，避免只改 IPC 不改类型导致编译错误 |
| 7 | `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`（新建） | 4 卡片 + 单 Key 输入 + 推荐模型 |
| 8 | `src/ui/settings/tabs/ConnectionTabView.tsx` | 根据 `settingsMode` 渲染 Beginner 或 Advanced |

**不改**：`oct-gateway/*` 全部不动。

### 阶段 B：错误文案与回滚（0.5 天）

| Step | 文件 | 动作 |
|---|---|---|
| 9 | `src/utils/aiConnectionErrors.ts`（新建） | 错误字符串 → 人话映射 |
| 10 | `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx` | 接入错误映射 + "回滚到上次可用配置"按钮 |

### 阶段 C（可选，2 周后评估）：Key 存储分离

**仅当阶段 A/B 上线后用户仍频繁混淆字段时才做**：

在 `userData/config.json` 新增 `providers` 命名空间（与现有扁平字段**并存**）：

```json
{
  "OCT_PROVIDER": "bailian",
  "OCT_MODEL": "qwen-plus",
  "DASHSCOPE_API_KEY": "sk-...",
  "providers": {
    "bailian": { "apiKey": "sk-...", "baseUrl": "" },
    "deepseek": { "apiKey": "sk-...", "baseUrl": "" }
  }
}
```

`oct-gateway/config.js` 在 `getProviderConfig` 里优先读 `providers[id].apiKey`，回落到现有扁平字段。前端切 provider 时不再清空其它字段，用户多 Key 并存。

**此阶段代价高、收益中，默认不做。**

---

## 8. 风险点与兼容策略

| 风险 | 影响 | 兼容策略 |
|---|---|---|
| `siliconflow` 与 `bailian` 共用 `DASHSCOPE_API_KEY` 字段 | 切 provider 时串 Key | Beginner 模式 `siliconflow` 不在默认四卡里，仅 Advanced 暴露；Advanced 保留原警告 |
| `__custom__` 占位符作为 modelId 流到 gateway | 实际模型名丢失 | Beginner 模式永不输出 `__custom__`；Advanced 维持现有 `CUSTOM_MODEL` 覆盖逻辑 |
| 老用户 config.json 已有字段 | 新 UI 读不到 | Beginner 初次进入时调用 `resolveProviderId(existingConfig)`，能推出 provider 就直接进 Advanced 模式 |
| `MODEL_REGISTRY` 与 `providers.js` 的 model 列表不一致 | Beginner 推荐模型可能未注册 | 推荐表里所有 ID 必须在 `MODEL_REGISTRY` 中存在；checklist Step 9 验证 |
| Google 的 `x-goog-api-key` 头与其它 provider 不同 | 测试连接错误处理 | 沿用 `test-ai-connection` 现有的 provider 分支（main.ts L3691-3694），不动 |
| `.env` 里有值但 `config.json` 为空 | Beginner UI 看起来"没配置"但实际能跑 | `ipcMain('get-api-keys')` 已经做了 `config ?? env` 合并，Beginner 照常读取 |
| `OCT_SETTINGS_MODE` 字段被 gateway 误读 | 冗余日志 | `config.js` 对未知字段自动忽略，无影响 |
| 通用 `sk-` 前缀无法区分 provider | 嗅探失败 | 给出 `low` confidence，不自动切卡，由用户手动选 |

---

## 9. Cursor 可直接执行的 Checklist（阶段 A + B）

### Step 1 — 新增 Key 嗅探工具

- **文件**：`src/utils/providerUtils.ts`
- **动作**：追加 `detectProviderFromKey` 函数（实现见 5.1 完整代码块）
- **验证**：`npx tsc --noEmit` 通过

### Step 2 — 新增推荐模型表

- **文件**：`src/hooks/settings/recommendedModels.ts`（新建）
- **动作**：导出 `RECOMMENDED_MODELS: Record<string, string[]>`，内容按 4.1 表格
- **验证**：所有 model id 在 `oct-gateway/config.js` MODEL_REGISTRY 能命中

### Step 3 — useApiKeys 增加 settingsMode

- **文件**：`src/hooks/settings/useApiKeys.ts`
- **动作**：
  - `ApiKeysState` / 对外返回结构补充 `OCT_SETTINGS_MODE?: 'beginner' | 'advanced'`
  - state 加 `settingsMode: 'beginner' | 'advanced'`
  - 初始化逻辑：从 `getApiKeys().data.OCT_SETTINGS_MODE` 读取；首次无值时，如果 `resolveProviderId(data)` 能识别出 provider 且对应 Key 非空 → `advanced`；否则 `beginner`
  - `saveGatewayAndReconnect` 时把 `OCT_SETTINGS_MODE` 一起写入，**不要创建新保存链**
  - **验证**：切换后刷新设置页，模式持久化

### Step 4 — preload / main.ts 透传字段

- **文件**：`electron/preload.ts`
  - `saveApiKeys` 参数类型加可选 `OCT_SETTINGS_MODE?: string`
- **文件**：`electron/main.ts`
  - `ipcMain('get-api-keys')` 在 keys 对象加一行：`keys.OCT_SETTINGS_MODE = pick('OCT_SETTINGS_MODE', cfg.OCT_SETTINGS_MODE, '');`
  - `ipcMain('save-api-keys')` 加一行：`if (keys.OCT_SETTINGS_MODE !== undefined) cfg.OCT_SETTINGS_MODE = keys.OCT_SETTINGS_MODE;`
- **验证**：写入后 `userData/config.json` 出现该字段；gateway 启动无报错

### Step 5 — Beginner 子视图

- **文件**：`src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`（新建）
- **动作**：按 3.1 实现 4 卡片 + 单 Key 输入 + 推荐模型。`onSave` 调用既有 `saveGatewayAndReconnect`，然后调 `testAIConnection()`
- **额外规则**：若 `detectProviderFromKey` 命中非 Beginner 三卡 provider，则显示“此 Key 更适合在高级设置中配置”，并提供一键切换到 Advanced，而不是强行补第五张卡
- **样式**：用现有 CSS 变量（`#2B2A27` 暗色系，暖橙强调），不引入 Tailwind
- **验证**：手动测 3 种 Beginner provider 的 happy path

### Step 6 — 错误文案映射

- **文件**：`src/utils/aiConnectionErrors.ts`（新建）
- **动作**：按 5.2 把 `testAIConnection` 的 error 字符串映射为人话
- **验证**：人为塞错 Key，UI 显示友好文案

### Step 7 — 顶部切换入口

- **文件**：`src/ui/settings/tabs/ConnectionTabView.tsx`
- **动作**：根据 `settingsMode` 渲染 Beginner 或原 Advanced 内容；Advanced 顶部新增"切回新手模式"按钮；Beginner 右上角"高级设置"链接
- **验证**：切换无闪烁；已保存字段不丢

### Step 8 — 文档回填

- 新增 `docs/05_changelog/2026-04-XX-api-key-beginner-mode.md`
- 更新 `docs/02_architecture/config-system.md` 关键配置表加 `OCT_SETTINGS_MODE`
- 更新 `docs/02_architecture/provider-system.md` 数据流说明 Beginner UI

### Step 9 — 全量验证

- [ ] `npx tsc --noEmit` 无错
- [ ] `npm run build` + `npm run start` 正常
- [ ] 3 种 Beginner provider（bailian / deepseek / minimax）均能通过"保存并测试连接"
- [ ] Advanced 模式行为与改动前一致
- [ ] 老 `userData/config.json`（没有 `OCT_SETTINGS_MODE`）首次进入被判定为 Advanced
- [ ] `sk-cp-` / `gsk_` / `AQ.` / `AIza` 前缀嗅探正确；历史 `sk-sp-` 只做误填防错
- [ ] 通用 `sk-` 前缀不自动切卡

---

## 10. 禁区（本方案不得触碰）

| 文件/模块 | 原因 |
|---|---|
| `oct-gateway/providers.js` 现有 provider 的 `id` / `keyEnvVars` / `baseUrl` | 后端注册表，牵一发动全身 |
| `oct-gateway/config.js` 的 `getProviderConfig` 字段读取优先级 | 已稳定的配置加载链 |
| `oct-gateway/ai.js` 的请求组装逻辑 | 流式请求核心路径 |
| `MODEL_REGISTRY` 任何已有条目 | 已验证的能力声明 |
| `useTypewriter` / `StreamRouter` / `TurnFSM` / `ChatTab_v2` | CLAUDE.md 声明的绝对禁区 |
| `_processContentChunk` / `_flushThinkState` | CoT 解析状态机 |
| `.chat-messages-wrap` 的 `display: block` | 改成 flex 会导致滚动抖动 |
| `programmaticScrollRef` 逻辑 | 区分用户滚动和程序滚动 |

---

## 更新日志

| 日期 | 内容 |
|---|---|
| 2026-04-22 | v2 完全重写：丢弃 v1 全部架构假设，基于实际代码现状设计渐进式 Beginner/Advanced 两层方案 |
