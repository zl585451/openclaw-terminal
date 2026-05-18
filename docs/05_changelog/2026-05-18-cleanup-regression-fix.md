# 2026-05-18 cleanup regression fix

## 变更

- 在 `electron/main.ts` 恢复 `guessImageExtension()`，修复 `download-image` IPC 仍调用该函数导致的 Electron TypeScript 编译失败。
- 同步更新当前态架构文档，移除对已删除 `tools.js` 和 `self_eval.js` 的现役描述。

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
- `npm run build`
