# Skills 目录结构 · OpenClaw 兼容层

> **最后更新时间**：2026-03-24  
> **为谁而写**：AI 协作伙伴  
> **用途**：新增/修改技能时了解 SKILL.md 格式与注入逻辑

---

## 一、目录位置

- **Gateway 侧**：`oct-gateway/skills/`
- **项目根**：`skills/`（若存在，可能与 oct-gateway 不同，以 config 为准）

`skill_adapter.js` 使用 `path.join(__dirname, 'skills')`，即 `oct-gateway/skills/`。

---

## 二、目录结构

```
oct-gateway/skills/
├── skill-name-1/      # 子目录形式
│   └── SKILL.md
├── skill-name-2/
│   └── SKILL.md
└── README.md          # 可选
```

或根目录直接放 `SKILL.md`（单技能场景）。

---

## 三、SKILL.md 格式

```markdown
---
name: 技能名称
description: 简短描述，会注入到系统提示词
user-invocable: true   # 可选，默认 true；false 表示仅内部使用
"bins": ["git", "node"]  # 可选，依赖的外部命令，会做存在性检查
---

这里是技能的详细说明，Markdown 格式。
会作为技能正文一并注入。
```

### YAML frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| name | 是 | 技能名称 |
| description | 是 | 简短描述 |
| user-invocable | 否 | 默认 true |
| bins | 否 | 依赖命令数组，如 `["git", "python3"]` |

---

## 四、注入逻辑

1. **加载**：`skill_adapter.loadSkills()` 扫描 `skills/` 目录
2. **解析**：读取 SKILL.md，解析 YAML + body
3. **bins 检查**：若声明 bins，检查命令是否存在，不存在则跳过该技能
4. **格式化**：`formatSkillsForPrompt()` 生成 `<skills>...</skills>` 块
5. **追加**：在 `buildSystemPrompt` 末尾追加到 system prompt

---

## 五、与工具的区别

| 对比项 | Skills | Tools |
|--------|--------|-------|
| 形式 | Markdown 描述 | JS 模块（name、definition、execute） |
| 注册 | 注入 system prompt | tool_loader 扫描 tools/ |
| 执行 | AI 按描述自行执行 | 模型发起 tool_calls，Gateway 执行 |
| 目录 | oct-gateway/skills/ | oct-gateway/tools/ |

Skills 不注册为 tool，AI 通过阅读描述来遵循技能，而非调用函数。

---

## 六、相关文件

| 文件 | 说明 |
|------|------|
| `oct-gateway/skill_adapter.js` | 加载、解析、formatSkillsForPrompt |
| `oct-gateway/ai.js` | buildSystemPrompt 中调用 skillAdapter.formatSkillsForPrompt() |

---

*Skills 兼容 OpenClaw 的 SKILL.md 格式，便于迁移或复用。*
