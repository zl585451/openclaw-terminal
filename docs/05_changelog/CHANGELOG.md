# FEATURE_MAP 变更日志

| 日期 | 变更摘要 | 涉及文件 | 备注 |
|------|----------|----------|------|
| 2026-03-30 | ChatTab.v2 四步模块化：Markdown 预处理、markdown 组件、Gateway hook、WebSocket hook；Gateway ToolLoader 跳过 shared/ai_library 辅助脚本 | `markdownPreprocess.ts`, `markdownComponents.tsx`, `useGateway.ts`, `useWebSocket.ts`, `ChatTab.v2.tsx`, `oct-gateway/tool_loader.js` | 详见 `docs/REFACTOR_4STEP_CHATTAB.md`；主文件约 3578→2985 行 |
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
