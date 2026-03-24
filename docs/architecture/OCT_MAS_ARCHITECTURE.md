# OCT MAS 架构设计文档
> Multi-Agent System · 版本 1.0 · 2026-03-24  
> 作者：Claude × Zilong  
> 定位：OCT Gateway 的下一个形态，完全自主，不依赖任何第三方生态链

---

## 一、核心设计哲学

**一句话总结**：AMY 是前台接待，负责理解和调度；各专职 Agent 是后台专家，负责执行；Nocturne 是所有人的共享大脑。

**三个原则**：
1. **不重复造轮子** — 现有的 oct-gateway 已经有 WebSocket 通信、Nocturne 记忆、Session 管理，MAS 在这个基础上叠加，不推翻重写
2. **渐进式演化** — 不是一次性切换，而是每次加一个 Agent、一批工具，系统始终可用
3. **完全自主** — 所有协议、工具、调度逻辑都在自己的代码里，没有对 OpenClaw 或任何第三方的隐性依赖

---

## 二、整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                   OCT Frontend (Electron)                 │
│              React UI · WebSocket Client                  │
└───────────────────────────┬─────────────────────────────┘
                            │ WebSocket (OCT 自有协议)
                            │ ws://127.0.0.1:18789
┌───────────────────────────▼─────────────────────────────┐
│                    oct-gateway (Node.js)                  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │               LAYER 1: 连接层（已有）                │ │
│  │  WebSocket Server · Session管理 · Token认证          │ │
│  └─────────────────────┬───────────────────────────────┘ │
│                        │                                  │
│  ┌─────────────────────▼───────────────────────────────┐ │
│  │            LAYER 2: Orchestrator（新增）              │ │
│  │                   AMY 主控层                          │ │
│  │                                                       │ │
│  │  接收用户消息 → 意图分析 → 决定：                    │ │
│  │  ① 自己直接回复（对话/情感/解释）                    │ │
│  │  ② 调用工具后回复（搜索/文件/记忆）                  │ │
│  │  ③ 派发给专职 Agent（复杂/专业任务）                 │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │ 派发指令                            │
│  ┌──────────────────▼──────────────────────────────────┐ │
│  │            LAYER 3: 专职 Agent 池（新增）             │ │
│  │                                                       │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐          │ │
│  │  │  Coder    │ │  Writer   │ │ Researcher│  ...      │ │
│  │  │ 代码专家  │ │ 内容创作  │ │ 信息研究  │          │ │
│  │  └───────────┘ └───────────┘ └───────────┘          │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │ 调用                                │
│  ┌──────────────────▼──────────────────────────────────┐ │
│  │            LAYER 4: 工具层（扩展现有）                │ │
│  │                                                       │ │
│  │  tools/                                               │ │
│  │  ├── web_search.js   ← 已有                          │ │
│  │  ├── web_fetch.js    ← 已有                          │ │
│  │  ├── file_ops.js     ← 已有                          │ │
│  │  ├── content_gen.js  ← 新增：内容生成工具            │ │
│  │  ├── image_gen.js    ← 新增：图片生成                │ │
│  │  └── [任意扩展]      ← 热加载，加文件就生效          │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                     │
└─────────────────────┼───────────────────────────────────┘
                      │ HTTP REST
┌─────────────────────▼───────────────────────────────────┐
│              Nocturne Memory (共享大脑)                   │
│         所有 Agent 共享同一个记忆空间                     │
│  core://agent/  · core://my_user/  · core://mas/         │
└─────────────────────────────────────────────────────────┘
```

---

## 三、各层详细设计

### Layer 2：AMY Orchestrator（核心新增）

**文件**：`oct-gateway/orchestrator.js`

AMY 在每次收到用户消息时，执行三步判断：

```
用户消息
    ↓
[步骤1] 意图分类
    ├── 对话类  → AMY 直接回复，不派发
    ├── 工具类  → AMY 调用工具后自己回复
    └── 专业类  → 派发给对应 Agent
          ↓
[步骤2] 如果派发：选择 Agent
    ├── 代码/bug/技术问题    → Coder Agent
    ├── 写文章/脚本/文案     → Writer Agent
    ├── 搜索/调研/整理信息   → Researcher Agent
    └── 视频/图片/多媒体     → Media Agent（未来）
          ↓
[步骤3] Agent 执行完成
    → 结果返回给 AMY
    → AMY 整理后发给用户（用户感知不到切换）
```

**关键原则**：用户永远只和 AMY 对话，Agent 切换对用户透明。

---

### Layer 3：专职 Agent 定义

每个 Agent 是一个配置对象，定义在 `oct-gateway/agents/` 目录下：

```
oct-gateway/agents/
├── coder.js       ← 代码专家
├── writer.js      ← 内容创作
├── researcher.js  ← 信息研究
└── [未来扩展]
```

**每个 Agent 文件的结构**：

```javascript
// agents/coder.js 示例结构
module.exports = {
  name: 'Coder',
  description: '负责代码生成、调试、架构建议',
  
  // 触发条件（AMY 根据这个判断要不要派发）
  triggers: ['代码', 'bug', '报错', 'Cursor提示词', '怎么实现'],
  
  // 这个 Agent 用什么模型（可以和 AMY 不同）
  model: 'qwen-coder-plus',
  
  // 这个 Agent 的专属系统提示词
  systemPrompt: `你是 OCT 的代码专家助手...`,
  
  // 这个 Agent 能用哪些工具
  allowedTools: ['read_file', 'write_file', 'exec_command', 'web_search'],
};
```

---

### Layer 4：动态工具加载系统

**文件**：`oct-gateway/tool_loader.js`（新增）

**现在的问题**：`tools.js` 是静态的，加新工具需要改代码。

**目标**：`tools/` 目录下放一个 `.js` 文件，重启后自动生效。

```
oct-gateway/tools/
├── web_search.js    → 工具名：web_search
├── web_fetch.js     → 工具名：web_fetch
├── read_file.js     → 工具名：read_file
├── write_file.js    → 工具名：write_file
└── exec_command.js  → 工具名：exec_command
```

**每个工具文件的统一接口**：

```javascript
// tools/web_search.js 示例结构
module.exports = {
  name: 'web_search',
  description: '搜索互联网获取最新信息',
  parameters: {
    query: { type: 'string', description: '搜索关键词', required: true }
  },
  execute: async ({ query }) => {
    // 实际执行逻辑
    return { result: '...' };
  }
};
```

---

## 四、Nocturne 记忆空间规划

MAS 需要新增专属的记忆路径，和现有路径平行，不冲突：

```
core://
├── agent/          ← 已有：AMY 的身份和规则
├── my_user/        ← 已有：用户信息和偏好
├── mas/            ← 新增：MAS 专属空间
│   ├── agents/
│   │   ├── coder/    → Coder Agent 的运行记录
│   │   ├── writer/   → Writer Agent 的运行记录
│   │   └── researcher/
│   ├── tasks/
│   │   ├── active/   → 当前运行中的任务
│   │   └── history/  → 历史任务记录
│   └── tools/
│       └── registry  → 工具注册表（运行时动态写入）
```

**好处**：AMY 可以读 `core://mas/tasks/active` 知道有哪些 Agent 正在工作，实现真正的多 Agent 并发感知。

---

## 五、通信协议（Agent 间）

Agent 之间不直接通信，都通过 Orchestrator 中转。消息格式：

```javascript
// Orchestrator → Agent 的派发格式
{
  taskId: 'task-1234',           // 任务唯一ID
  from: 'AMY',                   // 来自谁
  to: 'Coder',                   // 派给谁
  userContext: '用户原始消息',    // 用户说了什么
  instruction: '请帮我生成...',  // AMY 的具体指令
  sessionKey: 'main',            // 哪个会话
  allowedTools: ['read_file'],   // 允许用的工具
}

// Agent → Orchestrator 的返回格式
{
  taskId: 'task-1234',
  agentName: 'Coder',
  status: 'done',               // done / error / need_clarify
  result: '执行结果内容',
  tokensUsed: 1234,
}
```

---

## 六、实施路线图

### 阶段 0（已完成）✅
- OCT Gateway 基础通信
- AMY 单 Agent 对话
- Nocturne 记忆系统
- 清除 OpenClaw 协议残留

### 阶段 1：工具层升级（已完成）✅ 2026-03-24
**目标**：把现有的 `tools.js` 重构为动态目录加载

- [x] 创建 `oct-gateway/tools/` 目录
- [x] 把现有工具拆分成独立文件（19 个工具）
- [x] 写 `tool_loader.js`（扫描目录，自动注册）
- [x] 验证：加一个新工具文件，重启后 AMY 能用

### 阶段 2：Orchestrator（已完成）✅ 2026-03-24
**目标**：AMY 能判断任务类型并派发

- [x] 写 `orchestrator.js`（意图分类逻辑）
- [x] 在 `index.js` 的 `chat.send` 里接入 Orchestrator
- [x] 后台任务派发（task_queue + worker）
- [x] 验证：说「帮我搜索一下今天的AI新闻」，日志能看到派发记录

### 阶段 3：第一个专职 Agent（约 2 天）
**目标**：Coder Agent 上线

- [ ] 写 `agents/coder.js`
- [ ] 配置独立的 system prompt
- [ ] 接入工具权限控制
- [ ] 验证：Cursor 提示词生成任务能正确路由到 Coder

### 阶段 4：Writer Agent + Media Agent（视需求）
- [ ] `agents/writer.js` — 内容创作专家
- [ ] `agents/researcher.js` — 信息研究专家
- [ ] 视频脚本、图文内容生成能力

### 阶段 5：MAS 付费层（长期）
- [ ] 多 Agent 并发执行
- [ ] 任务队列和进度追踪
- [ ] 前端 MAS 控制面板（用户能看到 Agent 在做什么）
- [ ] API 对外开放（OCT 生态链基础）

---

## 七、与现有代码的关系

| 现有文件 | MAS 后的角色 | 变化 |
|---------|------------|------|
| `index.js` | 连接层，不变 | 加一行：消息流经 Orchestrator |
| `ai.js` | AMY 的 AI 调用引擎 | 复用，Agent 也用这个调用 API |
| `tools.js` | 已目录化替代 | 拆分为 `tools/` 目录 + `tool_loader.js` |
| `session.js` | Session 管理，不变 | 无需修改 |
| `memory.js` | 记忆访问，不变 | 无需修改 |
| `hypothesis.js` | AMY 的前置思考 | 保留，作为 Orchestrator 的一部分 |
| `self_eval.js` | AMY 的自我评估 | 保留，未来也给 Agent 用 |

**新增文件**：
- `orchestrator.js` — Orchestrator 核心（意图分类、后台任务派发）
- `tool_loader.js` — 工具目录加载器
- `task_queue.js` — 后台任务持久化
- `worker.js` — 异步执行器
- `agents/*.js` — 各专职 Agent（阶段 3 待建）

---

## 八、风险和注意事项

**风险1：Token 消耗翻倍**
每次 Agent 调用都是一次独立的 API 请求。Orchestrator 自己也要消耗 token 来判断。
→ 缓解方案：意图分类用轻量 prompt（qwen-turbo），只有执行时才用重模型

**风险2：响应延迟增加**
多一层 Orchestrator 判断，理论上多 500-1000ms。
→ 缓解方案：简单对话直接跳过 Orchestrator，只有「派发」路径才走

**风险3：Agent 之间的结果质量不一**
不同 Agent 用不同 system prompt，可能回复风格不统一。
→ 缓解方案：所有 Agent 的结果都经过 AMY 整理后再发给用户，用户体验统一

---

## 九、第一步行动清单

明确下一步要干什么，按顺序执行：

```
① 创建 oct-gateway/tools/ 目录结构
② 把 tools.js 里的工具逐个拆出来
③ 写 tool_loader.js 自动扫描注册
④ 修改 ai.js 从 tool_loader 取工具而不是 tools.js
⑤ 测试：加一个假工具文件，看 AMY 能不能调用
```

这一步完成后，整个工具层就是「插件化」的了，后续 Agent 要用什么工具，加文件就好。

---

*文档由 Claude 生成 · 2026-03-24*  
*最近更新：阶段 1、2 已完成，工具目录实际结构见 oct-gateway/tools/*
