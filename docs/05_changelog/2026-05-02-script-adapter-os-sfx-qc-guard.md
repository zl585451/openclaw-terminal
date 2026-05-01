# Script Adapter OS / SFX 质检防护

- 日期：2026-05-02
- 范围：内容创作工作台 / Gateway 文本改编链路

## 背景

四份试产样本显示，系统音与 SFX 分流后，剩余共性问题集中在：

1. OS speaker 被动作词或上下文短语污染，例如 `嗫嚅`、`没听过他`。
2. OS 文本被切成单字或孤立概念残片，例如 `欠`、`幻听`、`故障`、`串频`。
3. `SFX` 过宽，数字或编号残片可能被标成音效，例如 `84`。

## 变更

1. `viewpointResolver.normalizeRole` 增加非角色词过滤，供 OS speaker 清洗复用。
2. `innerVoiceSpanExtractor` 增加 OS Span Guard，拒绝过短、数字、孤立概念残片。
3. `basicQCChecker` 新增：
   - `inner_monologue_speaker_invalid`
   - `inner_monologue_fragment`
   - `sfx_text_invalid`
4. `quoteAttributionAgent` 提示词明确数字、编号、时间、物品型号、残缺字符不得归为 `sfx|SFX`。

## 验收样例

- `[嗫嚅][OS] 来真的？` 应被 QC 标记。
- `[没听过他][OS] ...` 不应由新抽取链路生成。
- `[周佳宁][OS] 欠` 应被丢弃或 QC 标记。
- `[SFX] 84` 应被 QC 标记。

