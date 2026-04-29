# 2026-04-29 — Task 1：@testing-library/react 与 jsdom 测试环境

- 新增 devDependencies：`@testing-library/react`、`@testing-library/user-event`、 `jsdom`（Vitest `environment: 'jsdom'` 所需）。
- `vitest.config.ts`：`test.environment` 由 `node` 改为 `jsdom`。

_branch: `test/new-hooks-coverage`（待 Task 1 验收后提交）_
