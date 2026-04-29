# 内容制作模型配置 MVP 方案

## 目标

先跑出内容创作工作台 MVP：用户只需要填入阿里百炼 API Key，即可让内容制作 Agent 队列使用一套可控、稳定、便于测试的文本模型配置。

本阶段暂不纳入 DeepSeek、MiniMax 作为内容制作主链路模型。原因是二者在当前实测中容易输出思维内容或交错式推理文本，会污染 JSON 产物解析。它们后续可以作为高级实验模型或局部润色模型重新接入。

## 当前落地状态

已落地 MVP：

1. 设置面板高级连接页新增“内容制作模型”独立卡片。
2. Electron `get-api-keys` / `save-api-keys` 支持内容制作专用字段。
3. Gateway `config.scriptAdapter` 会把平铺字段合成为 `scriptAdapter.models`。
4. `llmClient.resolveProviderFor('script_adapter.<role>')` 支持按 Agent 角色选择模型。
5. 业务分析、文本改写、角色音分类、演播设计、质检审校已分别读取自己的 role model。

## 设计原则

1. 普通用户只看到“内容制作模型方案”和“API Key”。
2. 高级用户可以展开每个 Agent 的模型映射。
3. Chat 默认模型与内容制作模型分离，不再用一个 `OCT_MODEL` 同时承担聊天、分析、改写、质检。
4. MVP 只开放阿里百炼推荐模型池，避免模型列表过长导致设置面板继续变乱。
5. 所有结构化产物 Agent 默认使用非思考型、JSON 更稳定的模型；暂不展示 DeepSeek / MiniMax。

## 设置面板入口

建议放在现有设置面板的“连接”页内，但作为独立卡片，不混进默认聊天模型区。

布局建议：

```text
连接

[默认聊天模型]
供应商 / 模型 / API Key / Base URL ...

[内容制作模型]
模型方案：阿里百炼内容制作 MVP
API Key：  [ sk-******************************** ] [测试连接]
状态：     未测试 / 可用 / 失败原因

[高级配置]
> Agent 模型映射
> 超时与输出上限
> 自定义 Base URL
```

### 普通模式

普通模式只暴露：

1. `模型方案`
   - 默认：`阿里百炼内容制作 MVP`
2. `API Key`
   - 写入 `DASHSCOPE_API_KEY`
   - 保存到 root `.env`、用户配置或现有安全存储机制之一
3. `测试连接`
   - 只做轻量请求：模型列表或极短 chat completion
   - 成功后显示当前会使用的默认模型

### 高级模式

点击“Agent 模型映射”后显示表格：

```text
环节              默认模型          备选模型
业务分析          qwen3.5-plus      qwen3-max
文本改写          qwen3.5-plus      qwen3-max
角色音分类        qwen3.5-flash     qwen3.5-plus
演播设计          qwen3.5-flash     qwen3.5-plus
质检审校          qwen3.5-plus      qwen3-max
兜底复核          qwen3-max         qwen3.5-plus
```

下拉框只展示本方案白名单模型，不展示百炼全量模型。

## MVP 模型白名单

### 主力模型

1. `qwen3.5-plus`
   - 默认主力模型。
   - 用于长章节理解、文本改写 JSON、质检审校。
   - 文本改写只要求模型产出台本核心字段（片段类型、说话人、台本文字），不要求逐段输出改写说明。
   - 优先覆盖内容制作主链路。

2. `qwen3.5-flash`
   - 默认轻量模型。
   - 用于角色音分类、演播设计初稿、低风险结构化任务。
   - 用于降低 MVP 测试成本。

3. `qwen3-max`
   - 高质量升级模型。
   - 用于复杂章节策略、疑难质检、失败重试后的人工升级。
   - 不作为全链路默认，避免成本和延迟过高。

### 暂不展示

1. DeepSeek 系列
   - 暂不作为 MVP 内容制作模型。
   - 后续需要先完成 reasoning 内容隔离与 JSON 清洗策略。

2. MiniMax 系列
   - 暂不作为 MVP 内容制作模型。
   - 后续更适合放入“片段润色 / 风格强化 / 样章精修”高级功能。

3. Coder、Embedding、Image、Audio 模型
   - 不属于当前内容制作文本主链路。

## 默认 Agent 模型映射

```json
{
  "contentModelProfile": {
    "active": "aliyun-bailian-content-mvp",
    "profiles": {
      "aliyun-bailian-content-mvp": {
        "label": "阿里百炼内容制作 MVP",
        "provider": "aliyun-bailian",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "apiKeyRef": "DASHSCOPE_API_KEY",
        "roles": {
          "businessAnalysis": {
            "model": "qwen3.5-plus",
            "fallbackModel": "qwen3-max"
          },
          "textRewriter": {
            "model": "qwen3.5-plus",
            "fallbackModel": "qwen3-max"
          },
          "voiceClassifier": {
            "model": "qwen3.5-flash",
            "fallbackModel": "qwen3.5-plus"
          },
          "performanceDesigner": {
            "model": "qwen3.5-flash",
            "fallbackModel": "qwen3.5-plus"
          },
          "qualityReviewer": {
            "model": "qwen3.5-plus",
            "fallbackModel": "qwen3-max"
          },
          "qualityEscalation": {
            "model": "qwen3-max",
            "fallbackModel": "qwen3.5-plus"
          }
        },
        "limits": {
          "analysisTimeoutMs": 120000,
          "textRewriterTimeoutMs": 120000,
          "textRewriterMaxTokens": 6000,
          "textRewriterChunkTargetChars": 2200,
          "textRewriterChunkMaxChars": 2600
        },
        "capabilities": {
          "strictJsonPreferred": true,
          "reasoningOutputAllowed": false,
          "thinkingModelsAllowed": false
        }
      }
    }
  }
}
```

## 兼容现有配置的落地方式

MVP 可以先不重构整个设置系统，只新增一个内容制作专用配置块：

```json
{
  "scriptAdapter": {
    "providerPreset": "aliyun-bailian-content-mvp",
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "",
    "apiKeyEnv": "DASHSCOPE_API_KEY",
    "realAgents": "all",
    "models": {
      "businessAnalysis": "qwen3.5-plus",
      "textRewriter": "qwen3.5-plus",
      "voiceClassifier": "qwen3.5-flash",
      "performanceDesigner": "qwen3.5-flash",
      "qualityReviewer": "qwen3.5-plus",
      "qualityEscalation": "qwen3-max"
    },
    "textRewriterTimeoutMs": 120000,
    "textRewriterMaxTokens": 6000
  }
}
```

实际保存时，Electron 同时支持以下平铺字段，便于兼容现有设置面板：

```json
{
  "SCRIPT_ADAPTER_PROVIDER_PRESET": "aliyun-bailian-content-mvp",
  "SCRIPT_ADAPTER_API_KEY": "sk-...",
  "SCRIPT_ADAPTER_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "SCRIPT_ADAPTER_REAL_AGENTS": "all",
  "SCRIPT_ADAPTER_BUSINESS_ANALYSIS_MODEL": "qwen3.5-plus",
  "SCRIPT_ADAPTER_TEXT_REWRITER_MODEL": "qwen3.5-plus",
  "SCRIPT_ADAPTER_VOICE_CLASSIFIER_MODEL": "qwen3.5-flash",
  "SCRIPT_ADAPTER_PERFORMANCE_DESIGNER_MODEL": "qwen3.5-flash",
  "SCRIPT_ADAPTER_QUALITY_REVIEWER_MODEL": "qwen3.5-plus",
  "SCRIPT_ADAPTER_QUALITY_ESCALATION_MODEL": "qwen3-max",
  "SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS": "120000",
  "SCRIPT_ADAPTER_TEXT_REWRITER_MAX_TOKENS": "6000"
}
```

读取优先级建议：

1. `scriptAdapter.models.<role>`
2. `contentModelProfile.active.roles.<role>.model`
3. 当前聊天 provider 的 `OCT_MODEL`
4. Summarizer 兜底

注意：第 3、4 项只能作为兼容兜底，不应作为 MVP 推荐路径。

当前实现中的 role key：

```text
script_adapter.businessAnalysis
script_adapter.textRewriter
script_adapter.voiceClassifier
script_adapter.performanceDesigner
script_adapter.qualityReviewer
```

## UI 交互细节

### 填 Key 的位置

在“内容制作模型”卡片里填：

```text
API Key
[ sk-xxxxxxxxxxxxxxxxxxxxxxxx ] [测试连接]
```

保存时同时写入：

1. `scriptAdapter.apiKey`，用于工作台专用配置。
2. `DASHSCOPE_API_KEY`，用于兼容已有百炼 / DashScope 读取路径。

如果项目安全策略要求不明文落盘，则 UI 仍显示在这里，但实际写入现有 vault 或用户配置安全区。

### 测试连接

测试连接只检查三件事：

1. Key 是否存在。
2. `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` 是否可用。
3. 默认模型 `qwen3.5-flash` 或 `qwen3.5-plus` 是否能完成极短 JSON 输出。

测试 prompt：

```text
只输出 JSON：{"ok":true}
```

预期解析结果：

```json
{"ok": true}
```

### 模型选择入口

普通模式：

```text
模型方案
[阿里百炼内容制作 MVP ▼]
```

高级模式：

```text
Agent 模型映射

业务分析       [qwen3.5-plus ▼]
文本改写       [qwen3.5-plus ▼]
角色音分类     [qwen3.5-flash ▼]
演播设计       [qwen3.5-flash ▼]
质检审校       [qwen3.5-plus ▼]
兜底复核       [qwen3-max ▼]
```

## MVP 验收标准

1. 用户可以在设置面板找到“内容制作模型”卡片。
2. 用户只填阿里百炼 Key 即可启动真实内容制作。
3. 内容制作 Agent 不再默认继承聊天模型。
4. 文本改写、角色分类、演播设计、质检审校分别读取自己的模型配置。
5. DeepSeek / MiniMax 不出现在 MVP 内容制作模型白名单中。
6. 测试连接能验证百炼 Key 和默认 JSON 输出能力。
7. 失败时 UI 显示“内容制作模型配置不可用”，而不是泛化成聊天 provider 失败。
8. 文本改写 Agent 不生成 `rewriteNote` / 改写说明；工作台若需要提示，使用本地固定说明；评审页与导出文件不包含逐段改写说明。

## 后续扩展

MVP 跑通后再扩展：

1. 新增 Kimi 官方账号作为文本改写可选供应商。
2. 新增火山方舟账号作为备选供应商。
3. 加入“每个 Agent 可选择不同供应商/模型”的高级混用模式。
4. 为 DeepSeek / MiniMax 加入 reasoning 隔离与产物清洗后，再作为实验模型开放。
