# 第九层：工具系统

> 最后更新：2026-03-20

---

## 9.1 内置工具

| 项目 | 内容 |
|------|------|
| 做什么 | web_search、web_fetch、read_file、write_file、exec_command |
| 文件 | `oct-gateway/tools.js` |
| 调用链 | AI 返回 tool_calls → ai.js executeTool() → tools.js 执行 → 结果返回 AI 继续生成 |
| 状态 | ✅ 正常 |

---

## 9.2 权限检查

| 项目 | 内容 |
|------|------|
| 做什么 | 检测危险命令（rm -rf、格式化、注册表修改等） |
| 文件 | `src/utils/permissionCheck.ts` |
| 状态 | ✅ 正常 |
