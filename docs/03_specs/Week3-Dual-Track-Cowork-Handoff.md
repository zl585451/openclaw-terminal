# Week 3 — OCT 双线推进 Prompt(Cursor / Claude 交接包)

> 状态:Week 2 已完成(Track A 视觉收尾、Track B summarizer 接 toolLoop、Track C Gateway 状态机骨架),书库 Phase 1 已完成(内嵌源码、userData 数据根、search_knowledge 工具)
> 工期:**48 小时极限挑战(今晚 + 明天)**
> 双线:Track 1 内容创作 1-Agent 真实化(~5h)+ Track 2 书库 Phase 2 上传/列表/章节接口(~6h)
> 适用:Cursor / Claude Code 各开一边并行,互不依赖
> 风险等级:**中高(时间紧 + 真实 LLM 调用 + 新数据 schema,任一环节卡 1 小时就要执行降级方案)**

---

## 〇、48 小时定调

### 时间安排建议

| 时段 | Track 1(内容创作) | Track 2(书库) |
|------|-------|-----|
| 今晚 0-3h | 1.1 + 1.2 prompt + LLM 调用 | 2.1 + 2.2 SQLite + upload |
| 今晚 3-5h | 1.3 接进 agentRunner | 2.3 + 2.4 list + chapters |
| 明天上午 | 1.4 + 1.5 配置 + 跑通 | 2.5 章节切分 |
| 明天下午 | 1.6 文档 + 演示 | 2.6 文档 + 演示 |

### 不动的事(留 Week 4+)

1. 持久化 executionSheet(刷新就丢,Week 4 做)
2. 真实文件解析(parser.source_document)— 只跑 1 个 Agent,输入直接用粘贴/fixture,不接文件解析
3. 书库与内容创作工作台 UI 打通(从书库选书进入工作台)— Week 4
4. 剩余 4 个内容创作 Agent(角色音/演播/质检/打包)真实化 — Week 5
5. 书库 Phase 2 前端 UI(本期纯接口,curl / Postman 验证)
6. 单 Agent 局部重跑、断点续传 — Week 4/5

### 保护清单(沿用 Week 1/2 + 新增 1 项)

1. 沿用 Week 2 全部禁区(`src/ui/chat/`、useTypewriter、streamRouter、turnFSM、main.ts/preload.ts 现有逻辑、ai.js、runtime/)
2. **新增**:`oct-gateway/runtime/toolResultSummarizer.js`(Week 2 刚做完,默认关,本周不动)
3. **新增**:`resources/ai_library/audio_knowledge_base.py` 现有的 `Config` 类、`/api/search`、`/api/qa/search` 路由不要改语义,只允许追加新路由 / 新表

---

# Track 1 — 内容创作:文本改编师真实化

## 1 总目标

把 `oct-gateway/script_adapter/mockArtifactFactory.js` 里 `adapter.audiobook_text_rewriter@1.0` 这一个分支替换为**真实 LLM 调用**。其他 4 个 Agent 仍走 mock。

工作台演示流程:
1. 用户在工作台粘贴一段 200-500 字小说原文(新增"测试输入框",Week 4 改成从书库选)
2. 点"确认开工"
3. 文本改编师真跑 LLM,产出真实 AdaptedScriptPayload(segments、speaker、rewriteNote 都是 LLM 写的)
4. 后续 4 个 Agent 仍 mock,但消费上一步的真实产物(比如角色音统筹的 mock 数据用真实 segments 里的 speaker 列表)

## 1 代码范围

预计文件:

- 新建:`oct-gateway/script_adapter/agents/textRewriterAgent.js`(真实 LLM 调用 + JSON 解析)
- 新建:`oct-gateway/services/llmClient.js`(把 summarizer.js 里 callChatCompletion 提取成公共模块)
- 修改:`oct-gateway/services/summarizer.js`(改用 llmClient,不再自带 fetch)
- 修改:`oct-gateway/script_adapter/mockArtifactFactory.js`(变成 dispatcher,根据 agent + feature flag 决定真实还是 mock)
- 修改:`oct-gateway/script_adapter/agentRunner.js`(创建 artifact 改为 await,传入 sourceText)
- 修改:`oct-gateway/script_adapter/mock_execution.js`(start 时接受 sourceText,传给 agentRunner)
- 修改:`electron/main.ts`(`script-adapter-run-start` IPC handler 接受新字段 `sourceText`,只追加不动现有)
- 修改:`electron/preload.ts`(`startScriptAdapterRun` 接受 `sourceText`)
- 修改:`src/modules/script-adapter/services/gatewayExecution.ts`(payload 加 sourceText)
- 修改:`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`("确认开工"前增加测试原文输入框,极简)
- 修改:`oct-gateway/config.js`(新增 `SCRIPT_ADAPTER_REAL_AGENTS` 配置)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-text-rewriter-real-llm.md`

---

## 1.1 — 提取 llmClient.js(公共 LLM 调用模块)

### 文件

新建 `oct-gateway/services/llmClient.js`

### 实现要求

把 `summarizer.js` 第 183-220 行的 `callChatCompletion` 提取出来,成为通用模块。签名扩展支持非流式 chat completion 调用,任何调用方都能用。

```javascript
'use strict';

const config = require('../config');

class LlmClientTimeoutError extends Error {
  constructor(message) { super(message); this.name = 'LlmClientTimeoutError'; }
}

class LlmClientHttpError extends Error {
  constructor(status, body) {
    super(`LLM_HTTP_${status}: ${String(body || '').slice(0, 400)}`);
    this.name = 'LlmClientHttpError';
    this.status = status;
  }
}

/**
 * 非流式 chat completion 调用,OpenAI 兼容协议。
 * @param {object} options
 * @param {{ baseUrl: string, apiKey: string, model: string }} options.provider
 * @param {Array<{role: string, content: string}>} options.messages
 * @param {number} [options.maxTokens=1024]
 * @param {number} [options.temperature=0.3]
 * @param {boolean} [options.responseJson=false]   true 时尝试要求 JSON 格式
 * @param {number} [options.timeoutMs=30000]
 * @returns {Promise<{ content: string, usage?: object, model: string, latencyMs: number }>}
 */
async function chatCompletion({ provider, messages, maxTokens = 1024, temperature = 0.3, responseJson = false, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const url = `${String(provider.baseUrl).replace(/\/$/, '')}/chat/completions`;
  const headers = buildHeaders(provider.baseUrl, provider.apiKey);

  const body = {
    model: provider.model,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseJson) body.response_format = { type: 'json_object' };

  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LlmClientHttpError(response.status, errBody);
    }
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
    return {
      content,
      usage: data?.usage,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new LlmClientTimeoutError(`LLM 请求超时:${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(baseUrl, apiKey) {
  const target = String(baseUrl || '').toLowerCase();
  if (target.includes('generativelanguage.googleapis.com') || target.includes('aiplatform.googleapis.com')) {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

/**
 * 解析当前 provider 配置,与 summarizer.js 的 resolveSummarizerProvider 保持一致行为。
 * 优先使用 SCRIPT_ADAPTER_* / 然后 SUMMARIZER_* / 最后 当前 Gateway provider。
 */
function resolveProviderFor(purpose = 'general') {
  const prefixes = purpose === 'script_adapter' ? ['SCRIPT_ADAPTER', 'SUMMARIZER'] : ['SUMMARIZER'];
  for (const prefix of prefixes) {
    const baseUrl = String(config.getEnvOrConfig?.(`${prefix}_BASE_URL`) || '').trim();
    const apiKey = String(config.getEnvOrConfig?.(`${prefix}_API_KEY`) || '').trim();
    const model = String(config.getEnvOrConfig?.(`${prefix}_MODEL`) || '').trim();
    if (baseUrl && apiKey && model) {
      return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
    }
  }
  const providerConfig = config.getProviderConfig?.() || {};
  const baseUrl = String(providerConfig.baseUrl || '').trim().replace(/\/$/, '');
  const apiKey = String(providerConfig.apiKey || '').trim();
  const model = String(providerConfig.model || config.DASHSCOPE_MODEL || '').trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error('LLM_NOT_CONFIGURED: 当前 provider 不完整,请先在设置面板配置 baseUrl/apiKey/model');
  }
  return { baseUrl, apiKey, model };
}

module.exports = { chatCompletion, resolveProviderFor, LlmClientTimeoutError, LlmClientHttpError };
```

### 修改 summarizer.js

把 `summarizer.js` 第 183-220 行的 `callChatCompletion` 删除,改为:

```javascript
const { chatCompletion } = require('./llmClient');

// 在 summarize() 内原 callChatCompletion 调用处改为:
const { content } = await chatCompletion({
  provider,
  messages,
  maxTokens: estimateMaxTokens(targetLength),
  temperature: 0.2,
  timeoutMs: positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS),
});
if (!content) throw new SummarizerEmptyError();
return content;
```

`buildHeaders` 也可以删掉(已在 llmClient.js)。

### Done criteria

1. `node oct-gateway/test/summarizer.test.js`(默认离线测试)继续通过
2. `RUN_LIVE_TESTS=1 node oct-gateway/test/summarizer.test.js` 也跑通(确认 summarizer 行为不变)

### commit

```
refactor(gateway/services): extract llmClient from summarizer
```

---

## 1.2 — 写文本改编师 Agent

### 文件

新建 `oct-gateway/script_adapter/agents/textRewriterAgent.js`

### 关键设计

1. **prompt 模板**简化版,基于 `docs/03_specs/内容创作工作台/多人演播有声小说改编规则.md` 的核心规则,**不要全文塞进去**(太长了)。提炼 5-7 条核心规则即可
2. **要求 LLM 返回 JSON**,字段对齐 `AdaptedScriptPayload`
3. JSON 解析失败时**不要崩**,记日志 + 用一个最小化兜底产物(包含 1 个 segment 说"改编失败,请重试")
4. 模型推荐:`qwen-max-latest` / `deepseek-v4` / `MiniMax-M2.7`,通过 `SCRIPT_ADAPTER_MODEL` 配置

### 实现要求

```javascript
'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书台本改编师。把用户给的小说原文改写成更适合多人演播的台本片段。

核心规则:
1. 保留剧情、人物关系、关键事件,不改变信息顺序
2. 长句拆短,加自然的停顿;旁白与对白分开
3. 内心独白(inner_monologue)单独标记,不混在对白里
4. 对白要标 speaker(角色名),无法判断 speaker 时归 narration
5. 不提前解释悬疑,不补充原文没有的信息,不写营销语
6. 每段 rewriteNote 一句话说明为什么这么改

输出严格 JSON,不要任何额外解释。结构:
{
  "chapterTitle": "string,从原文推断或者写'未命名片段'",
  "totalCharCount": 数字,所有 segments 的 text 字数之和,
  "segments": [
    {
      "segmentId": "seg-001 / seg-002 ...",
      "type": "narration | dialogue | inner_monologue",
      "speaker": "string,dialogue 必填,inner_monologue 选填,narration 不填",
      "text": "改编后的台本文本",
      "rewriteNote": "一句话说明改写理由"
    }
  ]
}`;

/**
 * 真实文本改编 Agent。
 * @param {{ sourceText: string, agent: object }} ctx
 * @param {object} [options]
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runTextRewriterAgent(ctx, options = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('TEXT_REWRITER_NO_INPUT: 没有提供原文');
  if (sourceText.length > 4000) throw new Error(`TEXT_REWRITER_TOO_LONG: ${sourceText.length} > 4000,请先切分`);

  const provider = resolveProviderFor('script_adapter');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `请把下列原文改编成多人演播台本。原文:\n\n${sourceText}` },
  ];

  const result = await chatCompletion({
    provider,
    messages,
    maxTokens: 2000,
    temperature: 0.6,
    responseJson: true,
    timeoutMs: 45000,
  });

  const payload = parseTextRewriterOutput(result.content);
  return { payload, latencyMs: result.latencyMs, model: result.model };
}

function parseTextRewriterOutput(raw) {
  if (!raw) throw new Error('TEXT_REWRITER_EMPTY_OUTPUT');
  // 容忍 LLM 在 JSON 前后加 ```json 围栏
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`TEXT_REWRITER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }
  if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }
  // 字数兜底
  if (typeof parsed.totalCharCount !== 'number') {
    parsed.totalCharCount = parsed.segments.reduce((sum, s) => sum + (String(s.text || '').length), 0);
  }
  return parsed;
}

module.exports = { runTextRewriterAgent };
```

### Done criteria

1. 新建 `oct-gateway/test/textRewriterAgent.test.js`
2. 默认 SKIP live(同 summarizer.test.js 模式),设 `RUN_LIVE_TESTS=1` 才跑
3. 测试至少 3 项:
   - 输入空字符串 → throw `TEXT_REWRITER_NO_INPUT`
   - 输入 5000 字 → throw `TEXT_REWRITER_TOO_LONG`
   - (live)输入 250 字示例小说原文 → 返回 segments.length >= 2,至少 1 个 dialogue,JSON 结构合法

### commit

```
feat(gateway/script_adapter): real text rewriter agent with structured JSON output
```

---

## 1.3 — mockArtifactFactory 改 dispatcher + agentRunner 接 sourceText

### 改 mockArtifactFactory.js

把 `createArtifactForAgent(agentId, displayName)` 改成 async,内部按 agent + feature flag 选择真实/mock:

```javascript
'use strict';

const { runTextRewriterAgent } = require('./agents/textRewriterAgent');
const config = require('../config');

const REAL_AGENTS_FLAG = 'SCRIPT_ADAPTER_REAL_AGENTS';

function isRealAgentEnabled(agentId) {
  const flag = String(config.getEnvOrConfig?.(REAL_AGENTS_FLAG) || '').trim().toLowerCase();
  if (!flag || flag === 'off' || flag === 'false' || flag === '0') return false;
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'all') return true;
  // 支持 "agent1,agent2" 形式
  return flag.split(',').map((s) => s.trim()).includes(agentId);
}

async function createArtifactForAgent(agentId, displayName, ctx = {}) {
  if (agentId === 'adapter.audiobook_text_rewriter@1.0' && isRealAgentEnabled(agentId)) {
    try {
      const { payload, latencyMs, model } = await runTextRewriterAgent(ctx);
      return envelope('adapted_script', agentId, displayName, '多人演播样章台本',
        `已用 ${model} 改编完成,耗时 ${latencyMs}ms`,
        payload,
        { segments: payload.segments.length, chars: payload.totalCharCount, latencyMs }
      );
    } catch (error) {
      // 真实 Agent 失败 → 返回带错误标记的最小产物,不抛(不让整条 pipeline 中断)
      return envelope('adapted_script', agentId, displayName, '改编失败',
        `真实 LLM 调用失败,已回退占位:${error.message?.slice(0, 80)}`,
        { chapterTitle: '改编失败', totalCharCount: 0, segments: [{
          segmentId: 'seg-001', type: 'narration', text: '[改编失败,请检查模型配置后重试]',
          rewriteNote: error.message?.slice(0, 200) || 'unknown',
        }] },
        { error: 1 }
      );
    }
  }

  // 其余分支沿用原 mock 实现
  return createMockArtifact(agentId, displayName);
}

// 把原来的 if/else 链(adapter / classifier / designer / reviewer / packager)
// 整体放进 createMockArtifact() 函数里,签名不变。
function createMockArtifact(agentId, displayName) { /* ... 原内容 */ }

function envelope(...) { /* ... 原内容 */ }

module.exports = { createArtifactForAgent };
```

### 改 agentRunner.js

第 43 行:

```javascript
// 改前:
const artifact = createArtifactForAgent(agent.agentId, agent.displayName);

// 改后:
const artifact = await createArtifactForAgent(agent.agentId, agent.displayName, {
  sourceText: ctx.sourceText,
  agent,
});
```

`runMockAgentPipeline` 函数签名加 `ctx` 参数:

```javascript
async function runMockAgentPipeline({ sheet, emit, signal, onSheetUpdate, ctx = {} }) {
```

### 改 mock_execution.js

`startMockScriptAdapterRun(params, connection, logger)` 内 ctx 透传:

```javascript
const ctx = { sourceText: String(params?.sourceText || '') };
// ... 在 runMockAgentPipeline 调用时传:
runMockAgentPipeline({ sheet, emit, signal, onSheetUpdate, ctx })
```

### Done criteria

1. `SCRIPT_ADAPTER_REAL_AGENTS` 不设(默认关)→ 行为与 Week 2 完全一致,跑 mock
2. `SCRIPT_ADAPTER_REAL_AGENTS=adapter.audiobook_text_rewriter@1.0` + 提供 sourceText → 文本改编师真跑 LLM,产物是真实改编
3. `SCRIPT_ADAPTER_REAL_AGENTS=all` 但只有文本改编师真接 → 其余 4 个走 mock(因为只有 textRewriter 在 dispatcher 内有 real 分支)
4. 真实调用失败时,pipeline **不中断**,产物是带 [改编失败] 标记的占位

### commit

```
feat(gateway/script_adapter): dispatcher to switch real/mock per agent
```

---

## 1.4 — 前端接 sourceText 输入

### 修改 `electron/preload.ts`

`startScriptAdapterRun` 字段追加:

```typescript
startScriptAdapterRun: (payload: {
  taskId: string;
  taskTitle: string;
  source?: string;
  useMock?: boolean;
  sourceText?: string;   // ← 新增
}) => ipcRenderer.invoke('script-adapter-run-start', payload),
```

### 修改 `electron/main.ts`

`script-adapter-run-start` IPC handler 内 msg.params 追加:

```typescript
const msg = {
  type: 'req',
  id: requestId,
  method: 'scriptAdapter.run.start',
  params: {
    taskId,
    taskTitle: String(payload?.taskTitle || '多人演播有声书样章'),
    source: String(payload?.source || 'content-workbench'),
    useMock: payload?.useMock !== false,
    sourceText: String(payload?.sourceText || ''),   // ← 新增
  },
};
```

### 修改 `gatewayExecution.ts`

```typescript
export interface StartGatewayExecutionPayload {
  taskId: string;
  taskTitle: string;
  source?: string;
  sourceText?: string;   // ← 新增
}
```

### 修改 `WorkbenchView.tsx`

在 `开工确认书` 卡片内,确认开工按钮**之前**插入一个 textarea:

```tsx
const [sourceText, setSourceText] = useState('');

// 在 workOrderHeroActions 之前,加一个测试输入区:
<div className={styles.testInputArea}>
  <label>测试原文(粘贴 200-500 字小说原文):</label>
  <textarea
    value={sourceText}
    onChange={(e) => setSourceText(e.target.value)}
    placeholder="先粘贴一段小说原文,文本改编师会真实改编..."
    rows={6}
    maxLength={4000}
  />
  <small>{sourceText.length} / 4000 字</small>
</div>
```

`startExecution` 内传入:

```typescript
const result = await startGatewayExecution({
  taskId,
  taskTitle,
  source: 'content-workbench',
  sourceText,   // ← 新增
});
```

CSS 加一段简单样式:

```css
.testInputArea {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: rgba(125, 132, 142, 0.06);
  border: 1px dashed rgba(125, 132, 142, 0.30);
  border-radius: 8px;
  margin-bottom: 12px;
}

.testInputArea label {
  font-size: 12px;
  color: #4b5563;
  font-weight: 600;
}

.testInputArea textarea {
  width: 100%;
  border: 1px solid rgba(125, 132, 142, 0.32);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}

.testInputArea small {
  align-self: flex-end;
  font-size: 11px;
  color: #9ca3af;
}
```

### Done criteria

1. 工作台开工确认书页面出现 textarea,粘贴文本后字数实时显示
2. 不粘贴文本直接点确认开工,文本改编师走 mock 路径(行为同 Week 2)
3. 粘贴文本后开工,sourceText 一路传到 Gateway,Gateway 日志可见 `sourceText: <length>` 字样

### commit

```
feat(script-adapter): test input box for real text rewriter agent
```

---

## 1.5 — 配置项落地

### 文件

修改 `oct-gateway/config.js`(暴露默认值)+ 文档说明

### 配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SCRIPT_ADAPTER_REAL_AGENTS` | (关) | 哪些 agent 走真实 LLM。值:`off / all / agentId1,agentId2` |
| `SCRIPT_ADAPTER_BASE_URL` | (空,降级到 SUMMARIZER_*,再到当前 provider) | 改编 Agent 专用 baseUrl |
| `SCRIPT_ADAPTER_API_KEY` | (空,同上) | API key |
| `SCRIPT_ADAPTER_MODEL` | (空,同上) | 推荐 `qwen-max-latest` 或 `deepseek-v4` |

### Done criteria

启用方式(PowerShell):

```powershell
$env:SCRIPT_ADAPTER_REAL_AGENTS='adapter.audiobook_text_rewriter@1.0'
# 可选:指定专用模型(否则降级当前 provider)
$env:SCRIPT_ADAPTER_MODEL='qwen-max-latest'
# 重启 Gateway
```

### commit

```
chore(gateway/config): script adapter real agent feature flag
```

---

## 1.6 — 文档与 changelog

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-text-rewriter-real-llm.md`

至少包含:

1. 改动文件清单
2. 启用方式与配置项表格
3. 已知限制(只有 1 个 Agent 真接,持久化没做,刷新就丢)
4. **演示截图或日志**(给 Zilong 验收用)
5. 单次调用预估成本(qwen-max ~0.05 元,deepseek ~0.02 元)

### 更新接手指南

`docs/03_specs/内容创作工作台/00_项目接手指南.md` 第 3 节追加:

```markdown
5. `V2.19`
   文本改编师接入真实 LLM,需 `SCRIPT_ADAPTER_REAL_AGENTS=adapter.audiobook_text_rewriter@1.0` 启用。
```

第 5.1 节 `task.intake_planner / adapter.audiobook_text_rewriter` 后面追加状态:

```markdown
2. `adapter.audiobook_text_rewriter@1.0` ← **已具备真实 LLM 调用能力(Week 3)**
```

---

## 1 验收标准(Track 1)

- [ ] llmClient.js 提取完成,summarizer 切换无副作用
- [ ] textRewriterAgent.test.js 离线测试 PASS,live 测试可选
- [ ] 关闭 feature flag 时行为与 Week 2 完全一致
- [ ] 启用 feature flag + 提供 200-500 字原文 → 文本改编师真跑出 ≥2 个 segment 的真实改编台本
- [ ] LLM 调用失败时 pipeline 不中断,产物显示 [改编失败]
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
- [ ] changelog 已写

---

# Track 2 — 书库 Phase 2

## 2 总目标

在 `resources/ai_library/api_server.py` 新增 `/api/library/*` 系列接口,把 AI.library 从纯"知识检索引擎"扩展为"可上传 / 列表 / 章节切分"的小说书库。**Phase 2 只做后端接口和 SQLite schema,前端 UI 留 Phase 3**。

---

## 2.1 — SQLite schema 与 db helpers

### 文件

新建 `resources/ai_library/library_db.py`

### 实现要求

```python
"""书库 Phase 2 — SQLite 数据访问层。

数据文件: ${LIBRARY_DATA_ROOT}/library.sqlite3
"""
import sqlite3
import os
import json
from contextlib import contextmanager
from typing import Optional

from audio_knowledge_base import Config


SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT NOT NULL,           -- 'novel' / 'script' / 'article'
  source_format TEXT NOT NULL,         -- 'txt' / 'docx' / 'epub'
  source_path TEXT NOT NULL,           -- 实际文件相对 LIBRARY_DATA_ROOT 的路径
  total_chars INTEGER DEFAULT 0,
  chapter_count INTEGER DEFAULT 0,
  uploaded_at TEXT NOT NULL,
  metadata TEXT                        -- JSON 字符串,自由扩展
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT,
  start_char INTEGER,
  end_char INTEGER,
  char_count INTEGER,
  preview TEXT,                        -- 前 200 字预览
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
"""


def get_db_path() -> str:
    return os.path.join(Config.LIBRARY_DATA_ROOT, 'library.sqlite3')


@contextmanager
def get_conn():
    os.makedirs(Config.LIBRARY_DATA_ROOT, exist_ok=True)
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def ensure_schema():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def insert_book(book_id: str, title: str, author: Optional[str], source_type: str,
                source_format: str, source_path: str, total_chars: int,
                chapter_count: int, uploaded_at: str, metadata: dict) -> None:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO books(id, title, author, source_type, source_format, source_path,
                              total_chars, chapter_count, uploaded_at, metadata)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (book_id, title, author, source_type, source_format, source_path,
              total_chars, chapter_count, uploaded_at, json.dumps(metadata or {}, ensure_ascii=False)))


def insert_chapters(chapters: list[dict]) -> None:
    if not chapters:
        return
    with get_conn() as conn:
        conn.executemany("""
            INSERT INTO chapters(id, book_id, chapter_index, title, start_char, end_char, char_count, preview)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        """, [(c['id'], c['book_id'], c['chapter_index'], c.get('title'),
               c.get('start_char'), c.get('end_char'), c.get('char_count'), c.get('preview'))
              for c in chapters])


def list_books(limit: int = 50, offset: int = 0) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM books ORDER BY uploaded_at DESC LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        return [dict(row) for row in rows]


def get_book(book_id: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        return dict(row) if row else None


def list_chapters(book_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_index ASC
        """, (book_id,)).fetchall()
        return [dict(row) for row in rows]


def delete_book(book_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        return cur.rowcount > 0
```

### Done criteria

启动 Python 跑一次 `library_db.ensure_schema()`,`%APPDATA%/.../ai_library_data/library.sqlite3` 文件出现,有 books / chapters 两张表。

### commit

```
feat(ai_library): library_db sqlite schema for Phase 2
```

---

## 2.2 — `/api/library/upload` 上传接口

### 文件

修改 `resources/ai_library/api_server.py`

### 实现要求

```python
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import library_db  # 上面新建的

# 启动时确保 schema:
@app.on_event("startup")
async def init_library_db():
    library_db.ensure_schema()


@app.post("/api/library/upload", tags=["书库"])
async def library_upload(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: str = Form(default=""),
    source_type: str = Form(default="novel"),
):
    """上传一本书,自动切章并入库。"""
    book_id = uuid.uuid4().hex[:12]
    ext = Path(file.filename).suffix.lower().lstrip('.') or 'txt'
    if ext not in {'txt', 'md'}:
        raise HTTPException(400, f"暂不支持 .{ext},Phase 2 只支持 .txt / .md")

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = raw_bytes.decode('gbk')
        except UnicodeDecodeError:
            raise HTTPException(400, "文件编码无法识别,请用 UTF-8 / GBK")

    # 保存原文到 LIBRARY_DATA_ROOT/sources/<book_id>.<ext>
    sources_dir = os.path.join(Config.LIBRARY_DATA_ROOT, 'sources')
    os.makedirs(sources_dir, exist_ok=True)
    source_path = os.path.join('sources', f'{book_id}.{ext}')
    full_source_path = os.path.join(Config.LIBRARY_DATA_ROOT, source_path)
    with open(full_source_path, 'w', encoding='utf-8') as f:
        f.write(text)

    # 章节切分(见 2.5)
    from chapter_splitter import split_into_chapters
    chapters = split_into_chapters(text, book_id)

    # 入库
    library_db.insert_book(
        book_id=book_id,
        title=title,
        author=author or None,
        source_type=source_type,
        source_format=ext,
        source_path=source_path,
        total_chars=len(text),
        chapter_count=len(chapters),
        uploaded_at=datetime.utcnow().isoformat() + 'Z',
        metadata={},
    )
    library_db.insert_chapters(chapters)

    return {
        'success': True,
        'book_id': book_id,
        'title': title,
        'total_chars': len(text),
        'chapter_count': len(chapters),
    }
```

### Done criteria

```bash
curl -F "file=@some_novel.txt" -F "title=测试小说" -F "author=测试作者" \
  http://127.0.0.1:8001/api/library/upload
# 返回 { success: true, book_id: "xxx", chapter_count: N }
# library.sqlite3 books 表多 1 行,chapters 表多 N 行
# LIBRARY_DATA_ROOT/sources/<book_id>.txt 文件存在
```

### commit

```
feat(ai_library): /api/library/upload endpoint with chapter splitting
```

---

## 2.3 — `/api/library/list` + `/api/library/{id}`

### 实现要求

```python
@app.get("/api/library/list", tags=["书库"])
def library_list(limit: int = 50, offset: int = 0):
    books = library_db.list_books(limit=limit, offset=offset)
    return {'success': True, 'books': books, 'total': len(books)}


@app.get("/api/library/{book_id}", tags=["书库"])
def library_get(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(404, f'Book {book_id} not found')
    return {'success': True, 'book': book}


@app.delete("/api/library/{book_id}", tags=["书库"])
def library_delete(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(404, f'Book {book_id} not found')
    # 删源文件
    full_path = os.path.join(Config.LIBRARY_DATA_ROOT, book['source_path'])
    if os.path.exists(full_path):
        os.remove(full_path)
    library_db.delete_book(book_id)
    return {'success': True, 'deleted': book_id}
```

### Done criteria

```bash
curl http://127.0.0.1:8001/api/library/list      # 列表
curl http://127.0.0.1:8001/api/library/<book_id> # 详情
curl -X DELETE http://127.0.0.1:8001/api/library/<book_id>  # 删除
```

### commit

```
feat(ai_library): /api/library/list and /api/library/{id} endpoints
```

---

## 2.4 — `/api/library/{id}/chapters` 章节接口

### 实现要求

```python
@app.get("/api/library/{book_id}/chapters", tags=["书库"])
def library_chapters(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(404, f'Book {book_id} not found')
    chapters = library_db.list_chapters(book_id)
    return {'success': True, 'book_id': book_id, 'chapters': chapters}


@app.get("/api/library/{book_id}/chapter/{chapter_index}", tags=["书库"])
def library_chapter_text(book_id: str, chapter_index: int):
    """返回指定章节的完整文本(从源文件按 start_char/end_char 切片)。"""
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(404, f'Book {book_id} not found')
    chapters = library_db.list_chapters(book_id)
    target = next((c for c in chapters if c['chapter_index'] == chapter_index), None)
    if not target:
        raise HTTPException(404, f'Chapter {chapter_index} not found in book {book_id}')
    full_path = os.path.join(Config.LIBRARY_DATA_ROOT, book['source_path'])
    if not os.path.exists(full_path):
        raise HTTPException(500, f'Source file missing: {book["source_path"]}')
    with open(full_path, 'r', encoding='utf-8') as f:
        text = f.read()
    chapter_text = text[target['start_char']:target['end_char']]
    return {'success': True, 'book_id': book_id, 'chapter': target, 'text': chapter_text}
```

### Done criteria

```bash
curl http://127.0.0.1:8001/api/library/<book_id>/chapters
# 返回 { chapters: [{ id, chapter_index, title, char_count, preview, ... }] }

curl http://127.0.0.1:8001/api/library/<book_id>/chapter/0
# 返回 { chapter: {...}, text: "..." } 单章节完整文本
```

### commit

```
feat(ai_library): chapter list and single-chapter text endpoints
```

---

## 2.5 — 章节切分模块

### 文件

新建 `resources/ai_library/chapter_splitter.py`

### 实现要求

参照 `oct-gateway/services/chunker.js` 的 `chunkByChapters` 逻辑,Python 版:

```python
"""章节切分 — 检测 '第 X 章' / '第 X 回' / '\n# 标题' 等。"""
import re
import uuid
from typing import List, Dict


CHAPTER_PATTERNS = [
    re.compile(r'(?:^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)'),
    re.compile(r'(?:^|\n)\s*(Chapter\s+\d+[^\n]*)', re.IGNORECASE),
    re.compile(r'(?:^|\n)\s*(#{1,3}\s+[^\n]+)'),  # markdown 标题
]


def split_into_chapters(text: str, book_id: str) -> List[Dict]:
    """切分章节,返回 chapters 列表(供 library_db.insert_chapters)。

    没找到任何章节标记时,把整本书当 1 章,title="全文"。
    """
    if not text:
        return []

    # 找所有章节起点
    matches = []
    for pattern in CHAPTER_PATTERNS:
        for m in pattern.finditer(text):
            title = m.group(1).strip()
            start = m.start(1)
            matches.append((start, title))
        if matches:  # 找到第一种 pattern 就停,不混用
            break

    matches.sort(key=lambda x: x[0])
    # 去重(相邻 < 50 字的认为是误判)
    deduped = []
    for start, title in matches:
        if deduped and start - deduped[-1][0] < 50:
            continue
        deduped.append((start, title))

    if not deduped:
        return [{
            'id': uuid.uuid4().hex[:12],
            'book_id': book_id,
            'chapter_index': 0,
            'title': '全文',
            'start_char': 0,
            'end_char': len(text),
            'char_count': len(text),
            'preview': text[:200],
        }]

    chapters = []
    for i, (start, title) in enumerate(deduped):
        end = deduped[i + 1][0] if i + 1 < len(deduped) else len(text)
        content = text[start:end]
        chapters.append({
            'id': uuid.uuid4().hex[:12],
            'book_id': book_id,
            'chapter_index': i,
            'title': title,
            'start_char': start,
            'end_char': end,
            'char_count': len(content),
            'preview': content[:200],
        })

    return chapters
```

### Done criteria

写一个简单 `resources/ai_library/test_chapter_splitter.py`:

```python
from chapter_splitter import split_into_chapters

# 测试 1:有章节标题
text1 = "第一章 樟木箱\n内容一\n\n第二章 夜\n内容二"
result1 = split_into_chapters(text1, 'test-book')
assert len(result1) == 2
assert result1[0]['title'].startswith('第一章')

# 测试 2:无章节标题
text2 = "全是普通文字,没有章节标记"
result2 = split_into_chapters(text2, 'test-book')
assert len(result2) == 1
assert result2[0]['title'] == '全文'

print('PASS')
```

跑:`cd resources/ai_library && python test_chapter_splitter.py`

### commit

```
feat(ai_library): chinese/english/markdown chapter splitter
```

---

## 2.6 — 文档与 changelog

### 新建 changelog

`docs/05_changelog/2026-04-XX-ai-library-phase2-endpoints.md`

至少包含:

1. 新增接口表格(method + path + 用途)
2. SQLite schema 字段说明
3. 章节切分支持的 3 种模式(中文/英文/markdown)
4. **测试用 curl 命令清单**(Zilong 验收用)
5. 已知限制(只支持 .txt / .md;前端 UI 留 Phase 3;不接 Gateway,不接内容创作工作台;无鉴权)
6. 未来扩展点(.docx 解析、.epub 解析、与内容创作工作台打通)

### 更新 AI_LIBRARY_OCT.md

`docs/02_architecture/AI_LIBRARY_OCT.md` 在"内嵌源码与数据目录(书库 Phase 1)"后追加章节:

```markdown
---

## 书库 Phase 2 — 上传 / 列表 / 章节接口

| Method | Path | 用途 |
|--------|------|------|
| POST | /api/library/upload | 上传 .txt/.md 文件,自动切章入库 |
| GET | /api/library/list | 列表书库藏书 |
| GET | /api/library/{id} | 单本书元信息 |
| DELETE | /api/library/{id} | 删除一本书 |
| GET | /api/library/{id}/chapters | 列出某本书的所有章节 |
| GET | /api/library/{id}/chapter/{index} | 取指定章节完整文本 |

数据存储:
- `${LIBRARY_DATA_ROOT}/library.sqlite3`(books / chapters 两表)
- `${LIBRARY_DATA_ROOT}/sources/<book_id>.<ext>`(原文文件)

第三方调用方(Gateway / 内容创作工作台)接入计划留 Phase 3。
```

---

## 2 验收标准(Track 2)

- [ ] `library.sqlite3` 文件存在,books / chapters schema 正确
- [ ] curl 上传一份测试 .txt(选个 1-2 万字、有"第 X 章"标题的小说),返回 chapter_count 与实际章节数一致
- [ ] curl `/api/library/list` 看到上传的书
- [ ] curl `/api/library/{id}/chapters` 看到所有章节,preview 字段非空
- [ ] curl `/api/library/{id}/chapter/0` 取到第一章完整正文
- [ ] curl 删除接口正常,源文件被一起删
- [ ] `python test_chapter_splitter.py` PASS
- [ ] 现有 `/api/search` / `/api/qa/search` 行为不变
- [ ] AI.library 重启后,数据持久(沿用 SQLite)
- [ ] changelog 已写

---

# 整合验收

## Week 3 完成的标志

**Track 1 内容创作**:
- 工作台上粘贴一段小说原文 → 点开工 → 文本改编师**真跑**LLM,产出 ≥2 个 segment 的真实改编台本
- 后续 4 个 Agent 仍 mock,但用户能看到完整的"真实头 + mock 尾"流程
- 关闭 feature flag 行为完全回退

**Track 2 书库**:
- AI.library 跑起来后,curl 5 个新接口都通
- 上传一本 1-2 万字小说,章节切分正确,每章可单独取出文本
- 数据持久(重启 AI.library 后还在)

## 演示路径(给 Zilong 验收 5 分钟跑通)

```powershell
# Step 0: 启动 Gateway / Electron(略)

# Step 1: 验证 Track 2(书库)
# 找一本测试小说 e.g. test_novel.txt(1-2 万字,带"第 X 章")
curl -F "file=@test_novel.txt" -F "title=长夜未瞑测试本" -F "author=测试" `
  http://127.0.0.1:8001/api/library/upload
# 记下返回的 book_id

curl http://127.0.0.1:8001/api/library/list
curl http://127.0.0.1:8001/api/library/<book_id>/chapters
curl http://127.0.0.1:8001/api/library/<book_id>/chapter/0

# Step 2: 验证 Track 1(内容创作)
$env:SCRIPT_ADAPTER_REAL_AGENTS='adapter.audiobook_text_rewriter@1.0'
$env:SCRIPT_ADAPTER_MODEL='qwen-max-latest'   # 或 deepseek-v4
# 重启 Gateway

# 工作台 → 粘贴一段从 Step 1 取出来的章节文本(200-500 字)→ 点确认开工
# 看到文本改编师真跑 LLM,产物是真实改编台本
```

---

# 给 Cursor / Claude 的极简协作约定

## 时间紧的 4 条规则

1. **Track 1 和 Track 2 完全独立**,可以两台 Cursor / 一台 Cursor + 一台 Claude 并行
2. **每个子任务做完立刻 commit**,不要攒
3. **遇到不确定立刻停下问 Zilong**,不要自己揣测
4. **降级方案优先**:
   - Track 1 prompt 调不出好结果 → 用最简化 prompt 跑通流程,质量 Week 4 优化
   - Track 2 章节切分误判太多 → 暂时只支持"第 X 章"模式,markdown / Chapter 留下次
   - Track 1 + Track 2 任何一个超 8 小时还没完成 → 该任务降级到"接口跑通就行,不追求完美"

## 卡壳速查

1. **`config.getEnvOrConfig` / `config.getProviderConfig` 不存在** → 看 `oct-gateway/services/summarizer.js` Week 1 是怎么用的,沿用同样
2. **`response_format: { type: 'json_object' }` 部分模型不支持** → 删掉这个字段,改用 prompt 强制要求 JSON,parse 时容忍 ```json 围栏
3. **AI.library 启动报 `library_db` 找不到** → `sys.path` 加 `resources/ai_library/`,或者把 library_db 放进 audio_knowledge_base.py 同目录(已经是同目录了)
4. **测试小说哪里来** → 项目里 `docs/06_features/` 或网上随便找一段公版小说(《红楼梦》开头 1 万字),纯文本即可
5. **任何修改 toolLoop / ai.js / runtime/** → **停下来问 Zilong**

## 完成后回报清单

- [ ] Track 1 commit 列表
- [ ] Track 1 真实 LLM 调用截图(showing 真实改编 segments)
- [ ] Track 2 commit 列表
- [ ] Track 2 curl 5 个接口的输出截图
- [ ] 任何卡壳点和决策需求

---

## 相关文档

- Week 1 计划:`docs/03_specs/Week1-Dual-Track-Cowork-Handoff.md`
- Week 2 计划(已归档):`docs/_archive/process_handoffs/cowork-week2/Week2-Dual-Track-Cowork-Handoff.md`
- 内容创作主线:`docs/03_specs/内容创作工作台/`
- 书库架构:`docs/02_architecture/AI_LIBRARY_OCT.md`
- summarizer 服务(Week 1):`docs/02_architecture/summarizer-service.md`
