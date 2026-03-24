# 第八层：提示词系统

> 最后更新：2026-03-24

---

| 文件 | 职责 | 更新频率 |
|------|------|----------|
| `SOUL.md` | AMY 核心人格、沟通风格、禁止行为 | 低（人格变更时） |
| `AGENTS.md` | 调度规则、三角协作分工 | 中（流程优化时） |
| `USER.md` | 用户偏好档案 | 中（AMY 自动更新） |
| `MEMORY.md` | 长期记忆（启动时从 Nocturne 同步） | 高（每次启动自动覆写） |
| `OCT_PROTOCOL.md` | 前端交互协议 | 高（界面迭代时） |

---

## OpenClaw Skills 注入

| 项目 | 内容 |
|------|------|
| 做什么 | 启动时扫描 `oct-gateway/skills/`，解析 SKILL.md 的 YAML frontmatter，生成 `<skills>` 块追加到 system prompt 末尾 |
| 文件 | `oct-gateway/skill_adapter.js`、`oct-gateway/ai.js` buildSystemPrompt |
| 格式 | `<skill><n>技能名</n><description>描述</description><location>路径</location></skill>` |
| 效果 | AMY 根据用户请求匹配技能描述，按 SKILL.md 指令执行（非工具调用） |

---

## 注意事项

**存在两套目录**：
- `docs/01_系统提示词/`
- `docs/01_system_prompts/`

`config.PROMPTS_DIR` 决定用哪套，需确认并统一。
