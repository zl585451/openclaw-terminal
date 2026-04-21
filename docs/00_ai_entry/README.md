# AI 入口层

> Status: CURRENT  
> Last Updated: 2026-04-08  
> Purpose: 给 Claude / GPT / 小模型一个稳定的排错与改动入口。先看这里，再搜代码。

---

## 使用规则

1. 先根据问题类型打开对应入口文档，不要一上来全仓 `rg`
2. 只先阅读入口文档列出的 3-6 个核心文件
3. 需要改代码时，优先沿入口文档给出的链路向前后各查一层
4. 修改完成后，必须同步更新：
   - 本目录下对应入口文档
   - `docs/02_architecture/FEATURE_MAP.md`（如果职责或入口变化）
   - `docs/05_changelog/`（记录本次改动）

---

## 先看哪份

| 问题类型 | 入口文档 |
|---|---|
| 聊天流式、消息显示、状态错乱 | `chat-stream-entry.md` |
| 图片发送、识图、图片导致请求失败 | `image-flow-entry.md` |
| 打字音效、TTS、音频播放 | `audio-entry.md` |
| 不确定属于哪条链路、需要统一排查顺序 | `bug-triage.md` |

---

## 当前实现优先级

以下文档可直接作为当前代码依据：

- `chat-stream-entry.md`
- `image-flow-entry.md`
- `audio-entry.md`
- `bug-triage.md`
- `../02_architecture/01-gateway.md`
- `../03_specs/WEBSOCKET_PROTOCOL.md`
- `../03_specs/ELECTRON_IPC_CHANNELS.md`

以下文档主要是历史设计/重构记录，不应直接当作当前实现真相：

- `../_archive/historical_refactors/REFACTOR_4STEP_CHATTAB.md`
- `../_archive/historical_refactors/REFACTOR_STEP1_USE_TYPEWRITER.md`
- `../_archive/historical_reviews/DOCUMENTATION_GAP_REPORT.md`

---

## 文档状态约定

- `CURRENT`：当前实现，排错与改动优先参考
- `REFERENCE`：补充背景，可辅助理解
- `HISTORICAL`：历史方案或旧评估，只能参考，不可直接当当前代码事实
