# 2026-04-18 Agent 基类与执行引擎初版

> Status: CURRENT  
> Date: 2026-04-18  
> Type: 新增功能  
> Scope: oct-gateway/agents/

---

## 改动概述

新增 `oct-gateway/agents/` 目录，引入 Agent 体系基础层：

| 文件 | 职责 |
|------|------|
| `agents/base_agent.js` | 所有专职 Agent 的抽象基类 |
| `agents/agent_runner.js` | Agent 执行引擎（非流式工具循环） |

---

## base_agent.js

### 设计目标
提供统一的 Agent 属性约定，让子类通过最少的重写就能接入 `agent_runner`。

### 核心属性
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | `'BaseAgent'` | Agent 唯一名称，用于事件标识 |
| `description` | string | `''` | 用途说明，供路由/调度层读取 |
| `model` | string\|null | `null` | 模型 ID；null 时 runner 用全局模型 |
| `systemPrompt` | string | `''` | 系统提示词正文 |
| `allowedTools` | string[] | `[]` | 工具白名单，空数组=禁止所有工具 |
| `maxTurns` | number | `8` | 工具循环最大轮次 |
| `timeoutMs` | number | `60000` | 整体超时（ms） |

### 可重写方法
- `buildExtraContext(task)` → `Promise<string>`：返回值附加到 systemPrompt 末尾
- `formatUserMessage(task)` → `string`：将任务对象格式化为 user message

---

## agent_runner.js

### 设计目标
独立会话执行引擎，不复用主 session 的 messages 历史，避免 Agent 污染主对话上下文。

### 执行流程
```
runAgent(agent, task, onAgentEvent)
  ├─ resolveProviderConfig()      解析 baseUrl / apiKey / model
  ├─ buildToolDefinitions()       按 allowedTools 白名单过滤工具
  ├─ buildExtraContext()          构建 systemPrompt（含动态附加内容）
  ├─ 初始化独立 messages[]        [system, user]
  ├─ AbortController 启动整体超时
  └─ 工具循环（最多 maxTurns 轮）
       ├─ callApi() 非流式请求    stream: false
       ├─ finish_reason=stop → break，返回结果
       ├─ 有 tool_calls → executeToolCall() 逐一执行
       │     ├─ 二次白名单校验
       │     ├─ toolLoader.executeTool()
       │     └─ 追加 tool message 到 messages[]
       └─ 超 maxTurns → 强制结束
```

### onAgentEvent 事件格式
```javascript
// Agent 状态变化
{ type: 'agent_status', agent, status: 'running'|'done'|'error', taskId, message? }

// 工具调用开始
{ type: 'tool_call', tool, args, callId, state: 'executing' }

// 工具调用结束
{ type: 'tool_result', tool, callId, state: 'done'|'error', resultPreview? }
```

### 返回值
```javascript
{ result: string, turnsUsed: number, tokensUsed: number }
```

### 关键决策记录
- **非流式**：agent_runner 使用 `stream: false`，结果更稳定，便于工具循环控制
- **独立会话**：每次 `runAgent` 创建全新 messages[]，不共享主 session 历史
- **工具白名单二次校验**：防止模型幻觉调用未授权工具
- **Gemini 兼容**：检测 `generativelanguage.googleapis.com` 时改用 `x-goog-api-key` 请求头

---

## 影响范围

- 无破坏性改动，现有 `ai.js` / `tool_loader.js` / `config.js` 均未修改
- `agents/` 目录为独立新增，子类自行 `require` 后实例化
- 未注册到 Gateway 路由，仅作基础设施层使用

---

## 后续计划

- 在 `agents/` 下实现具体子类（如 `MemoryAgent`、`SearchAgent` 等）
- 由 `orchestrator.js` 根据意图分类路由到对应 Agent
- 考虑将 `onAgentEvent` 接入 WebSocket 推送，向前端实时展示 Agent 执行进度
