# 系统提示词加载顺序

> **最后更新时间**：2026-03-24  
> **为谁而写**：AI 协作伙伴  
> **用途**：理解 AMY 的 system prompt 如何组装，修改提示词时知道生效顺序

---

## 一、加载入口

- **文件**：`oct-gateway/ai.js` → `loadSystemPrompt(promptsDir)`
- **promptsDir**：来自 `config.PROMPTS_DIR`，默认 `docs/01_system_prompts`

---

## 二、加载流程

```
loadSystemPrompt(promptsDir)
    │
    ├─→ 尝试 Nocturne loadBootMemory (core://agent/... 等核心记忆)
    │       ├─ 成功 → buildSystemPrompt(bootMemory, 'nocturne', promptsDir)
    │       └─ 失败 → 读本地 MD 文件
    │
    └─→ 本地 MD 回退：
            读取顺序：SOUL.md, AGENTS.md, USER.md, MEMORY.md
            拼接后 → buildSystemPrompt(parts, 'local', promptsDir)
```

---

## 三、buildSystemPrompt 内部顺序

`buildSystemPrompt` 将以下内容按顺序拼接：

1. **bootMemory / 本地 MD 主体**（Nocturne 或 本地 4 个文件）
2. **CLARIFICATION_PROTOCOL.md**（若存在）
3. **adaptive-questioning-system.md**（若存在）
4. **skillAdapter.formatSkillsForPrompt()** — 扫描 `oct-gateway/skills/` 下 SKILL.md，注入 `<skills>` 段落

---

## 四、Nocturne 核心记忆 URI

启动时加载的 Nocturne 记忆节点（`loadBootMemory`）：

- `core://agent/identity`
- `core://agent/principles`
- `core://my_user`
- `core://my_user/profile`
- `core://agent/my_user`

（具体列表以 `memory.js` / Nocturne 配置为准）

---

## 五、本地文件说明

| 文件 | 内容 |
|------|------|
| SOUL.md | 核心人格、情绪感知、emoji 规范 |
| AGENTS.md | 调度规则、任务判断、错误恢复 |
| USER.md | 用户档案、偏好 |
| MEMORY.md | 动态记忆（Nocturne 同步写回，与 Nocturne 一致） |
| CLARIFICATION_PROTOCOL.md | 追问协议 |
| adaptive-questioning-system.md | 自适应提问系统 |

---

## 六、Skills 注入

`skill_adapter.js` 扫描 `oct-gateway/skills/`：

- 每个子目录或 SKILL.md 文件解析 YAML frontmatter（name、description）
- 合并为 `<skills>` 块追加到 system prompt 末尾
- Skills 是**描述性指令**，不是工具，AI 按描述执行

---

## 七、生效时机

- Gateway **启动时**加载一次
- 修改 MD 文件后需**重启 Gateway** 生效
- MEMORY.md 会在 Nocturne 同步时被覆盖

---

*提示词路径配置见 `oct-gateway/config.js` 的 `PROMPTS_DIR`。*
