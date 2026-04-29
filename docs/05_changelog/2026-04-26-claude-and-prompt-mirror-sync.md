# 2026-04-26 Claude 上下文与提示词镜像同步

## 本次改动

1. 重写仓库根 `CLAUDE.md`，去掉过时目录与旧协作口径，对齐当前单人 + 多 AI 的实际工作方式。
2. 明确主文档区 / 归档区边界，避免 Claude Code 继续默认把 handoff、week plan、cursor task 等过程文档写入主区。
3. 更新 `docs/04_dev_guides/prompt-source-of-truth.md`，补充 2026-04-26 的镜像同步记录与镜像范围说明。
4. 将 `docs/01_system_prompts/` 中当前运行链路需要的提示词文件重新同步到 `resources/system_prompts/`。

## 影响

- Claude Code 读取到的仓库级上下文更接近当前实际结构。
- 提示词来源关系更清楚：`docs/01_system_prompts/` 仍是唯一源，`resources/system_prompts/` 只是运行时镜像。
- 后续若再次改动运行中的提示词正文，应继续同时更新镜像并补 changelog。

## 本次同步的镜像文件

- `AGENTS.md`
- `CLARIFICATION_PROTOCOL.md`
- `DIAGRAM_PROTOCOL.md`
- `OCT_PROTOCOL.md`
- `SOUL.md`
- `USER.md`
