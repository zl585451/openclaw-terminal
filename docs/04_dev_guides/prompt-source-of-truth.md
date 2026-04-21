# 提示词文件来源规范

> 最后更新: 2026-04-21

## 原则

- `docs/01_system_prompts/` 是唯一源（source of truth）
- `resources/system_prompts/` 是运行时镜像，由构建或同步流程生成
- 禁止直接修改 `resources/system_prompts/` 下的文件

## 当前状态

- 同步方式：手动
- 修改流程：先改 `docs/01_system_prompts/`，再手动复制到 `resources/system_prompts/`，最后一并提交
- 2026-04-21 对齐说明：`AGENTS.md` 与 `USER.md` 已先以 `resources/system_prompts/` 为当前运行真相回填到 `docs/01_system_prompts/`

## 未来计划

在 `scripts/` 下新增 `sync-prompts.js`，并在构建前自动执行同步。
