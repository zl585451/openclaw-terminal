# Inner Voice / OS MVP 执行计划

- 日期：2026-05-01
- 所属模块：内容创作工作台 / 文本改编 Agent
- 前置基线：`script-adapter-quote-span-mvp-enabled`
- 目标：在 Quote Span Attribution 链路稳定对白归因后，进一步从 narration gap 中抽取“无引号但应由角色演播的内心声 / OS”。

## 0. 当前实现状态

- 实现日期：2026-05-01
- 当前状态：规则型 OS MVP 已接入 `span_attribution` 链路。
- 已实现模块：
  - `innerVoiceSpanExtractor`
  - `spanScriptComposer` 支持在 narration gap 内插入 `inner_monologue`
  - `textRewriterAgent` 新增 `inner_voice_extract` 进度阶段
  - `basicQCChecker` 新增 `inner_monologue_action_misclassified`
- 当前策略：
  - 先用规则识别强 OS candidate，不额外增加模型调用。
  - speaker 默认使用当前视角角色；遇到明确主语角色时更新当前 actor，支持同章内的多角色 OS。
  - OS speaker 先经过角色名清洗；动作词、状态词、上下文短语不得作为 OS speaker。
  - OS 文本设置最小语义门槛；单字、数字、孤立解释词或概念列表不得独立生成 `inner_monologue`。
  - 保持内部 payload 兼容：OS 输出为 `type = inner_monologue`，交付层渲染为 `[角色][OS]`。
- 待后续观察：
  - 是否需要补 `innerVoiceAttributionAgent`。
  - 是否需要更强的跨书视角角色推断。
  - 是否需要把当前规则升级为“规则候选 + Agent 复核”的二段式归因。

## 1. 为什么做

`span_attribution` 已经解决第一层结构问题：

1. `[角色名]` speaker 污染显著减少。
2. 引号对白不再重复塞进旁白。
3. 明确 cue 的对白归因稳定性提升。

但《夫人请卸甲》第 1 章新产物暴露了第二层问题：大量没有引号的主角即时反应仍被保留在旁白中。

典型片段：

```text
嘶~
疼！
等……下！
不应该只是腰酸么，怎么每一寸肌肤都像被炭火撩过？
难道精疲力尽后，又被张秘书掌握了主动权？
但是宁解元是什么鬼？
```

这类内容在有声台本中更适合表达为：

```text
[宁默][OS] 嘶~ 疼！ 等……下！ 不应该只是腰酸么，怎么每一寸肌肤都像被炭火撩过？ 难道精疲力尽后，又被张秘书掌握了主动权？ 但是宁解元是什么鬼？
```

因此下一阶段不是替换 quote span 链路，而是在 `narrationGaps` 内新增 OS span 识别与归因。

## 2. 成功标准

第一轮 MVP 只追求“应该演出来的心声不再全部丢给旁白”：

1. 无引号的第一人称即时反应可被识别为 `inner_monologue`。
2. 短促感叹、疑问、自我纠偏、即时判断可合并成连续 OS 段。
3. 第三人称心理描写仍保持旁白，例如“宁默眉头皱得很深”不能误标 OS。
4. OS speaker 必须来自当前视角角色或明确上下文，不得输出 `角色名`、`未知角色`。
5. Quote span 原有 33 条对白不受影响。
6. 输出继续保持 `AdaptedScriptPayload` 兼容：`type = inner_monologue`，`speaker = 具体角色名`。
7. `嗫嚅`、`没听过他`、`欠`、`幻听`、`故障`、`串频` 等动作词、上下文短语或孤立概念不得进入 OS speaker / OS 文本。

## 3. 总体架构

```text
sourceText
  -> quoteSpanExtractor
      quote spans + narration gaps
  -> speakerCandidateExtractor
  -> quoteAttributionAgent
  -> innerVoiceSpanExtractor
      从 narration gaps 中抽取 OS candidates
  -> innerVoiceAttributionAgent / rule validator
      判断 OS speaker 与置信度
  -> spanScriptComposer
      按原文顺序合成 narration / dialogue / inner_monologue
  -> hardQC
```

## 4. Phase A：OS 样例基线

### 任务

从已跑过的《夫人请卸甲》第 1 章中标注 10-15 个 OS / 非 OS 对照。

### 必含样例

| 原文片段 | 期望 |
| --- | --- |
| `嘶~ 疼！ 等……下！` | `[宁默][OS]` |
| `不应该只是腰酸么...` | `[宁默][OS]` |
| `但是宁解元是什么鬼？` | `[宁默][OS]` |
| `断头饭？ 我干什么了？` | `[宁默][OS]` |
| `他不认命。` | 需要讨论：可保留旁白，或转成 `[宁默][OS] 我不认命。` |
| `宁默眉头皱的很深。` | 旁白 |
| `他撑开眼皮。` | 旁白 |
| `来真的？` | `[宁默][OS]` |
| `心中嘀咕：王管事选的这人，真是俊的没边了……` | `[柳儿][OS]`，只切冒号后的心声 |
| `王管事说……真人比画像更俊美？` | `[三夫人][OS]` |

### 建议文件

- `oct-gateway/test/fixtures/script_adapter/inner_voice/furenqingxiejia_ch1.json`

> 当前进度：暂未新增完整 fixture 文件；已用单元测试覆盖开头 OS、断头饭 OS、第 2 章短疑问 / 心中嘀咕 / 非主角视角疑问、第三人称动作排除。

## 5. Phase B：innerVoiceSpanExtractor

### 任务

纯程序从 `narrationGaps` 中切出 OS candidate，不直接决定最终类型。

### 候选规则

优先识别：

- 第一人称疑问：`我...？`、`自己...？`
- 即时感叹：`疼！`、`不对劲！`、`等……下！`
- 生理/心理短反应：`嘶~`、`真他奈的痛啊！`
- 自我分析链：连续疑问句、反问句、判断句
- 上下文视角角色明确时的无主语心理句
- 显式心理 cue：`心中嘀咕：...`、`暗道：...`、`心想：...`，只抽取冒号后的内容
- 当前 actor 明确时的短视角疑问：`来真的？`、`真人比画像更俊美？`

明确排除：

- 角色动作：`他撑开眼皮`
- 客观环境：`油灯微微跳动`
- 第三人称心理描写：`宁默眉头皱得很深`
- 长段世界观说明

### 建议文件

- `oct-gateway/script_adapter/innerVoiceSpanExtractor.js`
- `oct-gateway/test/innerVoiceSpanExtractor.test.js`

> 当前进度：已实现。MVP 规则覆盖短促反应、第一人称疑问、自我纠偏、即时判断、显式心理 cue、当前 actor 短视角疑问，并排除第三人称动作和世界观长段。actor 推断会忽略 `王大山给出的条件` 这类宾语 / 所属关系，避免把宁默 OS 错归给被提及角色。
> 2026-05-02 补充：新增 OS Span Guard，拒绝污染 speaker 与过短概念残片，避免 `[嗫嚅][OS] 来真的？`、`[没听过他][OS] ...`、`[周佳宁][OS] 欠` 这类产物。

## 6. Phase C：innerVoiceAttributionAgent

### 任务

让 Agent 只判断 OS candidate 是否成立，以及归属谁。

### 输入

```json
{
  "chapterTitle": "第1章 借种",
  "viewpointHint": "宁默",
  "items": [
    {
      "osId": "os001",
      "text": "嘶~ 疼！ 等……下！ 不应该只是腰酸么？",
      "leftContext": "宁默隐约听到有人说话",
      "rightContext": "他撑开眼皮",
      "candidateSpeaker": "宁默"
    }
  ]
}
```

### 输出行协议

```text
os001|inner_monologue|宁默|high|连续第一人称即时反应
os002|narration|旁白|high|第三人称动作描写
```

### 验收

- parser 拒绝污染 speaker。
- `narration` 判断不会进入 inner_monologue。
- 无有效 OS 时不影响 quote pipeline。

> 当前进度：暂缓新增模型 Agent。当前由规则型 extractor 直接给出 `speaker/confidence/evidence`，以减少一次模型调用并先验证结构收益。

## 7. Phase D：composer 合并策略

### 任务

`spanScriptComposer` 需要在 narration gap 内插入 OS segments。

### 合成规则

1. gap 被拆成：gap-before / OS / gap-after。
2. OS 保持原文，不在 MVP 阶段强制改写。
3. 连续 OS candidate 如果 speaker 相同且中间没有客观动作，可合并。
4. 输出顺序必须严格对应原文位置。
5. quote span 与 OS span 不得重叠。

> 当前进度：已实现。composer 会把同一个 narration gap 拆成 `narration / inner_monologue / narration`，避免 OS 与旁白重复。

## 8. Phase E：Hard QC 扩展

新增检查：

1. `inner_monologue` 缺 speaker，失败。
2. `inner_monologue` speaker 污染，失败。
3. 明显第三人称动作误入 OS，降级或失败。
4. OS 与 narration 重复，失败。
5. OS speaker 不像有效角色名，标记 `inner_monologue_speaker_invalid`。
6. OS 文本为单字、数字、孤立概念残片，标记 `inner_monologue_fragment`。

> 当前进度：已新增第三人称动作误入 OS、无效 OS speaker、OS 残片检查；缺 speaker、speaker 污染和重复检查沿用现有 Basic QC 规则。

## 9. 第一轮验收方式

先使用《夫人请卸甲》第 1 章确认主角 OS，再使用第 2 章确认多角色 OS。

对照点：

1. 开头“嘶~ 疼！ 等……下！”段落是否合并为 `[宁默][OS]`。
2. `断头饭？ 我干什么了？` 是否为 `[宁默][OS]`。
3. `他们下手不轻。` 仍归 `王大山`。
4. 不重新出现 `[角色名]`。
5. quote 数量仍保持 33 条。

第 2 章对照点：

1. `来真的？` 是否为 `[宁默][OS]`。
2. `拒绝就是死！ 接受还有活路。` 是否仍归 `[宁默][OS]`，不能被 `王大山给出的条件` 错带偏。
3. `心中嘀咕：王管事选的这人，真是俊的没边了……` 是否拆成旁白前缀 + `[柳儿][OS]`。
4. `王管事说……真人比画像更俊美？` 是否为 `[三夫人][OS]`。

通过后再切换第二样本《你们再吹，我就真的万古无敌了》第 1 章，验证系统音与修仙自语。

## 10. 暂不做

- 不做大规模旁白口语化。
- 不做所有第三人称心理句改写成第一人称。
- 不做人工 OS 标注 UI。
- 不改 DOCX 视觉排版。

本阶段目标是：在对白结构稳定的基础上，把“应该由演员演出来的主角心声”从旁白中释放出来。
