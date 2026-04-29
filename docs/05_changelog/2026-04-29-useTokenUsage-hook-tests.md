# 变更：useTokenUsage 单元测试

**日期：** 2026-04-29  
**分支：** `test/coverage-round2`

- 新增 `src/hooks/__tests__/useTokenUsage.test.ts`，覆盖 RAF 批量 flush、增量/快照 token、重置、`setFromSystemReply`、ctx/cost。
- RAF：fake timers + 将 `requestAnimationFrame` 映射为 `setTimeout(0)`，用 `await act(async () => vi.runAllTimersAsync())` 触发 flush。
