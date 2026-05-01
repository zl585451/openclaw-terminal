# 2026-05-02 Voice-Type & Viewpoint Protocol MVP

## 背景

对《夫人请卸甲》《你们再吹，我就真的万古无敌了》《长夜未瞑》三份试产交付审查后，确认存在共性问题：

- OS 视角角色可能被默认值污染。
- 纯说话 cue 会残留为旁白。
- 独立拟声词可能被归成人物对白。
- 未定声音和设备音可能被角色音表 main/support 逻辑误分类。

## 变更

- 新增 `viewpointResolver`：
  - 从原文、quote 候选、归因结果推章节视角。
  - 推不出视角时返回空，不再默认 `宁默`。
- 新增 `voiceTypeClassifier`：
  - 统一判断 `narrator`、`character`、`inner_monologue`、`unresolved_voice`、`sfx`、`group_voice`、`cue`。
- 更新 `innerVoiceSpanExtractor`：
  - 接入 viewpoint result。
  - 禁止无视角 speaker 的 OS 输出。
- 更新 `spanScriptComposer`：
  - 清理 `苏尘：`、`她忽然开口问道：` 等纯 cue。
  - 将独立拟声词行输出为 `SFX`。
- 更新 `voiceClassifierAgent`：
  - 降级表和模型解析后处理都强制尊重 `unresolved_voice` / `sfx`。
- 更新 `basicQCChecker`：
  - 拦截跨书 OS speaker。
  - 拦截拟声词人物化。
  - 拦截纯 cue 旁白残留。

## 验证

- `npx vitest run oct-gateway/test/innerVoiceSpanExtractor.test.js oct-gateway/test/spanScriptComposer.test.js oct-gateway/test/basicQCChecker.test.js`
- `node oct-gateway/test/voiceClassifierAgent.test.js`

## 后续

下一轮应使用三份样本重跑对照，确认：

- 《长夜未瞑》不再出现 `[宁默][OS]`。
- `咔` / `咚` 不再归周振山。
- `未定女声A` 保持 unresolved。
- cue 残留被明显减少。
