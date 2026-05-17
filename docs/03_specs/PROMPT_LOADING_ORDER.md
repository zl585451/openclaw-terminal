# 系统提示词加载顺序

> **最后更新时间**：2026-04-06  
> **为谁而写**：AI 协作伙伴  
> **用途**：理解 OCT 的 system prompt 如何组装，修改提示词时知道生效顺序

---

## 一、加载入口

- **文件**：`oct-gateway/ai.js` → `loadSystemPrompt(promptsDir)`
- **promptsDir**：来自 `config.PROMPTS_DIR`，默认 `docs/01_system_prompts`
- **人格配置来源**：`oct-gateway/config.js` → `config.persona`
  - `aiName`：默认 `OpenClaw`
  - `userName`：默认 `用户`
  - `style`：默认 `warm`
  - 配置值来自 Electron `userData/config.json`

---

## 二、加载流程

```
loadSystemPrompt(promptsDir)
    │
    ├─→ 尝试 Memory v2 loadBootMemory (core://agent/... 等核心记忆)
    │       ├─ 成功 → buildSystemPrompt(bootMemory, 'memory_v2', promptsDir)
    │       └─ 失败 → 读本地 MD 文件
    │
    └─→ 本地 MD 回退：
            读取顺序：SOUL.md, AGENTS.md, USER.md, MEMORY.md
            拼接后 → buildSystemPrompt(parts, 'local', promptsDir)
```

---

## 三、buildSystemPrompt 内部顺序

`buildSystemPrompt` 将以下内容按顺序拼接：

1. **核心身份与交流契约**（运行时生成，最高优先级）
2. **SOUL.md 注入块**（先做 `{{AI_NAME}} / {{USER_NAME}}` 模板替换）
3. **AGENTS.md 注入块**（先做模板替换）
4. **bootMemory / 本地 MD 主体**（Memory v2 或 本地 4 个文件）
5. **CLARIFICATION_PROTOCOL.md**（若存在）
6. **adaptive-questioning-system.md**（若存在）
7. **DIAGRAM_PROTOCOL.md**（若存在）
8. **skillAdapter.formatSkillsForPrompt()** — 扫描 `oct-gateway/skills/` 下 SKILL.md，注入 `<skills>` 段落

### 重要说明：人格已改为“产品默认 + 用户可配置层”

- 发布版不应再把 `AMY / 少爷` 这类私人设定写死进运行链路
- 运行时的 AI 名称、用户称呼、语气强度，统一来自设置中的人格配置
- 模板文件中允许保留 `{{AI_NAME}}`、`{{USER_NAME}}` 占位符，但必须依赖运行时替换

---

## 四、核心记忆 URI

启动时加载的 Memory v2 核心记忆节点（`loadBootMemory`）：

- `core://agent/identity`
- `core://agent/principles`
- `core://my_user`
- `core://my_user/profile`
- `core://agent/my_user`

（具体列表以 `memory.js` 为准）

---

## 五、本地文件说明

| 文件 | 内容 |
|------|------|
| SOUL.md | 核心人格、情绪感知、emoji 规范 |
| AGENTS.md | 调度规则、任务判断、错误恢复 |
| USER.md | 用户档案、偏好 |
| MEMORY.md | 动态记忆（随当前记忆主链同步更新） |
| CLARIFICATION_PROTOCOL.md | 追问协议 |
| adaptive-questioning-system.md | 自适应提问系统 |
| DIAGRAM_PROTOCOL.md | 图形输出协议（结构图、聊天区小图、Canvas 路由） |

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
- 修改人格设置（AI 名称 / 用户称呼 / 风格）后也需**重启 Gateway**，设置面板已自动处理
- MEMORY.md 会在记忆同步时被覆盖

---

*提示词路径配置见 `oct-gateway/config.js` 的 `PROMPTS_DIR`。*
