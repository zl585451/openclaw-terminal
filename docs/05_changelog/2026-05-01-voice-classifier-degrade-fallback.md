# 2026-05-01 角色音统筹超时降级

## 背景

《夫人请卸甲》第 2 章试跑时，章节在角色音统筹阶段失败：

```text
VOICE_CLASSIFIER_REAL_FAILED: LLM 请求超时:60000ms
```

这说明角色音统筹属于高延迟分析步骤，失败时不应阻断台本、质检和交付包生成。

## 变更

- `voiceClassifierAgent` 输入收窄：
  - 只传角色出场统计。
  - 每个角色最多 2 条代表片段，总计最多 16 条。
  - 不再把整章正文重复交给角色音统筹。
- 真实角色音统筹超时从 `60000ms` 调整为 `35000ms`。
- `mockArtifactFactory` 对 `classifier.voice_role_marker@1.0` 增加降级路径：
  - LLM 超时、网络失败、坏输出或只识别到旁白时，不让整章失败。
  - 基于上游 `adapted_script.segments` 生成规则角色音表。
  - 降级 payload 标记 `degraded: true` 和 `degradeReason`。
- 修正下游 mock 测试，使其不受本机真实 Agent 配置影响。

## 验证

- `node oct-gateway/test/voiceClassifierAgent.test.js`
- `node oct-gateway/test/mockArtifactFactory.downstream.test.js`
- `npx vitest run oct-gateway/test/basicQCChecker.test.js oct-gateway/test/spanScriptComposer.test.js oct-gateway/test/innerVoiceSpanExtractor.test.js`

## 影响

用户重跑章节时，如果角色音统筹再次超时，工作台应继续完成后续步骤；角色音表会显示为降级结果，而不是整章失败。
