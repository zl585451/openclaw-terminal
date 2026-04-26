# 2026-04-26 — 角色音统筹 Agent 真实 LLM（Week 4 Track 2）

## 摘要

`classifier.voice_role_marker@1.0` 可在启用 `SCRIPT_ADAPTER_REAL_AGENTS` 时走真实 LLM：从上游 `adapted_script` 的 `segments` 用 JS 聚合 `speaker` / 旁白出场次数，模型只负责类别与 `voiceHint`；`appearanceCount` 始终以本地统计覆盖；非法 `category` 兜底为 `support`。dispatcher 捕获异常后返回空 `registry` 占位，流水线不中断。

## 改动文件

| 文件 | 说明 |
|------|------|
| `oct-gateway/script_adapter/agents/voiceClassifierAgent.js` | 新建：聚合、`chatCompletion`、`parseVoiceClassifierOutput`、合并缺失角色 |
| `oct-gateway/script_adapter/mockArtifactFactory.js` | 在 `classifier.voice_role_marker@1.0` 且 `isRealAgentEnabled` 时调用真实 Agent |
| `oct-gateway/test/voiceClassifierAgent.test.js` | 离线断言 + 可选 `RUN_LIVE_TESTS=1` |
| `docs/03_specs/内容创作工作台/00_项目接手指南.md` | 5.1 节状态标注 |

## 启用方式

与文本改编师相同环境变量 / `config.json` 嵌套 `scriptAdapter`：

- `SCRIPT_ADAPTER_REAL_AGENTS=classifier.voice_role_marker@1.0` 仅开角色音
- `adapter.audiobook_text_rewriter@1.0,classifier.voice_role_marker@1.0` 两个都真跑
- `all` / `on` / `true`：当前 dispatcher 中仅有改编师与角色音两条真实分支，其余 Agent 仍为 mock

## 与上游依赖

必须已有 `adapted_script` artifact（通常由上一步文本改编师产出）。`segments` 为空时抛错并由 dispatcher 降级；改编失败占位台本若仍含非空 `segments`，角色音仍会尝试调用 LLM（仅旁白一条时成本很低）。

## 已知限制

- 演播设计、质检、打包仍为 mock（Week 5+）。
- 不做角色去重 / 别名合并（「小明」与「明哥」为两条）。
- LLM 未返回的角色行由本地 `stats` 补全为 `support` 占位声线说明。
- 单次角色音调用体量小于全文改编，预估约 **0.01–0.02 元**（视模型与角色数而定）。

## 验证

```bash
node oct-gateway/test/voiceClassifierAgent.test.js
# 可选真实调用：
# RUN_LIVE_TESTS=1 node oct-gateway/test/voiceClassifierAgent.test.js
node --check oct-gateway/script_adapter/agents/voiceClassifierAgent.js
```

## Commit 建议

```
feat(gateway/script_adapter): real voice classifier agent consuming adapted_script
feat(gateway/script_adapter): wire voice classifier into dispatcher
```
