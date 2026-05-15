# Quote Span + Attribution MVP 执行计划

- 日期：2026-05-01
- 所属模块：内容创作工作台 / 文本改编 Agent
- 前置依据：`样书结构分析报告.md`
- 目标：用“程序抽 span + Agent 判归属 + 程序合成台本”替代当前“Agent 直接生成分类台本”的不稳定链路。

## 0. 当前实现状态

- 实现日期：2026-05-01
- 当前状态：MVP 已接入生产默认链路；旧 `classify-first` 链路仅作为显式回退配置保留。
- 启用方式：默认启用 `span_attribution`；如需回退旧链路，设置 `SCRIPT_ADAPTER_TEXT_PIPELINE=classify_first` 或 `scriptAdapter.textPipeline = "classify_first"`。
- 已实现模块：
  - `quoteSpanExtractor`
  - `speakerCandidateExtractor`
  - `quoteAttributionAgent`
  - `quoteAttributionParser`
  - `spanScriptComposer`
  - `basicQCChecker` 硬拦截 speaker 协议残留和对白/旁白重复
- 已覆盖测试：
  - `quoteSpanExtractor.test.js`
  - `speakerCandidateExtractor.test.js`
  - `quoteAttributionParser.test.js`
  - `spanScriptComposer.test.js`
  - `basicQCChecker.test.js`
- 未完成项：
  - 5 本样书的完整 fixture/golden 标注尚未固化。
  - 新链路尚未设为默认生产链路。
  - 旁白口语化暂未接回新链路，当前优先保证结构正确性。

## 1. 为什么做

当前真实产物在《夫人请卸甲》第 1 章暴露了三类根问题：

1. speaker 污染：出现 `角色名`、`宁默|“...”` 这类协议残留。
2. 白文重复：旁白保留含引号原文，同时又拆出 dialogue。
3. 归属不稳：台词内容里出现的人名被误判为 speaker，后置说话人和旁白夹对白容易漏。

这些问题不适合继续用 prompt 局部补丁修。核心改造方向是把模型从“台本生成者”降级为“证据归属判断员”，最终台本由程序按原文 span 合成。

## 2. 成功标准

第一轮 MVP 不追求口语化完美，先解决结构正确性：

1. 同一句引号对白不能同时出现在 narration 和 dialogue。
2. speaker 不允许为 `角色名`、空字符串、`未知角色`，也不允许包含 `|`、引号、冒号协议残留。
3. 每条 dialogue 必须来自原文 quote span，不允许模型改写对白。
4. 每条 quote attribution 必须有 `confidence` 和 `evidence`。
5. 后置 cue、前置 cue、群体对白、系统音至少能在样书回归中被标记出合理类型。
6. `AdaptedScriptPayload` 输出结构保持下游兼容。

## 3. 总体架构

```text
sourceText
  -> importNormalizer
      编码/章节标题/换行标准化（当前沿用既有摄入结果，未新增独立模块）
  -> quoteSpanExtractor
      quote spans + narration gaps + cue windows
  -> speakerCandidateExtractor
      从 cue 和上下文生成候选 speaker
  -> quoteAttributionAgent
      只判断 quoteId -> speaker/confidence/evidence/voiceType
  -> attributionValidator
      当前由 quoteAttributionParser + hardQC 承担污染拦截
  -> deterministicComposer / spanScriptComposer
      用 span 合成 AdaptedScriptPayload
  -> hardQC
      检查重复对白、协议残留、占位污染
```

## 4. Phase A：样本夹具与标注基线

### 任务

1. 从 5 本样书各抽 1 章作为 fixtures。
2. 每章手工标注 15-30 条 quote attribution golden case。
3. 建立 fixture JSON，避免测试直接依赖 `D:\下载\样书`。

### 建议文件

- `oct-gateway/test/fixtures/script_adapter/quote_attribution/*.json`
- `oct-gateway/test/fixtures/script_adapter/source_samples/*.txt`

### Fixture 格式

```json
{
  "bookTitle": "夫人请卸甲",
  "chapterTitle": "第1章 借种",
  "sourceText": "...",
  "goldenQuotes": [
    {
      "quoteText": "宁默，有人来看你！",
      "speaker": "狱卒",
      "voiceType": "dialogue",
      "confidence": "high",
      "evidenceKeyword": "狱卒的声音"
    }
  ]
}
```

### 验收

- 至少 5 个 fixture。
- 覆盖：未知开场、群体对白、系统音、后置说话人、旁白夹对白、非标准章节标题。

> 当前进度：未固化完整样书 fixture；已用最小单测覆盖上述结构类型。下一轮真实跑产物后再回填 golden case。

## 5. Phase B：quoteSpanExtractor

### 任务

实现纯程序抽取：

- 标准中文引号：`“...”`
- 半角引号：`"..."`
- 系统音/功能音：`【叮……】`、`【系统提示】`
- quote 前后上下文窗口
- narration gaps
- span start/end

### 建议文件

- `oct-gateway/script_adapter/quoteSpanExtractor.js`
- `oct-gateway/test/quoteSpanExtractor.test.js`

### 输出格式

```js
{
  chapterTitle: '第1章 借种',
  sourceText,
  quotes: [
    {
      quoteId: 'q001',
      text: '醒了？',
      start: 12,
      end: 17,
      leftContext: '第1章 借种',
      rightContext: '“感觉如何？舒服吗？”...',
      quoteMark: 'curly',
      kindHint: 'speech'
    }
  ],
  narrationGaps: [
    { gapId: 'n001', start: 0, end: 12, text: '第1章 借种\n' }
  ]
}
```

### 验收

- quote span 与 sourceText 切片完全一致。
- narration gaps 与 quote spans 拼回去后等于原文。
- 不丢 quote，不重复 quote。
- 《夫人请卸甲》第 1 章 33 个引号对白可全部抽出。

> 当前进度：核心抽取器已实现并测试 `“...”`、`"..."`、`【...】`、上下文窗口、narration gaps 原文重组。

## 6. Phase C：speakerCandidateExtractor

### 任务

基于 quote 的左右上下文生成候选 speaker 和证据类型：

- 前置 cue：`王大山开门见山道：“...”`
- 后置 cue：`“...”王大山说道。`
- 场景 cue：`监牢中响起一个狱卒的声音`
- 连续对话 cue：上一条 speaker 可弱继承
- 群体 cue：`众人`、`几位弟子`、`外门弟子`
- 系统 cue：方括号系统音

### 建议文件

- `oct-gateway/script_adapter/speakerCandidateExtractor.js`
- `oct-gateway/test/speakerCandidateExtractor.test.js`

### 输出格式

```js
{
  quoteId: 'q012',
  candidates: [
    { speaker: '狱卒', evidenceType: 'scene_voice', evidenceText: '狱卒的声音', confidenceHint: 'high' }
  ]
}
```

### 验收

- 不把 quote 文本里被称呼的人名直接当 speaker。
- 能从后置 cue 提取 speaker。
- 能为群体对白生成 `外门弟子群` 一类候选。

> 当前进度：已支持前置 cue、后置 cue、场景声音 cue、系统 cue、群体 cue、连续对白弱继承。

## 7. Phase D：quoteAttributionAgent

### 任务

新增归属 Agent。它只消费 quote items，不产出台本正文。

### 建议文件

- `oct-gateway/script_adapter/agents/quoteAttributionAgent.js`
- `oct-gateway/script_adapter/quoteAttributionParser.js`
- `oct-gateway/test/quoteAttributionParser.test.js`

### Agent 输入

```json
{
  "chapterTitle": "第1章 借种",
  "knownRoles": ["宁默", "王大山", "狱卒", "老犯人"],
  "quotes": [
    {
      "quoteId": "q012",
      "text": "宁默，有人来看你！",
      "leftContext": "...监牢中又响起一个狱卒的声音",
      "rightContext": "随后走廊尽头传来了脚步声",
      "candidates": ["狱卒", "宁默"]
    }
  ]
}
```

### Agent 输出

优先 JSONL 或严格行协议：

```text
q012|dialogue|狱卒|high|左侧写“狱卒的声音”
q001|dialogue|未定女声A|low|开场无明确身份
q008|system_voice|系统音|high|方括号系统提示
```

### 验收

- 解析失败行进入 warnings，不污染产物。
- 无有效 attribution 时抛错，不静默生成错误台本。
- speaker 污染词被拦截。

> 当前进度：已实现严格行协议 Agent、输入构造和 parser；无有效归因时抛错，不静默生成台本。

## 8. Phase E：deterministicComposer

### 任务

用 quote attribution + narration gaps 合成 `AdaptedScriptPayload`。

### 建议文件

- `oct-gateway/script_adapter/spanScriptComposer.js`
- `oct-gateway/test/spanScriptComposer.test.js`

### 合成规则

- narration gap 生成 narration segment。
- quote attribution 生成 dialogue / inner_monologue / system_voice segment。
- quote 原文不改写。
- 章节标题不得混入第一条旁白。
- 空白 gap 可丢弃。
- 输出 segmentId 连续。

### 验收

- 同一 quote 不会在旁白和对白中重复。
- 输出文本按原文顺序排列。
- 下游 Voice / QC / Packager 可继续消费。`system_voice` 在 MVP 中映射为 `dialogue + speaker=系统音`，保持现有 `AdaptedScriptPayload` 兼容。

> 当前进度：已实现 `spanScriptComposer`。quote 文本原样进入对白，narration gap 不包含 quote 原文。

## 9. Phase F：Hard QC

### 任务

把结构错误变成硬失败，而不是质检报告里“建议修改”。

### 规则

1. speaker 为占位污染词，失败。
2. speaker 含协议残留，失败。
3. narration 与 dialogue 存在同 quote 重复，失败。
4. dialogue text 含 `speaker|quote`，失败。
5. quote attribution 缺 confidence/evidence，失败。
6. 角色音表含污染 speaker，失败。

### 建议文件

- 扩展 `oct-gateway/script_adapter/basicQCChecker.js`
- 新增 `oct-gateway/test/spanHardQC.test.js` 或扩展现有 QC 测试。

> 当前进度：已扩展 `basicQCChecker.js` 和 `basicQCChecker.test.js`，覆盖 `speaker_protocol_residue` 与 `dialogue_duplicated_in_narration`。

## 10. Phase G：接入 textRewriterAgent

### 任务

在 `textRewriterAgent` 中增加新链路开关：

- 默认可先走 `SCRIPT_ADAPTER_TEXT_PIPELINE=span_attribution`
- 旧分类优先链路保留为 fallback 或对照。

### 接入策略

第一轮建议只对测试/开发启用，不直接替换生产默认。

```text
if span_attribution:
  quoteSpanExtractor
  speakerCandidateExtractor
  quoteAttributionAgent
  validate
  spanScriptComposer
else:
  classify-first pipeline
```

### 验收

- 旧测试不破。
- 新样书 fixture 测试通过。
- 《夫人请卸甲》第1章不再出现 `角色名` speaker、`宁默|“...”` 残留和对白重复。

> 当前进度：`textRewriterAgent` 默认走 `span_attribution`；`classify_first` 仅保留为显式回退和对照链路。下一步需要继续用真实样章固化 fixture/golden 回归。

## 11. Phase H：样书回归矩阵

| 样本 | 必测点 | 通过标准 |
| --- | --- | --- |
| 夫人请卸甲 第1章 | 未知开场、狱卒、王大山、老犯人 | 无 `角色名`，无重复对白，王大山后置/前置 cue 可识别 |
| 你们再吹 第1章 | 系统音、主角自语 | 系统音不进入普通角色；主角自语不乱归旁白 |
| 你们再吹 第2章 | 群体对白 | 可输出 `外门弟子群/外门弟子A`，不硬猜苏尘 |
| 我靠出马成名了 第1章 | 第一人称、仙家长对白 | 叙述我与对白我区分，长对白不截断 |
| 谁让他莽上去的 第2章 | 后置 cue、西幻名 | 伊莱/洁西卡/塞西莉亚不被奇怪截断 |
| 八零之福运小寡妇 【001】 | GB18030、非标准章节 | 正确识别章节，后置 cue 可归属 |

## 12. 工作拆分建议

### 第 1 次提交

- 样本 fixtures
- quoteSpanExtractor
- quoteSpanExtractor tests

### 第 2 次提交

- speakerCandidateExtractor
- candidate tests

### 第 3 次提交

- quoteAttributionAgent + parser
- parser tests

### 第 4 次提交

- spanScriptComposer
- composer tests

### 第 5 次提交

- hard QC
- textRewriterAgent 开关接入
- 样书回归测试
- docs/changelog

## 13. 风险与回退

| 风险 | 应对 |
| --- | --- |
| quote 抽取漏掉非标准引号 | 先支持主流引号，未识别结构进入 warnings；逐步扩展 |
| attribution Agent 仍会胡猜 | 强制 confidence/evidence；low confidence 进入 unresolved 占位 |
| 程序合成太碎 | composer 可合并相邻 narration gaps，但不能跨 quote 合并 |
| 旧下游不认识 system_voice | MVP 可先映射成 `narration` + speaker `系统音`，后续扩展类型 |
| 成本增加 | attribution 输出很短；比整章台本重写更省输出 token |

## 14. 暂不做

- 不做完整口语化优化。
- 不做跨章节角色记忆回绑。
- 不做 UI 大改。
- 不做全格式 OCR/EPUB 导入。
- 不做人工标注工具。

本 MVP 的边界是：先把结构正确性打稳，再谈台本润色和交付体验。
