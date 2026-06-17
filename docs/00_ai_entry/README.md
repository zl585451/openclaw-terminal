# OCT（OpenClaw Terminal）— AI 首次接手导读

> 目标：第一次打开本仓库时，先读本文件，约 5 分钟内建立足够上下文，再按需点进专项入口文档。  
> Status: CURRENT · Last Updated: 2026-04-29

---

## 1. 项目一句话定位

OCT 是基于 **Electron** 的 **AI 桌面助手**：用户在本机通过聊天界面与模型对话，支持流式回复、工具与侧栏能力（如图/TTS 等），由本地 **Node 网关** 负责连接各家 AI 服务。

---

## 2. 技术栈

- **前端**：React、TypeScript、Vite；开发时前端常用端口 **5176**（项目根目录 `npx vite`）。
- **宿主**：Electron（与 `ipcRenderer`、系统能力相关；纯浏览器调前端时部分能力为桩实现）。
- **后端网关**：`oct-gateway/`，**Node.js**，**WebSocket 18789**、**HTTP 18790**（在 `oct-gateway/` 下 `node index.js` 或 `node --watch index.js`）。
- **前后端通信**：前端通过 **WebSocket** 与网关交互；网关再用各厂商 HTTP/SSE 等访问 **AI 服务**。

---

## 3. 代码目录速记

| 目录 | 职责 |
|------|------|
| `src/hooks/` | 业务 Hook：消息生命周期、WebSocket、流式绘制、Token 用量、活动时间线、TTS、ImageStudio、引导等 |
| `src/core/` | 与 React 解耦的运行时核心：会话状态机 `turnFSM`、段状态 `turnSegments`、UI 投影 `turnUiState`、块解析工具等 |
| `src/ui/chat/` | 主聊天界面：`ChatTab.v2.tsx` 组合各 Hook 与列表/输入区 |
| `oct-gateway/` | Node 网关：会话、路由、调用 `streamChat` / 工具与内存相关模块，对上游 AI 转发请求与流式结果 |
| `resources/system_prompts/` | **运行时**提示词镜像（只读；维护单一事实源请改 `docs/01_system_prompts/`，再按需同步产物） |

---

## 4. 消息流转核心链路（主路径）

用户输入在 **`ChatTab.v2.tsx`** 中通过 **`useMessages` 返回的 `sendMessage`** 送出。之后大致顺序为：

1. **`useMessages`** 驱动 **TurnFSM** 的阶段推进（从用户提交、请求发出、到流打开、流中、流结束、渲染完成、回合结束回到 IDLE），并负责 **WebSocket** 收发与消息列表更新； **`useTokenUsage`**、**`useActivityTimeline`** 等在同一编排中消费网关事件。
2. 消息经 **WebSocket** 发到 **`oct-gateway`**；网关 **转发到当前配置的 AI 服务**，并将 **流式 token** 推回前端。
3. **`useMessages`** 通过 `chat.seg` 维护 **`turnSegments`**，以 text/final 段作为助手可见正文事实源；`turnUiState` 只负责状态/活动呈现，TurnFSM 继续负责生命周期。
4. **`useStreamPainting`** 内 **`requestAnimationFrame` 循环**按可视正文长度逐段写入流式 **`pre`/DOM**（并节制滚动和打字音效等），避免一次性_dump_。
5. 流式展示收尾后 **TurnFSM** 完成 **STREAM_COMPLETE → RENDER_COMPLETE → TURN_FINISHED → IDLE**，**`useMessages`** 侧对助手消息 **finalize**，对话回合闭合。

专项细节、边界与故障排查可继续读 `chat-stream-entry.md` 等入口文档。

---

## 5. 高风险区域（工程约束）

约束来源：仓库根目录 **`CLAUDE.md`（AI 首要读取）** 与 **`AGENTS.md`**，高风险文件与协作规则以这两个文件为准。改代码前还需遵守 **`.cursor/rules/architecture-rules.mdc`** 中的分层与目录约定：

- **两套系统严禁混用**：`src/`（ESM/TS/React）与 `oct-gateway/`（CommonJS/`require`）**不得互相 import**。
- **前端分层单向依赖**：`ui → hooks → core/contexts/utils`；`components` 之间避免横向互引；`core` 不依赖 React。
- **`src/ui/chat/ChatTab.v2.tsx` 体量极大**（技术债）：**禁止在此文件继续堆新功能**，只宜做拆分与 bug 修复；单文件超 **500 行**应先拆再扩展（见架构规则中的体量线）。
- **网关与密钥**：API Key 以**项目根 `.env`、gateway `config.json`、用户配置**等组合解析为准；无 Key 时网关能起，但对话会失败。代理与 Google/Gemini 头、 **`HTTPS_PROXY` / undici** 等见 **`AGENTS.md` Gotchas**（重复鉴权、打包版无 `.env` 等）。
- **纯浏览器跑前端**：`ipcRenderer` 可能为桩，聊天不一定能连上网关；测 AI 宜直连 **`ws://127.0.0.1:18789`** 或完整 Electron。
- **改代码 / 协议 / 提示词**：默认需同步 **`docs/`**（含 `docs/05_changelog/`，见仓库规则）。

---

## 6. 验证命令（改代码后常用）

- npx tsc --noEmit  
- npx vitest run  

（网关若改了 `oct-gateway/*.js`，可再加：`node --check oct-gateway/index.js`。）

---

## 7. 按问题类型继续读（入口文档索引）

| 问题类型 | 入口文档 |
|----------|----------|
| 聊天流式、消息显示、状态错乱 | `chat-stream-entry.md` |
| 图片链路 | `image-flow-entry.md` |
| 音效、TTS | `audio-entry.md` |
| 分层记忆等 | `layered-memory-entry.md` 等本目录其他 `*-entry.md` |
| 不确定归类 | `bug-triage.md` |

协议与网关细节还可配合：`docs/03_specs/WEBSOCKET_PROTOCOL.md`、`docs/02_architecture/` 下网关相关说明。

---

以下文档偏 **历史重构/评估**，勿当作当前实现的唯一依据：`docs/_archive/historical_refactors/`、`docs/_archive/historical_reviews/`。
