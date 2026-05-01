# Voice-Type & Viewpoint Protocol MVP 执行计划

- 日期：2026-05-02
- 所属模块：内容创作工作台 / 文本改编 Agent
- 前置基线：`script-adapter-voice-degrade-ready-2026-05-02`
- 目标：把“视角角色”和“声音类型”从大 Agent 隐式判断中拆出来，形成可测试的中间协议，解决跨书角色污染、cue 残留、拟声词角色化和未定声音误归 main。

## 1. 背景

三份试产样本暴露了共性问题：

1. 《长夜未瞑》出现 `[宁默][OS]`，说明 OS 仍有默认主角污染风险。
2. 《你们再吹》出现 `[旁白] 苏尘：` 这类说话 cue 残留。
3. 《长夜未瞑》出现 `[周振山] 咔`、`[周振山] 咚`，拟声词被当成人物对白。
4. `未定女声A` 和 `对讲机` 在角色音表中容易被出场次数逻辑误归为 main/support。

这些不是单句问题，而是协议边界不清：系统需要先确定“谁是当前视角”和“这段声音是什么类型”，再进入台本合成和角色音统筹。

## 2. MVP 范围

本轮不新增真实 LLM Agent，先新增规则层协议：

1. `viewpointResolver`
   - 输入：`sourceText`、`spanDoc`、`candidateSets`、`attributions`。
   - 输出：`viewpoint`、`candidates`、`confidence`、`evidence`。
   - 约束：不得默认 `宁默`；推不出视角时返回空 viewpoint。
2. `voiceTypeClassifier`
   - 输入：segment-like item：`type`、`speaker`、`text`。
   - 输出：`narrator` / `character` / `inner_monologue` / `unresolved_voice` / `system_voice` / `device_voice` / `sfx` / `group_voice` / `cue`。
   - `system_voice` 只用于有系统语义的提示，如系统、宿主、面板、任务、奖励、检测、激活等。
   - `device_voice` 用于对讲机、广播、电话、录音、无线电等设备传声。
   - `sfx` 用于咔、咚、砰、滋啦、吱呀等纯动作/环境拟声，不得显示为系统音。
3. `spanScriptComposer`
   - 删除纯 cue 旁白。
   - 将独立拟声词行转为 `speaker = SFX`。
4. `voiceClassifierAgent` 降级表
   - 先按 voice type 强制归类，再按出场次数分 main/support。
   - `unresolved_voice` 不得因出场次数多而升级 main。
   - `sfx` 不得进入普通角色音池。
5. `basicQCChecker`
   - P0：跨书 OS speaker。
   - P1：拟声词人物化。
   - P1：纯 cue 旁白残留。

## 3. 验收样例

| 输入问题 | 期望 |
| --- | --- |
| 《长夜未瞑》周振山章节中出现 `左臂怎么了？` | `[周振山][OS]`，不得出现 `[宁默][OS]` |
| 原文独立行 `咔` / `咚` | `[SFX] 咔` / `[SFX] 咚` |
| `她忽然开口问道：` | 不作为独立旁白段输出 |
| `未定女声A` 出场 6 次 | 角色音类别仍为 `unresolved` |
| `系统音` + `叮，系统已激活` | `[系统音] 叮，系统已激活`，角色音类别为 `sfx` |
| `对讲机` + `滋啦……` | `[对讲机] 滋啦……`，角色音类别为 `sfx` |
| `系统音` + `咚` | 自动纠偏为 `[SFX] 咚`，并由 QC 拦截旧产物 |

## 4. 当前实现状态

- 已新增：
  - `oct-gateway/script_adapter/viewpointResolver.js`
  - `oct-gateway/script_adapter/voiceTypeClassifier.js`
- 已接入：
  - `innerVoiceSpanExtractor` 使用 `viewpointResolver`，去除默认 `宁默` 回退。
  - `spanScriptComposer` 清理纯 cue，并拆出独立 SFX 行。
  - `voiceClassifierAgent` 的真实解析和降级表强制尊重 `unresolved_voice` / `system_voice` / `device_voice` / `sfx`。
  - `basicQCChecker` 增加跨书 OS、cue 残留、拟声词人物化检查。
  - `system_voice` / `device_voice` / `sfx` 在角色音表中仍统一归入 `category = sfx`，但保留 roleName 区分系统提示、设备传声和纯音效。
- 已测试：
  - `innerVoiceSpanExtractor.test.js`
  - `spanScriptComposer.test.js`
  - `basicQCChecker.test.js`
  - `voiceClassifierAgent.test.js`

## 5. 暂不做

- 不新增完整 `ViewpointResolverAgent`。
- 不把所有 OS 归因交给 LLM。
- 不改变 DOCX 渲染格式。
- 不做大规模旁白口语化。

本阶段目标是先把错误边界收紧，让样本产物从“看起来完成”变成“明显结构错误会被拦住或自动降级”。
