# ChatTab.v2 四步抽离（模块化）

> **状态**：已完成（验收 + 打标）  
> **主文件**：`src/ui/chat/ChatTab.v2.tsx`  
> **目标**：把巨型组件中的 Markdown 预处理、自定义渲染、Gateway 控制、WebSocket 收发从 UI 文件中拆出，便于维护与单测。

## 里程碑标签

| 标签 | 说明 |
|------|------|
| （各步独立提交时） | markdown 工具、组件、Gateway hook、WebSocket hook 分步提交 |
| `v2-websocket-hook-done` | 第四步 `useWebSocket` 抽离完成 |
| `v2-refactor-4step-done` | 四步抽离整体收尾（含文档与小修复汇总提交，以仓库为准） |

## 四步对应产物

| 步骤 | 抽离内容 | 新文件 / 位置 |
|------|----------|----------------|
| 1 | Markdown 预处理（表格、代码块、`getCachedPreprocessedMarkdown` 等） | `src/utils/markdownPreprocess.ts` |
| 2 | `react-markdown` 自定义 `components`（链接、表格、代码块等） | `src/ui/chat/markdownComponents.tsx` |
| 3 | Gateway 状态、日志、`ipcRenderer` 启停与导出日志 | `src/hooks/useGateway.ts` |
| 4 | WebSocket 连接态、Nocturne 健康检查、入站消息解析与 `send` | `src/hooks/useWebSocket.ts` |

## ChatTab.v2 体量（参考）

- 四步抽离前后主文件行数：**约 3578 → 约 2985**（以提交说明为准；后续若再改 UI/调试日志，行数会继续变化）。
- 接入方式：`ChatTab` 内 `const gateway = useGateway()`、`const ws = useWebSocket({ ...callbacks })`，子组件通过 props 接收 `wsConnected` 等，**勿**在 JSX 或类型里写成 `ws.xxx` 形式的属性名。

## 相关小修复

- **`oct-gateway/tool_loader.js`**：`tools/` 下 `shared.js`、`ai_library.js` 为被 `require` 的辅助模块，非 `name/definition/execute` 形态；已加入跳过列表，避免误导性 “跳过 xxx” 日志。

## 验证建议

- `npx tsc --noEmit`、`npm run test`
- Electron 开发模式下发一条消息，确认流式、工具事件、Gateway 日志面板仍正常
