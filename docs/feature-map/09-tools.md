# 第九层：工具系统

---

## 9.1 内置工具

| 项目 | 内容 |
|------|------|
| 做什么 | web_search、web_fetch、read_file、write_file、exec_command、**search_knowledge**（AI.library 知识检索） |
| 文件 | `oct-gateway/tools.js`、`oct-gateway/tools/ai_library.js` |
| 调用链 | AI 返回 tool_calls → ai.js executeTool() → tools.js 执行 → 结果返回 AI 继续生成 |
| 状态 | ✅ 正常 |

### search_knowledge（AI.library）

| 项目 | 内容 |
|------|------|
| 触发 | 用户询问音频/混音/母带/录音/声学等专业问题时，模型自动调用 |
| 参数 | `query`（必填）、`top_k`（可选，默认 3） |
| 返回 | `{ success, results, formatted, hint? }`，含 PDF 图标、相似度百分比、截断预览 |
| 缓存 | 内存缓存 10 次查询，5 分钟 TTL |

---

## 9.2 权限检查

| 项目 | 内容 |
|------|------|
| 做什么 | 检测危险命令（rm -rf、格式化、注册表修改等） |
| 文件 | `src/utils/permissionCheck.ts` |
| 状态 | ✅ 正常 |
