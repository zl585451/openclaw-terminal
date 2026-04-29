# 架构文档补全执行计划

> 归档类型：Cursor 执行包
> 创建日期：2026-04-29
> 目标：补全 docs/ 架构文档，让任何 AI 接手项目时无需重新读代码
> 执行者：Cursor
> 验收者：Zilong 直接阅读（无需 GPT/Claude 介入）
> 监督者：Zilong

---

## 背景

CLAUDE.md 规划了完整的文档目录（docs/00_ai_entry/、docs/02_architecture/ 等），
但目前全部为空。每次新开 AI 会话，模型都要重新读几千行代码才能建立上下文，
浪费大量 token 和时间。

文档补全后，只需喂文档，不需喂代码。

---

## 重要说明

**这个计划与代码重构不同：**
- 不改任何 src/ 文件
- 不需要跑 tsc
- 不需要 git commit（或每个 Task 结尾 commit 一次均可）
- 验收方式：Zilong 直接读文档，判断描述是否准确
- 如有描述不准，直接告诉 Cursor 修改，不走简报流程

---

## 工作流说明

Cursor 读代码 → 写文档 → 到 STOP 点停下
→ Zilong 读文档确认准确 → 继续下一个 Task

---

## 开始前：Cursor 需要读取的文件清单

在开始 Task 1 之前，请完整读取以下文件建立上下文：

```
CLAUDE.md
src/hooks/useMessages.ts
src/hooks/useTokenUsage.ts
src/hooks/useActivityTimeline.ts
src/hooks/useStreamPainting.ts
src/hooks/useTtsPlayback.ts
src/hooks/useImageStudio.ts
src/hooks/useOnboarding.ts
src/core/turnFSM/turnFSM.ts
src/core/streamRouter/streamRouter.ts
src/core/blockIngest.ts
src/ui/chat/ChatTab.v2.tsx（前 50 行足够）
oct-gateway/（入口文件，了解网关职责）
```

---

## Task 1 — 写 `docs/00_ai_entry/README.md`

### 目标

任何 AI 第一次接手项目时读这个文件，5 分钟内建立足够的上下文。

### 执行内容

新建 `docs/00_ai_entry/README.md`，内容包含：

**1. 项目一句话定位**
这是什么应用，用户用它做什么。

**2. 技术栈**
前端（React + TypeScript + Vite + Electron）、后端（Node.js 网关 oct-gateway）、通信方式（WebSocket）。

**3. 代码目录速记**（比 CLAUDE.md 里的更具体）

| 目录 | 职责 |
|------|------|
| src/hooks/ | 所有业务 hook，包括消息、TTS、token 计费等 |
| src/core/ | 状态机（turnFSM）、流路由（streamRouter）等核心运行时 |
| src/ui/chat/ | 主聊天界面组件 |
| oct-gateway/ | Node.js 网关，负责与 AI 服务通信 |
| resources/system_prompts/ | 运行时提示词镜像（只读，改提示词去 docs/01_system_prompts/） |

**4. 消息流转核心链路**（最重要，用文字描述）

用户输入 → ChatTab.v2.tsx 的 sendMessage
→ useMessages.ts 编排 FSM 状态转换
→ WebSocket 发送到 oct-gateway
→ 网关转发到 AI 服务
→ 流式 token 返回 → StreamRouter 缓冲分批
→ useStreamPainting 的 RAF 循环逐字符写入 DOM
→ TurnFSM 完成状态转换 → 消息 finalize

**5. 高风险区域**（直接引用 CLAUDE.md 的标注）

**6. 验证命令**
```
npx tsc --noEmit
npx vitest run
```

### 格式要求

- 纯 Markdown，不用代码高亮（方便喂给任何 AI）
- 总长控制在 150 行以内，不要写成手册
- 用中文

---

### ⛔ STOP — Task 1

文档写完后停下。Zilong 读完确认准确后再继续 Task 2。
如有描述不准，Cursor 直接修改，不需要走简报流程。

---

## Task 2 — 写 `docs/02_architecture/HOOKS_MAP.md`

> ⚠️ Task 1 确认后才开始

### 目标

记录 src/hooks/ 下所有业务 hook 的职责、输入、输出、依赖关系。
这是最新状态（经过两轮重构后），是后续任何改动的参考基准。

### 执行内容

新建 `docs/02_architecture/HOOKS_MAP.md`，为每个 hook 写一个条目：

**格式模板：**

```
## useXxx

**职责**：一句话

**输入参数**：
- param1: 类型 — 用途

**返回值**：
- field1: 类型 — 用途

**内部依赖**：依赖哪些其他 hook 或 context

**被谁使用**：哪个组件或 hook 调用了它
```

**需要覆盖的 hook（按重要性排序）：**

核心链路：
- useMessages
- useTokenUsage
- useActivityTimeline
- useStreamPainting
- useWebSocket
- useTypewriter
- useScrollManager

UI 状态：
- useTtsPlayback
- useImageStudio
- useOnboarding
- useInlineInquiry
- useFileAttachment
- useCapabilities
- useCanvasBridge

### 格式要求

- 每个 hook 一个二级标题
- 不要复制源代码，只写描述
- 总长控制在 200 行以内

---

### ⛔ STOP — Task 2

文档写完后停下，Zilong 确认后继续 Task 3。

---

## Task 3 — 写 `docs/02_architecture/AI_PROJECT_OVERVIEW.md`

> ⚠️ Task 2 确认后才开始

### 目标

系统架构全景图，包含各模块职责和关键数据流，给需要做架构级改动的 AI 看。

### 执行内容

新建 `docs/02_architecture/AI_PROJECT_OVERVIEW.md`，包含：

**1. 系统架构图（文字版 Mermaid）**

用 Mermaid 的 graph TD 语法画出：
- 用户 → ChatTab → useMessages → WebSocket → oct-gateway → AI服务
- 返回链路：AI服务 → WebSocket → StreamRouter → useStreamPainting → DOM

**2. 核心模块职责表**

| 模块 | 文件 | 职责 | 高风险 |
|------|------|------|--------|
| TurnFSM | src/core/turnFSM/ | 会话状态机，管理 IDLE→STREAMING→IDLE 完整状态转换 | ⚠️ |
| StreamRouter | src/core/streamRouter/ | token 缓冲与分批投递，控制流速 | ⚠️ |
| useMessages | src/hooks/useMessages.ts | 消息生命周期编排，WebSocket 事件分发 | ⚠️ |
| oct-gateway | oct-gateway/ | Node.js 网关，转发请求到 AI 服务 | |

（按实际情况补全）

**3. 提示词来源说明**

docs/01_system_prompts/ 是唯一源，resources/system_prompts/ 是运行时镜像，不直接修改镜像。

**4. 测试覆盖现状**

列出 src/core/__tests__/ 下已有哪些测试文件，覆盖哪些模块。

### 格式要求

- 总长 200 行以内
- Mermaid 图可选（如 Cursor 觉得文字描述更清晰也可以）
- 中文

---

### ⛔ STOP — Task 3

文档写完后停下，Zilong 确认后继续 Task 4。

---

## Task 4 — 写 `docs/02_architecture/FEATURE_MAP.md`

> ⚠️ Task 3 确认后才开始

### 目标

功能地图：某个用户可见的功能，背后涉及哪些文件。给需要改某个功能的 AI 快速定位。

### 执行内容

新建 `docs/02_architecture/FEATURE_MAP.md`，列出主要功能和对应文件：

**格式：**

```
## 功能名称

**用户看到的**：简短描述
**涉及文件**：
- src/... — 做什么
- src/... — 做什么
**改动入口**：通常从哪个文件开始改
```

**需要覆盖的功能：**
- 发送消息 / 流式显示
- TTS 语音朗读
- 图片生成工作台（ImageStudio）
- 工具调用（tool call）显示
- 思考过程（CoT）显示
- 设置面板
- 能力栏（CapabilityBar）
- 首次引导（Onboarding）

### 格式要求

- 总长 150 行以内
- 中文

---

### ⛔ STOP — Task 4（最终）

所有文档写完，Zilong 确认后任务完成。
完成后在 `docs/05_changelog/` 补一条记录：
`docs/05_changelog/2026-04-29-architecture-docs-initial.md`

---

## 验收方式（与代码重构不同）

**Zilong 自己读文档即可判断：**
- 描述的模块职责是否与你对项目的理解一致
- 数据流描述是否反映实际运行逻辑
- 有没有明显遗漏或错误的说法

不需要 GPT 或 Claude 介入验收——你最了解这个项目的行为，文档准不准你说了算。

如果某处描述不准，直接告诉 Cursor："第 X 节描述有误，实际是 Y"，Cursor 修改即可。

---

*本文件是执行包，完成后保留在 docs/_archive/docs-architecture-2026-04/。*
