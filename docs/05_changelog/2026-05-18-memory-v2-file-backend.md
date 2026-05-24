# 2026-05-18 Memory v2 文件后端

## 背景

近期审查发现 Nocturne 实际主要承担 raw log 存储，L0/L1/L2 摘要、glossary、治理报告、反馈等链路启用率很低，且 Nocturne 离线会让记忆写入和上下文链路显得不稳定。

## 变更

- 新增 `oct-gateway/memory_v2_store.js`，默认将记忆保存到 `~/.openclaw/memory`。
- `oct-gateway/memory.js` 改为兼容门面：默认走 Memory v2，legacy 模式才访问 Nocturne。
- raw turn 写入改为 Nocturne 无关，默认写入 `turns/YYYY-MM-DD.jsonl`。
- Electron 默认不再自动启动 Nocturne；仅在显式配置 legacy/autostart 时启动。
- Gateway 默认跳过 Nocturne 心跳、review queue 维护和治理报告。
- `memory_search` 默认搜索 Memory v2 notes 与近 30 天 raw turns；Nocturne glossary 只在 legacy 模式启用。
- 向量写入默认改为 `selective`，避免每轮对话全量 embedding。
- 自动反馈默认关闭，并修复“好像”误判正反馈的触发问题。
- 摘要调度启动时会补跑昨天的 daily summary，避免错过凌晨定时点。

## 配置

默认值：

- `memory.backend = "file"`
- `memory.root = "~/.openclaw/memory"`
- `memory.nocturne.enabled = false`
- `memory.nocturne.autoStart = false`
- `memory.vectorRecall.write.mode = "selective"`

恢复 Nocturne legacy：

- Gateway：`memory.backend = "nocturne"` 或 `memory.nocturne.enabled = true`
- Electron 自动启动：`OCT_NOCTURNE_AUTOSTART = true`

## 验证

- 已执行 Node 语法检查覆盖 memory facade、Memory v2 store、raw log、vector writer、context builder、ai prompt loader、summary scheduler、memory search。
