# 2026-04-29 — 新 Hook 单元测试（执行计划收官）

本轮为 `src/hooks/` 下新建 hook 补齐 Vitest 覆盖（`@testing-library/react` + `renderHook`，Vitest `environment: 'jsdom'`）。

## 依赖与配置（Task 1）

- devDependencies：`@testing-library/react`、`@testing-library/user-event`、`jsdom`
- `vitest.config.ts`：`test.environment` → `jsdom`

## 新增测试文件

| 文件 | 说明 |
|------|------|
| `src/hooks/__tests__/useOnboarding.test.ts` | 引导 dismiss / localStorage（`oct.onboarding.dismissed`） |
| `src/hooks/__tests__/useCapabilityActions.test.ts` | 能力栏与欢迎动作 handler（7 用例） |
| `src/hooks/__tests__/useImageStudio.test.ts` | 生图侧栏开关、prefill、`registerPromptInjector` |

## 明确未覆盖（后续）

- `useTtsPlayback`：依赖 Electron IPC / `speechSynthesis`，本计划跳过

## 相关分条 changelog

- `2026-04-29-testing-library-jsdom.md`
- `2026-04-29-useOnboarding-tests.md`
- `2026-04-29-useCapabilityActions-tests.md`
