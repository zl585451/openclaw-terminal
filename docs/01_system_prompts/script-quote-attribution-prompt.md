# Script Quote Attribution Agent Prompt

- 日期：2026-05-01
- 所属模块：内容创作工作台 / 文本改编 Agent
- 代码位置：`oct-gateway/script_adapter/agents/quoteAttributionAgent.js`

## 目标

`quoteAttributionAgent` 不生成台本正文，只判断每条 quote span 的说话人归属。

它接收：

- `chapterTitle`
- `knownRoles`
- `quotes[]`
- 每条 quote 的 `leftContext` / `rightContext`
- 规则候选 `candidates[]`

它输出严格行协议：

```text
quoteId|voiceType|speaker|confidence|evidence
```

## 协议约束

`voiceType` 只能是：

- `dialogue`
- `inner_monologue`
- `system_voice`

`confidence` 只能是：

- `high`
- `medium`
- `low`

硬规则：

1. speaker 必须是说话者，不是台词里被称呼的人。
2. 前置 cue 和后置 cue 都有效。
3. `某某的声音` 属于高置信度场景 cue。
4. `【系统提示】`、`【叮】` 这类方括号提示归 `system_voice|系统音`。
5. 不确定时允许临时声线名，但必须给出 evidence。
6. 禁止输出 `角色名`、`未知角色`、`speaker`、`旁白`、`对白` 作为 speaker。
7. 禁止输出 JSON、Markdown、解释和代码块。

## 设计原因

旧链路让模型直接输出整章台本，容易出现 speaker 污染、对白重复和格式残留。新链路把模型职责收窄为“证据归属判断”，最终台本由 `spanScriptComposer` 按原文 span 程序合成。
