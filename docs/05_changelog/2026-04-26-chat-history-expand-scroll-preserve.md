# 聊天区加载更多历史时保留滚动位置

**日期**：2026-04-26  
**范围**：`src/hooks/useScrollManager.ts`

## 问题

`visibleCount` 增大时会在列表**上方**多渲染更早的消息，`scrollTop` 未补偿导致视口相对内容跳变。

## 修复

- 在扩大 `visibleCount` 前记录容器的 `scrollTop` / `scrollHeight`。
- 在依赖 `visibleCount` 的 `useLayoutEffect` 中按 `delta = scrollHeight_new - scrollHeight_old` 平移 `scrollTop`，在浏览器绘制前完成，避免闪跳。
- 将随 `messagesLength` 同步 `visibleCount` 的逻辑从 `useEffect` 改为 `useLayoutEffect`，与补偿同一布局阶段，减少一帧错位风险。

## 验证

- `npx tsc --noEmit`
- `npx vitest run`
