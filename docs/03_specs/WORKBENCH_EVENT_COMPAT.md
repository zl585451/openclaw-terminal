# Workbench Event Compatibility

日期：2026-04-12

## 背景

历史上前后端通过 `canvasEvent` 传递工作台产物事件。随着 Canvas 向 Workbench 子系统演进，协议开始增加 `workbenchEvent` 作为新字段名。

这一阶段不删除 `canvasEvent`，但主语义已经切到 `workbenchEvent` / `workbenchContext`。

## Gateway 返回格式

文件：

- [oct-gateway/tools/canvas.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tools/canvas.js)

现在工具返回值会同时包含：

```json
{
  "canvasEvent": {
    "action": "create",
    "payload": {}
  },
  "workbenchEvent": {
    "action": "create",
    "payload": {}
  }
}
```

说明：

- 两个字段当前语义一致
- `canvasEvent` 供旧前端消费
- `workbenchEvent` 供新工作台链路消费

## Runtime 转发

文件：

- [oct-gateway/runtime/toolLoop.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/toolLoop.js)

当前 runtime 优先向前端 transport 透传：

```json
{
  "type": "workbench",
  "action": "create",
  "payload": {}
}
```

如果遇到旧结果对象没有 `workbenchEvent`，才回退透传：

```json
{
  "type": "canvas",
  "action": "create",
  "payload": {}
}
```

## Frontend 接收

文件：

- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts)

前端现在兼容两种 envelope：

- `type === 'workbench'`：主路径
- `type === 'canvas'`：兼容路径

发送消息时，前端现在优先使用 `workbenchContext` 字段，并继续附带 `canvasContext` 兼容别名。

## 迁移约束

- 在明确移除所有旧 consumer 之前，不删除 `canvasEvent`
- 新增工作台能力时，优先使用 `workbenchEvent` / `workbenchContext`
- 旧消息、旧安装包、旧桥接代码仍然应该继续可用
