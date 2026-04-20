# Changelog: 2026-04-18 — MAS Agent 团队初始化

> Branch: `feature/mas-agent-team`
> Status: CURRENT

## 变更摘要

正式激活 OCT MAS（Multi-Agent System）的 Agent 层，从"记录但不执行"升级为"真正路由并执行"。

---

## 新增文件

### `oct-gateway/agents/base_agent.js`
- 所有专职 Agent 的抽象基类
- 核心属性：`name`, `description`, `model`, `systemPrompt`, `allowedTools`, `maxTurns`, `timeoutMs`
- 可重写钩子：`buildExtraContext(task)`, `formatUserMessage(task)`

### `oct-gateway/agents/agent_runner.js`
- Agent 执行引擎（非流式 API，独立会话上下文）
- 工具白名单过滤（二次校验防幻觉）
- AbortController 整体超时保护
- `onAgentEvent` 事件推送：`agent_status`, `tool_call`, `tool_result`
- 返回：`{ result, turnsUsed, tokensUsed }`

### `oct-gateway/agents/coder.js`
- Coder Agent：代码生成、调试、架构建议、Cursor 提示词
- 工具白名单：`read_file`, `write_file`, `exec_command`, `web_search`, `web_fetch`, `read_document`
- maxTurns: 10，timeoutMs: 90000

### `oct-gateway/agents/writer.js`
- Writer Agent：内容创作（文章、脚本、文案、提纲）
- 工具白名单：`web_search`, `web_fetch`, `memory_read`, `canvas`
- maxTurns: 6，timeoutMs: 60000

### `oct-gateway/agents/researcher.js`
- Researcher Agent：信息调研、资料整理、对比分析
- 工具白名单：`web_search`, `web_fetch`, `memory_read`, `memory_search`, `read_document`, `canvas`
- maxTurns: 12，timeoutMs: 120000

---

## 修改文件

### `oct-gateway/orchestrator.js`

**之前**：`shouldDelegate=true` 时只记录日志，AMY 仍然处理所有消息。

**现在**：
1. 新增 `getAgentRegistry()` 懒加载注册表（Coder / Writer / Researcher）
2. 新增 `getAgentRunner()` 懒加载 agent_runner
3. 新增 `runDelegatedAgent(agentName, task, onEvent)` 异步执行专职 Agent
4. `dispatch()` 返回值新增 `agentResult` 字段：
   - `null` → AMY 直接处理
   - `{ result, turnsUsed, tokensUsed }` → Agent 执行完成
5. 开关：`config.ENABLE_AGENT_DISPATCH !== false`（默认开启）

### `oct-gateway/index.js`

1. **Agent 短路逻辑**（在 orchestrator.dispatch 之后、chatEngine.execute 之前）：
   - 若 `orchResult.agentResult` 非空，直接把 Agent 结果推给前端
   - 跳过 AMY 的 streamChat，节省 token，减少延迟
   - 结果同时写入 session history，保持对话连续性

2. **sendToolEvent 新增 agent_status 处理**：
   - `agent_status.running` → 推送 `agent-phase: agent_running`
   - `agent_status.done` → 推送 `agent-phase: thinking`（回到 AMY 阶段）

---

## 架构链路变化

```
用户消息
    ↓
orchestrator.dispatch()
    ├── shouldDelegate=false → 原有 AMY streamChat 链路（不变）
    └── shouldDelegate=true
            ↓
        runDelegatedAgent()
            ↓
        agent_runner.runAgent()
            ├── 构建独立 messages（system + user）
            ├── 工具白名单过滤
            ├── 非流式 API 工具循环（最多 maxTurns）
            └── 返回 { result, turnsUsed, tokensUsed }
            ↓
        index.js Agent 短路
            └── 直接推送结果给前端（跳过 AMY）
```

---

## 开关与配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `ENABLE_AGENT_DISPATCH` | `true`（未设置时默认开启） | 设为 `false` 可退回到纯记录模式 |
| `ENABLE_BACKGROUND_TASK_DISPATCH` | `false` | 原有后台工具任务派发，默认关闭 |

---

## 后续计划

- [ ] 前端 UI：显示"Coder Agent 正在工作..."徽章
- [ ] Nocturne 记忆：Agent 执行记录写入 `core://mas/agents/{name}/`
- [ ] 并发执行：多个 Agent 同时跑（任务队列扩展）
- [ ] 新 Agent：MediaAgent（图片生成 + 视频脚本）
