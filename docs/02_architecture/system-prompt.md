# 1.3 System Prompt 加载

> **最后更新**：2026-04-06 | **状态**：✅ 正常

---

## 做什么
启动时从 Nocturne 加载记忆，并结合本地提示词模板与用户人格配置拼接成 system prompt

## 文件
`oct-gateway/ai.js` → `loadSystemPrompt()`

## 调用链
```
Gateway 启动 → loadSystemPrompt(PROMPTS_DIR) → 尝试 Nocturne loadBootMemory 
→ 失败则读本地 MD 文件 → buildSystemPrompt 注入人格契约 / 模板替换 / skillAdapter.formatSkillsForPrompt()
```

## 运行时人格配置

- 配置来源：`userData/config.json`
- 字段：
  - `OCT_AI_NAME`
  - `OCT_USER_NAME`
  - `OCT_PERSONA_STYLE`
- 默认值：
  - `OpenClaw`
  - `用户`
  - `warm`

这意味着：

- 发布版默认人格是中性可发布的
- 私人化人格不应写死在代码和 seed memory 中
- 用户自己的 AI 名称、称呼、风格由设置面板决定

## 写到哪
同步写回 `MEMORY.md`（让文件和 Nocturne 保持一致）

## 验证方法
终端看到 `[AI] System prompt 加载完成，长度：XXXX`

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-04-06 | 新增“人格配置驱动”说明，system prompt 不再依赖写死的私人身份 |
| 2026-03-24 | 追加 OpenClaw Skills 注入 |
| 2026-03-20 | 初始拆分 |
