# 2026-04-29 真实 Agent 模式禁止静默回退 Mock

## 本次改动

1. 调整 [oct-gateway/script_adapter/mockArtifactFactory.js](/E:/windows-window/OpenClaw-Terminal/oct-gateway/script_adapter/mockArtifactFactory.js:1)，真实 Agent 模式下任一真实调用失败时直接抛错，不再生成 mock / 占位产物继续流转。
2. 角色音真实阶段如果只识别到 `旁白`，会抛出 `VOICE_CLASSIFIER_ONLY_NARRATOR`，避免把未拆角色的台本包装成正常交付。
3. 调整 [oct-gateway/script_adapter/batchOrchestrator.js](/E:/windows-window/OpenClaw-Terminal/oct-gateway/script_adapter/batchOrchestrator.js:1)，真实批次写入完成前会检查产物标题和摘要；若出现 `mock` 标记，批次直接失败。

## 背景

用户对比第 4 章试产 DOCX 和原文后发现：产物几乎只是原文分段并加 `[旁白]`，角色音也只剩旁白。排查本地批次库后确认，该批次配置为 `executionMode=real` / `realAgents=all`，但实际产物标题为 `多人演播样章台本（Mock 预处理）`。

这说明真实模式曾被 mock 产物静默替代，用户无法从导出的 DOCX 判断真实 Agent 是否真的工作。

## 结果

真实试产以后只有两种结果：

1. 真实 Agent 成功，产物进入导出。
2. 真实 Agent 失败，批次失败并显示错误原因。

不会再出现“界面显示真实 Agent，交付物却是 mock 预处理”的情况。

## 验证

1. `node --check oct-gateway/script_adapter/mockArtifactFactory.js`
2. `node --check oct-gateway/script_adapter/batchOrchestrator.js`
