# OCT Gateway Phase 6：Feature Flag 验证 & Legacy 收口

> 版本：v1.0 | 日期：2026-04-09
> 前置：Phase 1-5 已完成，新模块就绪但 Flag 均为 OFF
> 目标：逐个验证新路径 → 全量切换 → 删除旧代码 → index.js 从 1319 行降至 ~50 行

---

## 当前状态

```
config.json 中无 refactorFlags 字段 → 三个 Flag 全部 OFF → 所有请求走旧路径
新模块状态：已部署但休眠

index.js     1319 行  （目标 ~50）
ai.js        1125 行  （目标 ~200）
legacyTransport.js  194 行  （目标 删除）
```

---

## Step 1：开启 USE_NEW_ROUTER

**改动：** config.json 添加 `refactorFlags.USE_NEW_ROUTER: true`

**影响范围：**
- `gateway/router.js` 接管 method 路由（chat.send / sessions.list）
- `gateway/slash.js` 接管 Slash 命令
- Transport 和 ChatEngine 不受影响（仍走旧路径）

**验证清单：**
- [ ] 普通文本消息 → 正常流式回复
- [ ] `/model` 命令 → 显示当前模型
- [ ] `/status` 命令 → 显示状态
- [ ] `/new` 命令 → 新建会话
- [ ] `/help` 命令 → 显示帮助
- [ ] `sessions.list` → 返回会话列表
- [ ] 未知 method → 返回错误

**回退：** 删除 config.json 中的 `USE_NEW_ROUTER` 即可

---

## Step 2：开启 USE_NEW_CHAT_ENGINE

**前置：** Step 1 验证通过

**改动：** config.json 添加 `refactorFlags.USE_NEW_CHAT_ENGINE: true`

**影响范围：**
- `runtime/chatEngine.js` 接管对话循环
- `runtime/contextBuilder.js` 接管上下文组装
- `runtime/streamController.js` 接管流控
- `runtime/toolLoop.js` 接管工具调用
- `services/postProcessor.js` 接管回复后处理

**验证清单：**
- [ ] 普通对话 → 流式推送正常、完整回复
- [ ] 带图片消息 → inline vision / fallback 路由正确
- [ ] 工具调用 → tool_call 卡片 → tool_result → 继续对话
- [ ] Canvas 事件 → create/update 正确推送
- [ ] 流中断 → 发送新消息取消旧流
- [ ] 后处理 → Nocturne 队列日志确认 5 个任务入队
- [ ] 长对话 → 上下文截断正常（>12 轮）
- [ ] agent-phase 事件 → thinking/tool_executing/idle 正确推送

**回退：** 删除 `USE_NEW_CHAT_ENGINE` 即可

---

## Step 3：开启 USE_NEW_TRANSPORT

**前置：** Step 1 + Step 2 验证通过

**改动：** config.json 添加 `refactorFlags.USE_NEW_TRANSPORT: true`

**影响范围：**
- `transport/ws.js` 替代 index.js 内联的 WebSocket 服务器
- `transport/http.js` 替代 index.js 内联的 HTTP 服务器
- `transport/legacyTransport.js` 不再使用

**验证清单：**
- [ ] WebSocket 连接 → 认证握手正常
- [ ] 多客户端并发 → 互不干扰
- [ ] 客户端断开重连 → 优雅处理
- [ ] HTTP POST /tool → 工具执行正常
- [ ] HTTP GET /mcp/status → MCP 状态返回
- [ ] HTTP POST /mcp/server → 添加 MCP 服务器
- [ ] HTTP DELETE /mcp/server/:name → 删除 MCP 服务器
- [ ] HTTP GET / → Mobile 页面正常
- [ ] task-board-update 广播 → 正常推送
- [ ] 优雅关闭（SIGINT）→ 连接正确关闭

**回退：** 删除 `USE_NEW_TRANSPORT` 即可

---

## Step 4：删除旧路径 & Legacy 清理

**前置：** 三个 Flag 全部验证通过，稳定运行 ≥ 1 天

**执行清单：**

### 4.1 index.js 瘦身
- [ ] 删除 `handleChatRequest()` 中的旧路径（`if (!USE_NEW_CHAT_ENGINE)` 分支）
- [ ] 删除 `handleTransportMessage()` 中的旧路由逻辑
- [ ] 删除 `!USE_NEW_TRANSPORT` 分支（legacy 启动逻辑）
- [ ] 删除所有 `REFACTOR_FLAGS` 判断，新路径成为唯一路径
- [ ] 将 index.js 重构为纯启动入口（初始化依赖 → 启动 Transport）

### 4.2 文件清理
- [ ] 删除 `transport/legacyTransport.js`
- [ ] 清理 `ai.js` 中已被 `runtime/contextBuilder.js` 替代的上下文逻辑
- [ ] 清理 `ai.js` 中已被 `runtime/providerRouter.js` 替代的路由逻辑

### 4.3 配置清理
- [ ] 删除 `config.js` 中的 `REFACTOR_FLAGS` 定义
- [ ] 删除 `config.json` 中的 `refactorFlags` 字段

### 4.4 目标行数验证
- [ ] `index.js` ≤ 80 行
- [ ] `ai.js` ≤ 300 行
- [ ] `legacyTransport.js` 已删除

---

## 风险控制

| 原则 | 做法 |
|------|------|
| **逐个开启** | 每次只开一个 Flag，验证通过再开下一个 |
| **即时回退** | 任何问题删除对应 Flag 值即可恢复 |
| **日志对照** | 开启前后对比 gateway log，确认无异常 |
| **不跳步** | 必须按 Router → Engine → Transport 顺序 |

---

## 最终状态

```
oct-gateway/
├── index.js              (~50 行)   ← 纯启动入口
├── ai.js                 (~200 行)  ← 纯 HTTP 流式调用
├── transport/
│   ├── ws.js             (180 行)   ← WebSocket 服务器
│   ├── http.js           (66 行)    ← HTTP 服务器
│   ├── httpRoutes.js     (154 行)   ← HTTP 路由处理
│   ├── connection.js     (27 行)    ← 连接适配
│   ├── helpers.js        (49 行)    ← 传输辅助
│   └── protocol.js       (16 行)    ← 协议工具
├── gateway/
│   ├── router.js         (49 行)    ← 消息路由
│   ├── slash.js          (171 行)   ← Slash 命令
│   └── eventBus.js       (25 行)    ← 事件总线
├── runtime/
│   ├── chatEngine.js     (64 行)    ← 对话主循环
│   ├── contextBuilder.js (314 行)   ← 上下文组装
│   ├── contextHelpers.js (32 行)    ← 辅助函数
│   ├── providerRouter.js (41 行)    ← 模型路由
│   ├── streamController.js (39 行)  ← 流控
│   ├── streamUtils.js    (102 行)   ← 流式平滑
│   └── toolLoop.js       (136 行)   ← 工具循环
├── services/
│   ├── postProcessor.js  (172 行)   ← 后处理链
│   ├── imageService.js   (72 行)    ← 图片服务
│   ├── opsScheduler.js   (118 行)   ← 定时任务
│   └── startupHealth.js  (45 行)    ← 启动健康检查
└── [tools/, mcp/, config.js, ...保持不变]
```
