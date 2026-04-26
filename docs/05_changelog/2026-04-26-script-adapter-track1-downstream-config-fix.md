# Changelog: Track 1 修正 — 下游 mock 对齐 + scriptAdapter 运行时生效

日期：2026-04-26

## 1. 下游 mock 消费上游 `adapted_script`

- `agentRunner` 在每次 `createArtifactForAgent` 时传入当前 `sheet.artifacts`（已含文本改编师产物）。
- `mockArtifactFactory` 若解析到 `artifactType === 'adapted_script'` 且 `payload.segments` 非空，则：
  - **voice_registry**：从 `dialogue` / `inner_monologue` 的 `speaker` 聚合计数，旁白单独统计；`unresolved` 为仅出现 1 次的说话人（最多 2 个），不再写死「周佳宁」等。
  - **performance_design**：`sfxList` / `cvDirections` 的 `atSegmentId` 绑定上游真实 `segmentId`。
  - **review_report**：`issues[0].description` 含段数与说话人列表摘要。
  - **final_package**：`manifest` 文件名与 `versionTag` 依据 `chapterTitle`、`segments.length`、`totalCharCount` 生成。
- 无上游台本时仍走原固定 mock（全 mock 路径行为不变）。

验证：`node oct-gateway/test/mockArtifactFactory.downstream.test.js`（构造自定义 `seg-xxx` 与「角色甲/乙」，断言 registry、atSegmentId、质检文案、manifest 对齐）。

## 2. `config.scriptAdapter` 与 env 一致生效

- **开关**：`isRealAgentEnabled` 优先读 `config.scriptAdapter.realAgents`（与 `config.js` 中 `def` + `config.json` 嵌套 `scriptAdapter` 合并结果一致），为空再读 `getEnvOrConfig('SCRIPT_ADAPTER_REAL_AGENTS')`。
- **专用端点**：`llmClient.resolveProviderFor` 在 `SCRIPT_ADAPTER` 前缀分支读 `config.scriptAdapter.baseUrl|apiKey|model`，逐项回退到对应 `SCRIPT_ADAPTER_*` env/顶层配置键。

说明：`config.js` 里 `scriptAdapter` 对象本身已把 env 与 `config.json` 的 `scriptAdapter` 块合并；运行时以上两处直接消费该合并结果，避免「只展示快照、逻辑不读」的偏差。

人工可验：仅在 `config.json` 写 `"scriptAdapter": { "realAgents": "adapter.audiobook_text_rewriter@1.0" }`（不设顶层 `SCRIPT_ADAPTER_REAL_AGENTS`），重启 Gateway 后应仍能打开真实改编开关（在仍配置好 provider 的前提下）。

## 改动文件

- `oct-gateway/script_adapter/agentRunner.js`
- `oct-gateway/script_adapter/mockArtifactFactory.js`
- `oct-gateway/services/llmClient.js`
- `oct-gateway/test/mockArtifactFactory.downstream.test.js`（新）
- `docs/02_architecture/script-adapter-gateway-protocol.md`
- `docs/05_changelog/2026-04-26-script-adapter-track1-downstream-config-fix.md`（本文件）
