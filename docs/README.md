# Docs Index

> Status: CURRENT  
> Last Updated: 2026-04-08  
> Purpose: 统一说明 `docs/` 的用途、入口顺序和归档规则。

---

## 先看这里

如果你是工程师 AI、Cursor、Claude 或小模型，不要直接从 `docs/` 根目录随便挑文件看。

请按这个顺序：

1. `00_ai_entry/README.md`
2. 对应问题类型的入口文档
3. 当前架构 / 协议 / 开发规范
4. 最后才看历史 review、旧重构稿、旧迁移文档

---

## 当前目录职责

| 目录 / 文件 | 用途 | 建议 |
|---|---|---|
| `00_ai_entry/` | AI 排错入口层 | 当前优先 |
| `01_system_prompts/` | 运行中的 AI 系统提示词 | 当前优先，不要随意挪动 |
| `02_architecture/` | 当前架构与模块说明 | 当前优先 |
| `03_specs/` | 协议、接口、规范 | 当前优先 |
| `04_dev_guides/` | 开发与维护规则 | 当前优先 |
| `05_changelog/` | 每次改动的记录 | 当前优先 |
| `06_release/` | 发布资料 | 参考 |
| `07_research/` | 调研资料 | 参考 |
| `06_features/` | 功能方案资料 | 参考 |
| `test-results/` | 测试记录 | 参考 |
| `_archive/` | 历史资料、旧方案、旧 review | 非当前入口 |

---

## 已归档的内容

以下内容已从 `docs/` 根目录移入 `_archive/`，避免误导 AI 当作当前实现：

- `FULL_PROJECT_REVIEW.md`
- `REFACTOR_4STEP_CHATTAB.md`
- `REFACTOR_STEP1_USE_TYPEWRITER.md`
- `CANVAS_UPGRADE_PLAN.md`
- `08_for_claude/`

---

## 维护规则

- 当前实现发生变化时，先更新 `00_ai_entry/` 对应入口文档
- 如果链路或职责变化，再更新 `02_architecture/` / `03_specs/`
- 每次改动都追加 `05_changelog/`
- 历史方案不要继续放在 `docs/` 根目录

---

## 归档入口

归档资料见：

- `_archive/README.md`

