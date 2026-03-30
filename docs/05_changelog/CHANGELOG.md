# FEATURE_MAP 变更日志

| 日期 | 变更摘要 | 涉及文件 | 备注 |
|------|----------|----------|------|
| 2026-03-29 | **Phase 6：Agent 就绪** — Gateway 工具调用事件可视化，前端显示工具执行卡片 | oct-gateway/ai.js, oct-gateway/index.js, ChatTab.v2.tsx | onToolEvent 回调 + WebSocket tool 事件 |
| 2026-03-29 | **Phase 5：Viewport 锚定** — ScrollAnchor 视口控制器，用户消息顶置，AI 回复向下生长 | src/core/viewport/scrollAnchor.ts, ChatTab.v2.tsx | snapAndAnchor + reconcile + followBottom |
| 2026-03-29 | **P0 审计修复** — TurnPhase 冲突消除、ERROR/CANCELLED 状态、blockRouter ID 隔离、订阅者保护、空响应处理 | turnTypes.ts, turnFSM.ts, turnAdapter.ts, blockRouter.ts, streamRouter.ts, types.ts | 42→59 测试 |
| 2026-03-28 | **Phase 4：UI 集成** — ChatTab.v2 集成 TurnFSM + StreamRouter + BlockIngest，App.tsx 入口切换 | src/ui/chat/ChatTab.v2.tsx, src/core/blockIngest.ts, App.tsx | 打字机改 StreamRouter 16ms 批处理 |
| 2026-03-28 | **Phase 3：StreamRouter 流控制** — 8 状态流式状态机 + 16ms batch flush + TurnFSM 联动 | src/core/streamRouter/*.ts | IDLE→OPENING→OPEN→STREAMING→FLUSHING→COMPLETED→CLOSED |
| 2026-03-28 | **Phase 2：TurnFSM 状态机** — 12→14 阶段轮次状态机，替代 isStreaming+awaitingResponse 布尔组合 | src/core/turnFSM/*.ts | 严格白名单转换表 + 语义 API |
| 2026-03-28 | **Phase 1：ContentBlock 数据模型** — blockRouter + blockAdapter 适配层 | src/core/blockRouter.ts, blockAdapter.ts | 文本→ContentBlock[] 转换 |
| 2026-03-28 | **Phase 0：v2 迁移准备** — 核心类型定义、目录结构、ChatTab.v1 备份 | src/core/types.ts, src/core/, ChatTab.v1.tsx | 蓝图 v1.0 |
| 2026-03-27 | **v0.1.8 正式版发布** — 流式优化、工具集成、下载链接更新 | 全项目 | Windows/Mac/Linux 三平台 |
| 2026-03-26 | Chat UI 流式滚动热修复：顶部锚定、按需跟底、动态 spacer 收放、标题栏 portal 化 | ChatTab.tsx, ChatTab.css, App.tsx, TabBar.css | 详见 scroll-streaming-hotfix-2026-03-26.md |
| 2026-03-24 | OCT 握手协议：移除 OpenClaw ECDSA 签名，改为 token 认证 | electron/main.ts, oct-gateway/index.js | sendOctConnectRequest、params.auth.token |
| 2026-03-24 | 工具层重构：静态 tools.js → 动态 tool_loader + tools/*.js | tool_loader.js, tools/*.js, ai.js | 加文件即生效 |
| 2026-03-24 | Orchestrator：意图分类、后台任务派发 | orchestrator.js, index.js | 预留 Agent 路由 |
| 2026-03-24 | 后台任务队列：task_queue + worker，持久化、60s 超时 | task_queue.js, worker.js | tasks_runtime.json |
| 2026-03-24 | 修复长内容胶囊按钮渲染 bug、并发流取消、内存泄漏等 9 个问题 | optionBoxParser.ts, ChatTab.tsx, session.js, index.js | 详见 bugfix-report-2026-03-24.md |
| 2026-03-24 | 保险箱：vault_manager、vault_ops 工具、VaultPanel、IPC+HTTP 桥 | vault_manager.js, vault_ops.js, VaultPanel.tsx, main.ts, preload.ts | key normalize、userData 路径 |
| 2026-03-24 | 邮件工具：email_reader、email_sender、email_manager | tools/email_reader.js, email_sender.js, email_manager.js | imapflow、nodemailer，保险箱凭证 |
| 2026-03-24 | Orchestrator 邮件后台派发：查邮件、查验证码 | orchestrator.js | 触发词 + TASK_TOOL_MAP |
| 2026-03-24 | 流式心跳、零宽空格过滤、AGENTS 长对话管理 | ai.js, ChatTab.tsx, AGENTS.template.md | 防代理断连 |
| 2026-03-24 | 网络稳定性：代理绕过、fetchWithRetry、流中断截断、工具超时隔离 | ai.js, config.js | V2RayN 全局代理下 DashScope 直连 |
| 2026-03-24 | OpenClaw Skills：skill_adapter 解析 SKILL.md 注入系统提示词 | skill_adapter.js, ai.js | 非工具，按指令执行 |
| 2026-03-24 | http_request、image_gen 工具 | tools/http_request.js, tools/image_gen.js | 外部 API、通义万象图像 |
| 2026-03-24 | VaultPanel 抽屉：TabBar 内嵌、右侧滑入、深绿黑主题 | VaultPanel.tsx, TabBar.tsx, App.tsx | 替换右下角悬浮球 |
| 2026-03-20 | 停用自评系统，清理SOUL.md自动规则，强化用户反馈 | index.js, SOUL.md | 减少API消耗+稳定风格 |
