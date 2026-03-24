# 第九层：工具系统

> 最后更新：2026-03-24

---

## 9.1 动态工具加载

| 项目 | 内容 |
|------|------|
| 做什么 | 从 `oct-gateway/tools/` 目录扫描加载工具，支持热重载 |
| 文件 | `oct-gateway/tool_loader.js`、`oct-gateway/tools/*.js` |
| 调用链 | AI 返回 tool_calls → ai.js → toolLoader.executeTool() → tools/xxx.js 执行 → 结果返回 AI |
| 扩展方式 | 在 tools/ 下新增 `{ name, definition, execute }` 格式的 .js 文件，重启后生效 |
| 工具数量 | 约 25 个（含 vault、邮件、http_request、image_gen） |
| 状态 | ✅ 正常 |

---

### 9.1.1 保险箱与邮件工具

| 项目 | 内容 |
|------|------|
| 保险箱 | vault_manager.js 加密存储，key 自动 normalize（空格→下划线） |
| 调用入口 | 前端 VaultPanel → IPC invoke-gateway-tool → HTTP 127.0.0.1:18790/tool |
| email_reader | IMAP 读邮件，凭证格式 `{user, pass}`，支持 163/QQ/Gmail |
| email_sender | SMTP 发邮件，nodemailer，需 SMTP 授权码 |
| email_manager | 统计未读、标记已读、删除、移动、按主题搜索 |
| 后台派发 | orchestrator 触发词含「查邮件」「查验证码」→ Worker 异步执行 |

---

## 9.2 内置工具列表

| 工具名 | 说明 |
|--------|------|
| web_search | 搜索互联网（Brave/Tavily/DuckDuckGo 降级） |
| web_fetch | 获取指定 URL 网页内容 |
| read_file | 读取文件 |
| write_file | 写入文件 |
| exec_command | 执行 shell 命令 |
| memory_read | 读取 Nocturne 记忆 |
| memory_write | 写入 Nocturne 记忆 |
| memory_search | 搜索记忆 |
| time_inject | 时间注入 |
| tasks_read/add/update/delete | 任务看板 |
| task_add/done/delete/list | 按标题操作任务 |
| parking_add | 停车场 |
| search_knowledge | AI.library 知识检索 |
| **vault_ops** | 加密保险箱：status/unlock/lock/set/get/list/delete |
| **email_reader** | 读邮件（IMAP，需保险箱凭证） |
| **email_sender** | 发邮件（SMTP，需保险箱凭证） |
| **email_manager** | 邮件管理：count_unread/mark_read/delete/move/search |
| **http_request** | 通用 HTTP 请求：GET/POST/PUT/DELETE，对接第三方 API、获取实时数据 |
| **image_gen** | AI 图像生成：通义万象 wanx-v1，支持尺寸/风格，复用 DashScope API Key |

---

### 9.2.1 OpenClaw Skills 兼容层

| 项目 | 内容 |
|------|------|
| 做什么 | 解析 `oct-gateway/skills/` 下的 SKILL.md，将技能描述注入系统提示词（非注册为工具） |
| 文件 | `oct-gateway/skill_adapter.js` |
| 格式 | YAML frontmatter（name、description）+ Markdown 指令体；支持 bins 依赖检查 |
| 注入 | `formatSkillsForPrompt()` → `<skills>` 追加到 system prompt 末尾 |
| 状态 | ✅ 正常 |

---

## 9.3 权限检查

| 项目 | 内容 |
|------|------|
| 做什么 | 检测危险命令（rm -rf、格式化、注册表修改等） |
| 文件 | `src/utils/permissionCheck.ts` |
| 状态 | ✅ 正常 |
