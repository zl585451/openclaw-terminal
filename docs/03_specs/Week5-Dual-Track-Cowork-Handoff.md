# Week 5 — OCT 双线收口 Prompt(Cursor / Claude 交接包)

> 状态:Week 4 已完成 — 书库×工作台打通(LibrarySelector + 4 个 IPC)、角色音统筹真实化
> 工期:**1.5 - 2 天**
> 核心定调:**让 5 个 Agent 全真,产物从"能看"升级到"能用"**
> 双线:Track 1 剩余 3 个 Agent 真实化 + Track 2 产物展示页升级
> 风险等级:中(基础设施稳定,主要工作是 prompt 设计 + UI 视觉)

---

## 〇、Week 5 总目标

Zilong 一句话验收:**"挑一本书 → 选一章 → 一键开工 → 几分钟后看到一份能直接给制作团队用的多人演播交付包"**。

具体:

1. 演播设计师、质检审校、交付打包员三个 Agent 全部接真实 LLM(打包员可纯 JS 拼接,不必 LLM)
2. 产物展示页升级:点开任一 Agent 卡片能看到结构化的真实产物,而不是一段 summary
3. 完成时新增"交付预览"区,把 5 个产物拼成一份可阅读 / 可复制的交付物

---

## 〇.5、Zilong 验收时只做 3 件事

1. **Cursor 完成 Track 1 的 3 个 Agent 后停下**:Zilong 在主对话设置好 `SCRIPT_ADAPTER_REAL_AGENTS=all`(由 Cursor 给出**一行复制粘贴的设置面板路径或 .env 行**,Zilong 不开终端)
2. **Track 1 跑通后做一次端到端**:在工作台选书 → 选章 → 开工 → 看 5 个 Agent 全跑完 → 检查每个产物点开后是否真实
3. **Track 2 做完后做一次视觉验收**:看交付预览页是否清楚

其他 Cursor 自行完成,**不要让 Zilong 跑终端、装依赖、改配置文件**。

---

## 〇.6、Cursor 必须遵守的 4 条铁律

1. **不动 `agentRunner.js / mock_execution.js / llmClient.js / textRewriterAgent.js / voiceClassifierAgent.js`**(已锁的基础设施)
2. **打包员 Agent 不调 LLM**(纯 JS 拼接,不要画蛇添足。LLM 写 manifest 只会乱编)
3. **每个新真实 Agent 都要包 try/catch**,失败回退占位产物,**绝不让 pipeline 中断**(沿用 Week 3/4 textRewriter / voiceClassifier 的模式)
4. **不做后端持久化、不做后端流水线、不动 ai_library**(Week 6+ 再做)

---

## 〇.7、保护清单(沿用)

沿用 Week 1-4 全部禁区。**新增**:`oct-gateway/script_adapter/agents/textRewriterAgent.js`、`voiceClassifierAgent.js` 已锁,本周新增 Agent 仿照它们的模式但不修改它们。

---

# Track 1 — 剩余 3 个 Agent 真实化

## 1 总目标

把 `designer.performance_audio@1.0`、`reviewer.production_quality@1.0`、`packager.content_delivery@1.0` 三个 Agent 从 mock 切换为"真实输出"。前两个真跑 LLM,第三个纯 JS 拼接(它的工作就是收口,不需要"创造")。

## 1 文件清单

预计:

- 新建:`oct-gateway/script_adapter/agents/performanceDesignerAgent.js`
- 新建:`oct-gateway/script_adapter/agents/qualityReviewerAgent.js`
- 新建:`oct-gateway/script_adapter/agents/deliveryPackagerAgent.js`(**纯 JS,不调 LLM**)
- 修改:`oct-gateway/script_adapter/mockArtifactFactory.js`(dispatcher 加 3 个真实分支)
- 新建:`oct-gateway/test/performanceDesignerAgent.test.js`
- 新建:`oct-gateway/test/qualityReviewerAgent.test.js`
- 新建:`oct-gateway/test/deliveryPackagerAgent.test.js`
- 修改:`docs/03_specs/内容创作工作台/00_项目接手指南.md`(状态标注 3 行)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-all-agents-real.md`

---

## 1.1 — 演播设计师 Agent

### 文件

新建 `oct-gateway/script_adapter/agents/performanceDesignerAgent.js`

### 关键设计

1. 消费上游 `adapted_script` + `voice_registry` 两份产物
2. 输出 JSON 严格对齐 `PerformanceDesignPayload`(已存在于 `src/modules/script-adapter/types/execution.ts`)
3. 输入只挑前 8 个 segment 给 LLM(防 token 爆炸),全章节的 segmentId 通过白名单传给 LLM 让它选

### 实现要点(给 Cursor 当骨架,不必逐字复制)

```javascript
'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书演播设计师。基于已经改编好的台本片段和角色音表,设计 BGM、SFX 音效与 CV 演播指导。

规则:
- BGM 给一条整章的氛围方向(mood + suggestion)
- SFX 至少 3 条,每条必须 atSegmentId(只能用输入里给出的 segmentId)+ sfxType(AMB/SFX/FOLEY)+ description
- CV 演播指导至少 2 条,挑情绪转折最强的 segment,给出 emotion + pace
- 严禁编造原文没有的情节、严禁假设画面没有的视觉

输出严格 JSON:
{
  "bgmTrack": { "mood": "string", "suggestion": "string" },
  "sfxList": [ { "atSegmentId": "string", "sfxType": "AMB|SFX|FOLEY", "description": "string" } ],
  "cvDirections": [ { "atSegmentId": "string", "emotion": "string", "pace": "string" } ]
}`;

async function runPerformanceDesignerAgent(ctx) {
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  if (!adaptedScript) throw new Error('PERF_DESIGNER_NO_ADAPTED_SCRIPT');

  const segments = adaptedScript?.payload?.segments || [];
  if (segments.length === 0) throw new Error('PERF_DESIGNER_EMPTY_SEGMENTS');

  const provider = resolveProviderFor('script_adapter');

  const userInput = [
    `章节标题:${adaptedScript.payload.chapterTitle || '未命名'}`,
    `角色音表:${JSON.stringify((voiceRegistry?.payload?.registry || []).slice(0, 6), null, 2)}`,
    ``,
    `可用 segmentId 列表(只能在 atSegmentId 字段使用这些 ID):`,
    segments.map((s) => `- ${s.segmentId} [${s.type}${s.speaker ? '/' + s.speaker : ''}]`).join('\n'),
    ``,
    `选取的代表性片段(供你判断情绪和画面):`,
    segments.slice(0, 8).map((s) => `[${s.segmentId}/${s.speaker || '旁白'}] ${String(s.text || '').slice(0, 100)}`).join('\n'),
  ].join('\n');

  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
    maxTokens: 1500,
    temperature: 0.5,
    responseJson: true,
    timeoutMs: 35000,
  });

  return { payload: parseAndValidate(result.content, segments), latencyMs: result.latencyMs, model: result.model };
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type);
}

function parseAndValidate(raw, segments) {
  if (!raw) throw new Error('PERF_DESIGNER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`PERF_DESIGNER_BAD_JSON: ${e.message}; raw=${raw.slice(0, 200)}`);
  }

  // 兜底:atSegmentId 必须在 segments 集合内,不在的丢掉
  const validIds = new Set(segments.map((s) => s.segmentId));
  parsed.sfxList = (parsed.sfxList || []).filter((s) => validIds.has(s.atSegmentId));
  parsed.cvDirections = (parsed.cvDirections || []).filter((c) => validIds.has(c.atSegmentId));

  // 必须有 bgmTrack
  if (!parsed.bgmTrack || typeof parsed.bgmTrack !== 'object') {
    parsed.bgmTrack = { mood: '未指定', suggestion: '保持人声清楚,不抢戏' };
  }

  return parsed;
}

module.exports = { runPerformanceDesignerAgent };
```

### 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| LLM 编造了不存在的 segmentId | `parseAndValidate` 用白名单过滤,过滤完为空时 sfxList/cvDirections 可能为 0,**这是合法状态**,UI 显示"无设计建议",不要 throw |
| LLM 把 sfxType 写成中文(如"音效") | enum 不强制校验,UI 直接显示 LLM 输出,Week 6 再加 enum 兜底 |
| token 超限(adaptedScript 大于 4000) | 章节字数 Week 3 已限 4000,这里只取前 8 个 segment,实测最多 ~1500 tokens 输入,不会爆 |

### Done criteria

测试 3 项(默认 SKIP live):

- ctx.artifacts 没有 adapted_script → throw `PERF_DESIGNER_NO_ADAPTED_SCRIPT`
- adapted_script.segments 空 → throw `PERF_DESIGNER_EMPTY_SEGMENTS`
- (live)4 段真实 mock adapted_script + 3 角色 voice_registry → 返回 bgmTrack 非空,sfxList ≥ 1,cvDirections ≥ 1,所有 atSegmentId 都在白名单内

### commit

```
feat(gateway/script_adapter): real performance designer agent
```

---

## 1.2 — 质检审校 Agent

### 文件

新建 `oct-gateway/script_adapter/agents/qualityReviewerAgent.js`

### 关键设计

1. 消费 `adapted_script` + `voice_registry` + `performance_design` 三份产物
2. 输出 JSON 对齐 `ReviewReportPayload`(`{ conclusion, issues[] }`)
3. **issues 必须严格分级:P0 致命 / P1 重要 / P2 建议**
4. 给 LLM 看的输入要压缩 — 不传完整 segments,只传统计 + 少量样本

### 实现要点

```javascript
'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书质检审校。基于改编台本、角色音表和演播设计,挑出问题并给改进建议。

检查维度(类别名严格使用):
- 忠实度:有没有改剧情、漏关键信息、提前剧透
- 可听度:对白是否自然、长句是否拆开、有没有书面感残留
- 人物度:speaker 标注是否准确、角色音类别是否合理、有没有混淆旁白和对白
- 连贯度:segment 衔接、CV 情绪过渡是否突兀
- 可执行度:SFX 描述是否具体、CV 指导是否可操作
- 节制度:有没有过度堆砌音效或情绪指导

严重度分级(严格使用):
- P0:致命问题,必须修复才能交付(改了剧情、speaker 严重错误、明显事实错误)
- P1:重要问题,建议修复(可听度差、SFX 模糊、CV 提示空泛)
- P2:体验建议,可选修复(措辞优化、节奏微调)

conclusion 取值:
- pass:全部 P2 或没问题
- pass_with_changes:有 P1 但没 P0
- reject:有任何 P0

输出严格 JSON:
{
  "conclusion": "pass|pass_with_changes|reject",
  "issues": [
    { "severity": "P0|P1|P2", "category": "忠实度|可听度|人物度|连贯度|可执行度|节制度",
      "location": "segmentId 或 '全局'", "description": "string", "suggestion": "string" }
  ]
}

最少给 2 条 issue,最多 8 条。没问题时给 1-2 条 P2 性质的优化建议,conclusion 用 pass。`;

async function runQualityReviewerAgent(ctx) {
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  const performance = pickArtifact(ctx?.artifacts, 'performance_design');
  if (!adaptedScript) throw new Error('REVIEWER_NO_ADAPTED_SCRIPT');

  const segments = adaptedScript?.payload?.segments || [];
  const sampleSegments = segments.slice(0, 6).map((s) =>
    `[${s.segmentId}/${s.speaker || '旁白'}/${s.type}] ${String(s.text || '').slice(0, 80)}`
  ).join('\n');

  const userInput = [
    `章节:${adaptedScript.payload.chapterTitle || '未命名'}(共 ${segments.length} 段,${adaptedScript.payload.totalCharCount} 字)`,
    ``,
    `角色音表(${(voiceRegistry?.payload?.registry || []).length} 个):`,
    JSON.stringify((voiceRegistry?.payload?.registry || []).slice(0, 6), null, 2),
    ``,
    `演播设计:`,
    `BGM:${performance?.payload?.bgmTrack?.mood || '未设计'} - ${performance?.payload?.bgmTrack?.suggestion || ''}`,
    `SFX:${(performance?.payload?.sfxList || []).length} 条`,
    `CV 指导:${(performance?.payload?.cvDirections || []).length} 条`,
    ``,
    `代表性 segment 样本:`,
    sampleSegments,
  ].join('\n');

  const provider = resolveProviderFor('script_adapter');
  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
    maxTokens: 1500,
    temperature: 0.4,
    responseJson: true,
    timeoutMs: 35000,
  });

  return { payload: parseAndValidate(result.content), latencyMs: result.latencyMs, model: result.model };
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type);
}

function parseAndValidate(raw) {
  if (!raw) throw new Error('REVIEWER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`REVIEWER_BAD_JSON: ${e.message}; raw=${raw.slice(0, 200)}`);
  }

  // 兜底
  const validConclusions = ['pass', 'pass_with_changes', 'reject'];
  if (!validConclusions.includes(parsed.conclusion)) parsed.conclusion = 'pass_with_changes';
  if (!Array.isArray(parsed.issues)) parsed.issues = [];

  parsed.issues = parsed.issues
    .map((i) => ({
      severity: ['P0', 'P1', 'P2'].includes(i.severity) ? i.severity : 'P2',
      category: String(i.category || '可听度'),
      location: String(i.location || '全局'),
      description: String(i.description || ''),
      suggestion: String(i.suggestion || ''),
    }))
    .filter((i) => i.description);

  // conclusion 与 issues 一致性
  const hasP0 = parsed.issues.some((i) => i.severity === 'P0');
  const hasP1 = parsed.issues.some((i) => i.severity === 'P1');
  if (hasP0) parsed.conclusion = 'reject';
  else if (hasP1) parsed.conclusion = 'pass_with_changes';

  return parsed;
}

module.exports = { runQualityReviewerAgent };
```

### 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| LLM 倾向给一堆 P2 凑数,没 P0/P1 | conclusion 重新计算(看上面 parseAndValidate),不依赖 LLM 自己判断 |
| LLM 把 severity 写成 "high/medium/low" | enum 兜底为 P2 |
| location 字段 LLM 编个 "段落 3" 而不是 segmentId | 不强制校验(质检报告 location 可以是描述性的),前端显示原文 |
| 总 token 大约多少 | 输入 ~1000 tokens(只传统计 + 6 个样本),输出 1500 tokens,绝对够 |

### Done criteria

测试 3 项(默认 SKIP live):

- 没有 adapted_script → throw
- (live)给齐 3 份产物 → 返回 conclusion ∈ {pass / pass_with_changes / reject},issues ≥ 2,每条 severity ∈ {P0/P1/P2}
- (live)mock 一份故意"改了剧情"的 adapted_script → conclusion 应该是 reject(可选,prompt 测试)

### commit

```
feat(gateway/script_adapter): real quality reviewer agent
```

---

## 1.3 — 交付打包员 Agent(纯 JS)

### 文件

新建 `oct-gateway/script_adapter/agents/deliveryPackagerAgent.js`

### 关键设计

**不调 LLM**。它的工作是收口:把前 4 个产物整理成一份交付清单和概要。LLM 在这里只会编造,纯拼接更稳。

### 实现要点

```javascript
'use strict';

/**
 * 交付打包员 — 纯 JS 拼接,不调 LLM。
 *
 * 输入:ctx.artifacts(adapted_script + voice_registry + performance_design + review_report)
 * 输出:DeliveryPackagePayload { manifest[], versionTag, notes }
 */
async function runDeliveryPackagerAgent(ctx) {
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  const performance = pickArtifact(ctx?.artifacts, 'performance_design');
  const review = pickArtifact(ctx?.artifacts, 'review_report');
  if (!adaptedScript) throw new Error('PACKAGER_NO_ADAPTED_SCRIPT');

  const startedAt = Date.now();
  const chapterTitle = adaptedScript?.payload?.chapterTitle || '未命名章节';
  const segmentCount = (adaptedScript?.payload?.segments || []).length;
  const totalChars = adaptedScript?.payload?.totalCharCount || 0;
  const roleCount = (voiceRegistry?.payload?.registry || []).length;
  const sfxCount = (performance?.payload?.sfxList || []).length;
  const issueCount = (review?.payload?.issues || []).length;
  const conclusion = review?.payload?.conclusion || 'pass';

  // 估算文件大小:1 字符 ≈ 3 bytes(UTF-8 中文)
  const estimateSize = (jsonObj) => {
    const bytes = Buffer.byteLength(JSON.stringify(jsonObj || {}), 'utf8');
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  };

  const safeChapter = chapterTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);

  const manifest = [
    {
      name: `${safeChapter}_多人演播样章.json`,
      type: '台本',
      size: estimateSize(adaptedScript?.payload),
    },
    {
      name: `${safeChapter}_角色音标注表.json`,
      type: '角色音',
      size: estimateSize(voiceRegistry?.payload),
    },
    {
      name: `${safeChapter}_演播设计稿.json`,
      type: '演播设计',
      size: estimateSize(performance?.payload),
    },
    {
      name: `${safeChapter}_质检报告.json`,
      type: '质检',
      size: estimateSize(review?.payload),
    },
    {
      name: 'delivery_manifest.json',
      type: '清单',
      size: '0.5 KB',
    },
  ];

  const versionTag = `audiobook-mvp-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-v1`;

  const conclusionLabel = { pass: '可直接交付', pass_with_changes: '带条件交付', reject: '需返工' }[conclusion] || '已生成';
  const notes = [
    `${chapterTitle}:${segmentCount} 段、${totalChars} 字、${roleCount} 个角色音、${sfxCount} 条音效。`,
    `质检结论:${conclusionLabel}(${issueCount} 条问题)。`,
    issueCount > 0 ? `请优先处理 P0/P1 问题再进入录制。` : `无重大问题,可以交给制作团队。`,
  ].join(' ');

  return {
    payload: { manifest, versionTag, notes },
    latencyMs: Date.now() - startedAt,
    model: 'js-packager',
  };
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type);
}

module.exports = { runDeliveryPackagerAgent };
```

### Done criteria

- 4 个上游产物齐全 → 返回 5 项 manifest,versionTag 包含日期,notes 至少 2 句中文
- adapted_script 缺失 → throw
- 其他 3 个产物缺失 → manifest 仍 5 项,size 显示 0 B(允许部分降级)

### commit

```
feat(gateway/script_adapter): delivery packager agent (pure js, no llm)
```

---

## 1.4 — Dispatcher 接 3 个分支

### 文件

修改 `oct-gateway/script_adapter/mockArtifactFactory.js`

### 实现要点

参照已有的 textRewriter / voiceClassifier 分支模式,在 dispatcher 内追加 3 个分支。**注意每个分支都要有 try/catch + 失败回退占位**:

```javascript
const { runPerformanceDesignerAgent } = require('./agents/performanceDesignerAgent');
const { runQualityReviewerAgent } = require('./agents/qualityReviewerAgent');
const { runDeliveryPackagerAgent } = require('./agents/deliveryPackagerAgent');

// 演播设计师
if (agentId === 'designer.performance_audio@1.0' && isRealAgentEnabled(agentId)) {
  try {
    const { payload, latencyMs, model } = await runPerformanceDesignerAgent(ctx);
    return envelope('performance_design', agentId, displayName, '演播设计提示',
      `${model} 完成 BGM/${payload.sfxList.length} 条 SFX/${payload.cvDirections.length} 条 CV,耗时 ${latencyMs}ms`,
      payload, { sfx: payload.sfxList.length, cv: payload.cvDirections.length, latencyMs });
  } catch (error) {
    return envelope('performance_design', agentId, displayName, '设计失败',
      `演播设计真实调用失败:${String(error?.message || error).slice(0, 80)}`,
      { bgmTrack: { mood: '未设计', suggestion: '' }, sfxList: [], cvDirections: [] }, { error: 1 });
  }
}

// 质检审校
if (agentId === 'reviewer.production_quality@1.0' && isRealAgentEnabled(agentId)) {
  try {
    const { payload, latencyMs, model } = await runQualityReviewerAgent(ctx);
    return envelope('review_report', agentId, displayName, '质检问题清单',
      `${model} 给出结论:${payload.conclusion}(${payload.issues.length} 条问题),耗时 ${latencyMs}ms`,
      payload, { issues: payload.issues.length, latencyMs });
  } catch (error) {
    return envelope('review_report', agentId, displayName, '质检失败',
      `质检真实调用失败:${String(error?.message || error).slice(0, 80)}`,
      { conclusion: 'pass_with_changes', issues: [{ severity: 'P1', category: '系统', description: '质检 Agent 失败,跳过', suggestion: '人工补充' }] },
      { error: 1 });
  }
}

// 交付打包员(纯 JS,但仍走 dispatcher 切换;关闭时走 mock)
if (agentId === 'packager.content_delivery@1.0' && isRealAgentEnabled(agentId)) {
  try {
    const { payload, latencyMs, model } = await runDeliveryPackagerAgent(ctx);
    return envelope('final_package', agentId, displayName, '制作交付包',
      `已打包 ${payload.manifest.length} 个产物文件`,
      payload, { files: payload.manifest.length, latencyMs });
  } catch (error) {
    return envelope('final_package', agentId, displayName, '打包失败',
      `打包失败:${String(error?.message || error).slice(0, 80)}`,
      { manifest: [], versionTag: 'failed', notes: '' }, { error: 1 });
  }
}
```

### Done criteria

- `SCRIPT_ADAPTER_REAL_AGENTS=all` → 5 个 Agent 全真
- `SCRIPT_ADAPTER_REAL_AGENTS=adapter.audiobook_text_rewriter@1.0,designer.performance_audio@1.0` → 只这 2 个真,其余 3 个 mock
- 任何一个 Agent 真实化失败 → 回退占位,后面的 Agent 仍然继续(因为 ctx.artifacts 里有上游产物,即使是占位)

### commit

```
feat(gateway/script_adapter): wire performance / reviewer / packager agents into dispatcher
```

---

## 1.5 — 配置项 & 启用方式(Cursor 直接给 Zilong 抄)

**Zilong 不开终端**。Cursor 在 changelog 里写一段他能直接复制的东西:

如果设置面板已支持环境变量编辑(grep 项目内有没有 `.env` 文件管理 UI):
- 把启用步骤写成"打开设置 → 找到 X 字段 → 填 `all` → 保存"

如果没有:
- 在用户数据目录的 `config.json`(Cursor 必须给出**确切路径**,如 `%APPDATA%\OpenClaw-Terminal\config.json`)新增一行:
  ```json
  "scriptAdapter": { "realAgents": "all", "model": "qwen-max-latest" }
  ```
- 然后重启 OCT(关掉再打开)

**Cursor 必须自己测一次这个流程**,确保 Zilong 复制粘贴后真的生效,不要让 Zilong 反复试。

---

## 1 验收标准(Track 1)

- [ ] 3 个新 Agent 离线测试 PASS
- [ ] 启用 `realAgents=all` 后,工作台跑通 5 个 Agent,**5 个产物全部是真实数据**(不是 mock 写死的"未定记录者 A")
- [ ] 任意一个 Agent 失败时 pipeline 不中断,产物显示对应"X失败"占位
- [ ] 全程总成本 < 0.15 元(qwen-max ~0.05+0.02+0.03+0.03=0.13 元)
- [ ] `npx tsc --noEmit` 通过
- [ ] changelog 已写,启用方式 Zilong 抄一遍能跑通

---

# Track 2 — 产物展示页升级

## 2 总目标

让 5 种产物从"summary 一句话"升级到"点开有结构化展示,看完能直接给制作团队",并新增"交付预览"区。

**Zilong 视角的诉求**:不希望看代码,希望看一眼就知道"这份产物有用 / 没用 / 哪里要改"。

## 2 文件清单

预计:

- 修改:`src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx`(5 种产物展开后的展示)
- 修改:`src/modules/script-adapter/ui/Workbench/ExecutionView.tsx`(增加"交付预览" tab/区)
- 新建:`src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx`(完成后展示完整交付物)
- 修改:`src/modules/script-adapter/styles/scriptAdapter.module.css`(追加样式)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-delivery-preview.md`

---

## 2.1 — ArtifactPreview 展开态升级

### 现状

目前每个产物在执行页只显示 title + summary。

### 目标

每张产物卡可以**点击展开**,展开后:

| 产物 | 展开内容 |
|------|--------|
| adapted_script | 一个"剧本视图":每段 segment 显示为聊天气泡风格,旁白用灰色背景 / dialogue 用对应角色色 / inner_monologue 用斜体 + 浅色边框 |
| voice_registry | 表格:角色名 / 类别 chip(已有色块)/ 出场次数 / 声线建议 |
| performance_design | 三段折叠区:BGM 卡片(mood + suggestion 大字)/ SFX 列表(锚定 segmentId)/ CV 指导列表 |
| review_report | 顶部 conclusion badge(pass/pass_with_changes/reject 三色)+ issues 按 severity 分组(P0 红框 / P1 黄框 / P2 灰框) |
| final_package | 文件清单表格 + versionTag chip + notes 段落 |

### 关键约束

1. **复用 Week 2 已经做好的 severityBadge / roleCategory / gateBanner 样式**,不重新发明色彩 token
2. 展开 / 折叠用 `<details><summary>` 原生 HTML,**不要引第三方组件库**
3. **每个展开区右上角加一个"复制为 JSON"按钮**(`navigator.clipboard.writeText`),让用户能 copy 出去给同事
4. 失败状态(产物 metrics.error === 1)在卡片左侧加一条红色边条,展开内容显示原始错误 message

### Done criteria

- 5 种产物点击展开都有对应可读视图
- 复制按钮真的 copy 出 JSON
- 失败产物视觉明显(红边条)
- 真实跑一次 → 展开看到的不是 "未定记录者 A" 之类 mock 数据

### commit

```
feat(script-adapter): structured artifact preview with copy actions
```

---

## 2.2 — DeliveryPreview 交付预览页

### 文件

新建 `src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx`

### 现状

当前 `ExecutionView` 完成后只显示 5 张产物卡 + 闸门状态,没有"我可以拿走什么"的概览。

### 目标

`overallStatus === 'completed'` 时,在产物卡片**之上**新增一个"交付预览"区,内容:

```
┌──────────────────────────────────────────────────────┐
│ 第 1 章 · 樟木箱 · 多人演播样章交付包                  │
│ versionTag: audiobook-mvp-20260427-v1                │
│ ────────────────────────────────────────────────────│
│ 📖 全文片段(滚动预览):                              │
│ [旁白] 三月的风从楼道窗缝里灌进来...                  │
│ [周婉云] 东西都搬得差不多了...                        │
│ [周佳宁] 嗯。                                        │
│ ...                                                  │
│                                                      │
│ 🎭 角色音(4 位):                                   │
│ 旁白(narrator)/ 周佳宁(main)/ 周婉云(main)... │
│                                                      │
│ 🎵 演播设计:                                        │
│ BGM: 空屋静场 / 3 条 SFX / 2 条 CV 指导              │
│                                                      │
│ ✅ 质检结论:可直接交付(2 条建议)                  │
│                                                      │
│ [复制完整交付包 JSON] [展开查看每个产物]             │
└──────────────────────────────────────────────────────┘
```

### 实现要点

```tsx
import type { TaskExecutionSheet, ArtifactEnvelope, AdaptedScriptPayload, VoiceRoleMarkersPayload, PerformanceDesignPayload, ReviewReportPayload, DeliveryPackagePayload } from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

interface DeliveryPreviewProps {
  sheet: TaskExecutionSheet;
}

export function DeliveryPreview({ sheet }: DeliveryPreviewProps) {
  if (sheet.overallStatus !== 'completed') return null;

  const artifactsList = Object.values(sheet.artifacts);
  const adapted = artifactsList.find((a) => a.artifactType === 'adapted_script');
  const voices = artifactsList.find((a) => a.artifactType === 'voice_registry');
  const perf = artifactsList.find((a) => a.artifactType === 'performance_design');
  const review = artifactsList.find((a) => a.artifactType === 'review_report');
  const pack = artifactsList.find((a) => a.artifactType === 'final_package');

  const adaptedPayload = adapted?.payload as AdaptedScriptPayload | undefined;
  const voicePayload = voices?.payload as VoiceRoleMarkersPayload | undefined;
  const perfPayload = perf?.payload as PerformanceDesignPayload | undefined;
  const reviewPayload = review?.payload as ReviewReportPayload | undefined;
  const packPayload = pack?.payload as DeliveryPackagePayload | undefined;

  const handleCopyAll = () => {
    const fullPackage = {
      versionTag: packPayload?.versionTag,
      adapted_script: adaptedPayload,
      voice_registry: voicePayload,
      performance_design: perfPayload,
      review_report: reviewPayload,
      manifest: packPayload?.manifest,
    };
    navigator.clipboard.writeText(JSON.stringify(fullPackage, null, 2));
    // 顺手做个 toast 反馈,简化版用 console.log + alert 提示一下
  };

  return (
    <section className={`${styles.card} ${styles.deliveryPreviewCard}`}>
      <header>
        <h3>{adaptedPayload?.chapterTitle || '本轮制作'} · 多人演播样章交付包</h3>
        <code>{packPayload?.versionTag || '—'}</code>
      </header>

      <div className={styles.deliverySection}>
        <strong>📖 改编台本预览</strong>
        <div className={styles.scriptPreviewScroll}>
          {(adaptedPayload?.segments || []).slice(0, 8).map((seg) => (
            <p key={seg.segmentId} className={styles[`scriptLine--${seg.type}`]}>
              <em>[{seg.speaker || (seg.type === 'narration' ? '旁白' : '内心')}]</em>
              {' '}{seg.text}
            </p>
          ))}
          {(adaptedPayload?.segments?.length || 0) > 8 ? <small>...还有 {(adaptedPayload?.segments?.length || 0) - 8} 段</small> : null}
        </div>
      </div>

      <div className={styles.deliveryGrid}>
        <div>
          <strong>🎭 角色音({voicePayload?.registry?.length || 0})</strong>
          <p>{(voicePayload?.registry || []).map((r) => r.roleName).join(' / ') || '—'}</p>
        </div>
        <div>
          <strong>🎵 演播设计</strong>
          <p>BGM:{perfPayload?.bgmTrack?.mood || '—'} · SFX {perfPayload?.sfxList?.length || 0} 条 · CV {perfPayload?.cvDirections?.length || 0} 条</p>
        </div>
        <div>
          <strong>✅ 质检结论</strong>
          <p>
            {reviewPayload?.conclusion === 'pass' ? '可直接交付' :
             reviewPayload?.conclusion === 'pass_with_changes' ? '带条件交付' :
             reviewPayload?.conclusion === 'reject' ? '需返工' : '—'}
            ({reviewPayload?.issues?.length || 0} 条问题)
          </p>
        </div>
      </div>

      <footer>
        <button type="button" className={styles.confirmStartButton} onClick={handleCopyAll}>
          复制完整交付包 JSON
        </button>
        <small>{packPayload?.notes || ''}</small>
      </footer>
    </section>
  );
}
```

### CSS 关键(沿用现有 token,只新增结构相关)

```css
.deliveryPreviewCard {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid rgba(30, 117, 91, 0.32);
  background: linear-gradient(135deg, rgba(255, 255, 253, 0.98), rgba(239, 247, 242, 0.98));
}

.deliveryPreviewCard header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.deliveryPreviewCard h3 {
  margin: 0;
  font-size: 18px;
  color: #111819;
}

.deliveryPreviewCard code {
  font-size: 12px;
  color: #6b7280;
  font-family: monospace;
}

.deliverySection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scriptPreviewScroll {
  max-height: 280px;
  overflow-y: auto;
  padding: 10px 12px;
  background: rgba(125, 132, 142, 0.06);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
}

.scriptPreviewScroll p {
  margin: 4px 0;
}

.scriptPreviewScroll em {
  font-style: normal;
  color: #1d4ed8;
  font-weight: 600;
  margin-right: 4px;
}

.scriptLine--narration { color: #4b5563; }
.scriptLine--dialogue { color: #111819; }
.scriptLine--inner_monologue { color: #6d4cb8; font-style: italic; }

.deliveryGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.deliveryGrid > div {
  padding: 12px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 8px;
  border: 1px solid rgba(125, 132, 142, 0.20);
}

.deliveryGrid strong {
  display: block;
  font-size: 12px;
  color: #4b5563;
  margin-bottom: 6px;
}

.deliveryGrid p {
  margin: 0;
  font-size: 13px;
  color: #111819;
}

.deliveryPreviewCard footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(125, 132, 142, 0.20);
}

.deliveryPreviewCard footer small {
  color: #6b7280;
  font-size: 12px;
}
```

### 接入 ExecutionView

`ExecutionView.tsx` 在 `executionResultGrid` 之前插入:

```tsx
<DeliveryPreview sheet={sheet} />
```

### Done criteria

- 5 个 Agent 跑完后,工作台主区出现"交付预览"卡片(放在产物列表上方)
- 改编台本可滚动预览前 8 段,角色按 type 着色
- 复制按钮 copy 出完整 JSON,Zilong 能粘贴到记事本看到 5 个产物的全部数据
- 失败状态(任一产物 metrics.error)→ 卡片显示对应区域 "—" 或 "失败",不崩

### commit

```
feat(script-adapter): delivery preview card with copy-all action
```

---

## 2.3 — 文档

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-delivery-preview.md`,包含:

1. 改动文件清单
2. ArtifactPreview 5 种展开态截图(可以 Zilong 验收时补)
3. DeliveryPreview 截图
4. 已知限制(改编台本只显示前 8 段,完整需点"展开查看每个产物";Week 6 加导出 .md 文件)

---

## 2 验收标准(Track 2)

- [ ] 5 种产物展开都有结构化视图,点"复制为 JSON"能粘贴出真实内容
- [ ] 完成后看到 DeliveryPreview 卡片,3 段产物概览正确
- [ ] 失败产物有红边条标记
- [ ] 移动端窗口宽度 → DeliveryPreview 网格自动塌缩(width<700px 改成单列)
- [ ] `npx tsc --noEmit` 通过

---

# 整合验收(Zilong 5 分钟跑通)

**前置**:Cursor 在 changelog 里清楚说明"开关怎么打"(参考 1.5),Zilong 抄一次。

```
1. 打开 OCT,确认 AI.library 在线(状态栏 📚 ✅)
2. 工作台 → 选《长夜未瞑》或任何已上传书 → 选第 1 章 → 取入测试输入框 → 确认开工
3. 看 5 个 Agent 串行跑完(预计 60-90 秒)
4. 出现"交付预览"卡片
   - 改编台本前 8 段:角色着色、可滚动
   - 角色音:列出所有真实角色名
   - 演播设计:BGM mood + SFX/CV 数量
   - 质检结论:badge + 问题数
5. 点击每个 Agent 卡片展开,看每种产物的结构化视图
6. 点"复制完整交付包 JSON",粘贴到记事本验证
```

**Zilong 此刻应该有的判断**:
- 这 5 份东西可以直接给制作团队用?(预期是的,可能改编需微调)
- 哪份产物的字段还需要扩(留 Week 6 优化)
- 哪个 Agent 的 prompt 需要调(留 Week 6)

---

# 留 Week 6+

1. **执行单持久化**(SQLite + IPC),刷新不丢,可看历史
2. **prompt 微调**:跑过 5-10 章后,Zilong 看出哪个 Agent 不稳,做一次集中调优
3. **导出 Markdown / Word**:DeliveryPreview 加"导出 .md"按钮(Cursor 用 Electron 的 dialog 写文件)
4. **超长章节自动切片**(章节 > 4000 字时分批改编再合并)
5. **书库管理 UI**(列表 / 上传 / 删除 / 章节预览)— Phase 3 前端
6. **task.intake_planner / business.content_analyzer 真实化**(创建任务前置链路)
7. **Workspace 隔离 + custom instructions**(Claude Projects 风格,Zilong 提过)

---

# 给 Cursor 的协作约定(Zilong 不懂代码,务必遵守)

## 时间安排建议(1.5-2 天)

第 1 天:
- 上午:Track 1 全部(1.1-1.5,~6h)
- 下午:Track 2.1 ArtifactPreview 升级(~3h)

第 2 天:
- 上午:Track 2.2 DeliveryPreview(~3h)
- 下午:整合验收 + changelog,准备给 Zilong 一份"开关说明 + 验收路径"

## 必须遵守

1. **Zilong 不开终端**。配置改动写一句"在设置里填什么 / 重启应用",或者由 Cursor 自己写好默认值
2. **每个 Agent 都包 try/catch**,失败回退占位,不让 pipeline 中断
3. **打包员不调 LLM**,纯 JS 拼接(LLM 写 manifest 只会乱编)
4. **不动 agentRunner / mock_execution / llmClient / 已锁的 textRewriter / voiceClassifier**
5. **不做超长章节切片**(章节 > 4000 字仍然 throw,Week 6 处理)
6. **不做持久化**(刷新丢就丢,Week 6 处理)

## 卡壳速查

1. **某个 LLM provider 不支持 `response_format: json_object`** → 删掉这字段,prompt 强制 JSON,parse 容忍 ```json 围栏
2. **质检 Agent token 不够** → 减少 sampleSegments(从 6 段降到 3 段)
3. **`navigator.clipboard.writeText` 在 Electron 里失效** → 用 Electron 的 `clipboard.writeText`(主进程 IPC),Cursor 自己 grep 项目里有没有现成 helper
4. **5 个 Agent 全跑超时** → 默认每个 35-45s,5 个串行最坏 200s,Zilong 等不了。Cursor 跑一次实测,如果太慢用 deepseek-v4(最快最便宜)
5. **真实数据让 ArtifactPreview 渲染崩了** → 兜底用 `?.` 链 + 默认空数组,不要 throw

## Cursor 完成后回报清单(给 Zilong 看)

- [ ] Track 1 commit 列表
- [ ] Track 2 commit 列表
- [ ] 一段 30 秒录屏 / 5 张连续截图:从开工到看到 DeliveryPreview 全过程
- [ ] **配置开关说明**(Zilong 复制粘贴就能用,不要让他打开终端)
- [ ] 一份完整交付包 JSON(Cursor 自己跑一次粘贴出来贴在 changelog 里),证明 5 个产物都是真实的

---

## 相关文档

- Week 4 计划:`docs/03_specs/Week4-Dual-Track-Cowork-Handoff.md`
- Week 3 计划:`docs/03_specs/Week3-Dual-Track-Cowork-Handoff.md`
- 已锁基础设施:`oct-gateway/services/llmClient.js`、`oct-gateway/script_adapter/agentRunner.js`、`oct-gateway/script_adapter/agents/textRewriterAgent.js`、`voiceClassifierAgent.js`
- 内容创作主线:`docs/03_specs/内容创作工作台/`
- 演播设计规则:`docs/03_specs/内容创作工作台/多人演播演播设计规则.md`
- 质检规则:`docs/03_specs/内容创作工作台/多人演播质检规则.md`
