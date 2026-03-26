# OCT 项目总览 · AI 协作入口

> **最后更新时间**：2026-03-24  
> **为谁而写**：AI 协作伙伴（Claude/Cursor/GPT 等）  
> **用途**：快速理解项目结构、关键入口、目录映射，辅助修改/调试

---

## 一、项目定位

**OCT（OpenClaw Terminal）** = AI 终端应用，基于 Electron + React + Node.js。

- **前端**：React + Vite，运行在 Electron 渲染进程
- **Gateway**：Node.js（oct-gateway），WebSocket 服务器，AI 对话引擎
- **主进程**：Electron main.ts，管理子进程、IPC、窗口、配置

---

## 二、目录结构（核心）

```
OpenClaw-Terminal/
├── electron/           # Electron 主进程
│   └── main.ts         # 入口，spawn Gateway/Nocturne/AI.library，IPC 注册，WebSocket 转发
├── src/                # React 前端
│   ├── components/     # ChatTab、OptionBox、TaskList、SettingsPanel、VaultPanel 等
│   ├── utils/          # optionBoxParser.ts（消息解析）、permissionCheck.ts
│   ├── gateway/        # search.ts（多引擎搜索封装）
│   └── contexts/       # SettingsContext、PermissionsContext
├── oct-gateway/        # Node.js Gateway（独立进程）
│   ├── index.js        # WebSocket 服务器、slash 命令、chat.send 路由
│   ├── ai.js           # streamChat、loadSystemPrompt、工具调用
│   ├── orchestrator.js # 意图分类、后台任务派发
│   ├── tools/          # 动态加载的工具（web_search、read_file、vault_ops 等）
│   ├── tools.js        # 工具注册与执行入口
│   ├── tool_loader.js  # 扫描 tools/ 目录加载工具
│   ├── skill_adapter.js# 解析 skills/ 下的 SKILL.md，注入系统提示词
│   ├── skills/         # 技能目录（子目录含 SKILL.md）
│   ├── config.js       # 配置加载
│   └── prompts 相关    # 由 config.PROMPTS_DIR 指向 docs/01_system_prompts
├── docs/               # 文档
│   ├── 01_system_prompts/  # 系统提示词（SOUL、AGENTS、USER、OCT_PROTOCOL 等）
│   ├── 02_architecture/    # 项目架构、功能地图
│   ├── 03_specs/           # 技术协议、规范文档
│   ├── 04_dev_guides/      # 开发指南
│   ├── 05_changelog/       # 更新日志、修复报告
│   ├── 06_release/         # 发布文档
│   ├── 07_research/        # 研究文档
│   ├── 08_for_claude/      # 给Claude的上下文
│   ├── task-queue.md       # 运行时通信文件（不要移动）
│   └── task-result.md      # 运行时通信文件（不要移动）
├── resources/          # Nocturne、打包资源
└── prompts/            # 部分项目的 MEMORY.md 等（Gateway 默认用 docs/01_system_prompts）
```

---

## 三、关键入口

| 入口 | 文件 | 说明 |
|------|------|------|
| 应用启动 | `electron/main.ts` | 创建窗口、启动 Gateway、Nocturne、AI.library |
| 消息收发 | `electron/main.ts` → `handleMessage` | 前端通过 openclaw-send 发消息，main 转发到 WebSocket |
| Gateway 消息 | `oct-gateway/index.js` | 收到 `chat.send` → `handleSlashCommand` 或 `streamChat` |
| AI 调用 | `oct-gateway/ai.js` → `streamChat` | 调用 Provider API、处理 tool_calls |
| 前端渲染 | `src/components/ChatTab.tsx` | 渲染消息、调用 optionBoxParser 解析交互标签 |
| 交互解析 | `src/utils/optionBoxParser.ts` | 解析 [pills]/[question]/[tasklist] 等成对标签 |

---

## 四、端口一览

| 端口 | 服务 | 说明 |
|------|------|------|
| 18789 | Gateway WebSocket | 前端 ↔ AI 主通道 |
| 18790 | Gateway HTTP 工具 | VaultPanel、invoke-gateway-tool 调用 |
| 8000 | Nocturne 记忆 | Python FastAPI，SQLite 存储 |
| 8001 | AI.library 知识库 | 可选，search_knowledge 工具 |

---

## 五、文档导航（给 AI）

| 主题 | 文档 |
|------|------|
| 功能活地图 | `docs/FEATURE_MAP.md` |
| 架构设计 | `docs/architecture/OCT_MAS_ARCHITECTURE.md` |
| 交互协议 | `docs/01_system_prompts/OCT_PROTOCOL.md` |
| 渲染标签 | `docs/RENDER_PROTOCOL.md` |
| IPC 通道 | `docs/ELECTRON_IPC_CHANNELS.md` |
| WebSocket 协议 | `docs/WEBSOCKET_PROTOCOL.md` |
| 提示词加载 | `docs/PROMPT_LOADING_ORDER.md` |
| 选项框解析 | `docs/OPTIONBOX_PARSER_REFERENCE.md` |
| 工具列表 | `docs/feature-map/09_tools.md` |
| Slash 命令 | `docs/feature-map/06_commands.md` |

---

## 六、常见修改场景

- **改交互协议**：改 `OCT_PROTOCOL.md`、`RENDER_PROTOCOL.md`，前端 `optionBoxParser.ts` 需对应
- **加工具**：在 `oct-gateway/tools/` 新增 `.js` 文件，实现 `{ name, definition, execute }`
- **加 Slash 命令**：在 `oct-gateway/index.js` 的 `handleSlashCommand` 中加分支
- **加 IPC**：`electron/main.ts` 注册 `ipcMain.handle`，`electron/preload.ts` 暴露 API
- **改配置**：`oct-gateway/config.js`、`userData/config.json`

---

*本文档为 AI 协作伙伴设计，便于快速定位和修改。*
