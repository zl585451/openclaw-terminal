# 变更：useTypewriter 单元测试（保守）

**日期：** 2026-04-29  
**分支：** `test/coverage-round2`

- 新增 `src/hooks/__tests__/useTypewriter.test.ts`，**仅**覆盖 `enabled: false`：初始状态、`feed`/`finish`/`reset` 不抛错且不推进打字、`onFinished` 不被触发（fake timers + 长时间 `advanceTimersByTime`）。
- **未**按计划第 6 项测 `enabled: true` 完成态：hook 同时使用 `setInterval(16)` 与 RAF 链，末尾还有双 RAF 清空正文；在未改 `useTypewriter.ts` 的前提下，Vitest/jsdom fake timers 下端到端不可靠，故意跳过，仅文件内注释说明。
