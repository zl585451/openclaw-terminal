# FEATURE_MAP 变更日志

| 日期 | 变更摘要 | 涉及文件 | 备注 |
|------|----------|----------|------|
| 2026-04-10 | GitHub 首页 README 更新为发布版口径：突出 `v0.2.0` 能力、跨平台下载链接、首次启动 API Key 引导和本地开发入口 | `README.md` | 仓库首页更适合作为产品主页和下载入口 |
| 2026-04-10 | Canvas 画图调用兜底：对命中画图意图的请求强制优先 `canvas` 工具；当底层模型把 `{tool => "canvas"...}` 伪调用吐成普通文本时，Gateway 会自动解析并转成真实 tool call，同时在最终回复中清洗残留 `TOOL_CALL` 文本 | `oct-gateway/index.js`, `oct-gateway/runtime/chatEngine.js`, `oct-gateway/ai.js`, `oct-gateway/cot_sanitize.js` | 修复客户端“AI 会说要画图，但实际没有落成 Canvas”的问题 |
| 2026-04-10 | 发布版补齐 `oct-gateway` 打包与启动链路：将 Gateway 及其 `node_modules` 作为安装包资源带入，发布版改用 Electron 自带运行时拉起 Gateway；设置页在 provider 清单缺失时回退到内置服务商列表，避免安装包中出现“无法启动 Gateway / 服务商选项丢失” | `package.json`, `electron/main.ts`, `src/hooks/settings/useApiKeys.ts` | 修复 0.2.0 本地安装后启动失败与连接配置残缺 |
| 2026-04-10 | 0.2.0 发布流程调整：版本号升至 `0.2.0`；保留本地 Windows 打包，GitHub Actions 的 tag 发布默认用于 `macOS` 与 `Linux` 产物，避免与本地 Windows 安装包重复 | `package.json`, `package-lock.json`, `.github/workflows/build-windows.yml` | 面向本地 Windows + CI 跨平台混合发布 |
| 2026-04-03 | ChatTab.v2.tsx 完整拆分：6 步重构，~3000行 → 729行，拆出 useMessages/useScrollManager/useFileAttachment/useTimers/useContextMenu hooks 及 MessageList/ChatInput/ContextMenu 组件 | `src/hooks/useMessages.ts`, `src/hooks/useScrollManager.ts`, `src/hooks/useFileAttachment.ts`, `src/hooks/useTimers.ts`, `src/hooks/useContextMenu.ts`, `src/components/ContextMenu.tsx`, `src/ui/chat/MessageList.tsx`, `src/ui/chat/ChatInput.tsx`, `src/ui/chat/ChatTab.v2.tsx` | 详见 `docs/05_changelog/2026-04-03-ChatTab拆出useFileAttachment-useTimers-useContextMenu.md` |
| 2026-04-03 | 流式打字机丝滑优化：Gateway 新增 createStreamSmoother（Intl.Segmenter 词边界分词），WebSocket 改用 smoother；恢复 useTypewriter RAF 逐字动画（MAX=6/BATCH=1/追赶提前） | `oct-gateway/index.js`, `src/hooks/useTypewriter.ts`, `oct-gateway/config.json`, `oct-gateway/config.js` | 用户"从容/细读"设置生效；详见 `docs/05_changelog/2026-04-03-流式打字机丝滑优化.md` |
| 2026-04-10 | 发布前配置收口：移除仓库默认 API Key，代理策略改为仅为本地服务设置 NO_PROXY，避免发布版强制全量直连 | `oct-gateway/config.json`, `electron/main.ts`, `oct-gateway/config.js`, `oct-gateway/mcp/client.js`, `oct-gateway/README.md` | 面向产品打包的默认安全配置 |
| 2026-04-10 | 配置分层文档完善：补充 `config.example.json`、仓库默认配置 / 本地开发配置 / 用户运行时配置三层说明 | `oct-gateway/config.example.json`, `oct-gateway/README.md`, `docs/02_architecture/config-system.md`, `docs/04_dev_guides/OCT 快速上手指南.md` | 发布安全与本地持续开发可并存 |
| 2026-04-10 | Mermaid 容错与聊天显示补强：渲染失败时自动清洗箭头/emoji/HTML 换行后重试，聊天区统一允许展示已返回的 CoT 区块 | `src/components/canvas/MermaidRenderer.tsx`, `src/ui/chat/ChatTab.v2.tsx` | 详见 `docs/05_changelog/2026-04-10-Mermaid容错与聊天显示补强.md` |
| 2026-04-10 | MiniMax M2.7 配置对齐官网：Gateway 支持 `.env.local`，默认模型切到 `MiniMax-M2.7`，并在设置页/测试连接中提示使用 Token Plan API Key；同时取消对 MiniMax 文本模型的原生视觉误判 | `oct-gateway/config.js`, `oct-gateway/config.json`, `oct-gateway/config.example.json`, `oct-gateway/providers.js`, `oct-gateway/services/imageService.js`, `electron/main.ts`, `src/ui/settings/tabs/ConnectionTabView.tsx` | 对齐 MiniMax Token Plan 最新接入方式 |
| 2026-04-10 | MiniMax Music Studio 初版：打开 `MUSIC` 标签页，新增 MiniMax 音乐生成 IPC，并把 `SoundTab` 重构为可直接生成/试听/下载歌曲的工作台；后续再把创作区对齐为 Suno 风格的 `Simple / Advanced` 双模式，并接入歌词自动生成回填、男声/女声/对唱/纯音乐预设，以及最近生成历史的本地持久化 | `src/components/TabBar.tsx`, `src/components/SoundTab.tsx`, `src/styles/SoundTab.css`, `electron/main.ts`, `electron/preload.ts`, `src/vite-env.d.ts` | 详见 `docs/05_changelog/2026-04-10-MiniMax-Music-Studio-初版.md` |
| 2026-03-30 | ChatTab.v2 四步模块化：Markdown 预处理、markdown 组件、Gateway hook、WebSocket hook；Gateway ToolLoader 跳过 shared/ai_library 辅助脚本 | `markdownPreprocess.ts`, `markdownComponents.tsx`, `useGateway.ts`, `useWebSocket.ts`, `ChatTab.v2.tsx`, `oct-gateway/tool_loader.js` | 详见 `docs/_archive/historical_refactors/REFACTOR_4STEP_CHATTAB.md`；主文件约 3578→2985 行 |
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
