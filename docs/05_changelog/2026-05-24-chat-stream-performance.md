# 2026-05-24 聊天流式与切页卡顿修复

## 背景

用户反馈 OCT 启动后整体界面切换有延迟，AI 流式输出时也会一顿一顿。检查聊天主链路后，主要发现两类前端渲染压力：

- 流式输出期间，`useStreamPainting` 已经可以直接写入流式 `<pre>` 节点，但仍会把每一小段可见文本同步回 React state，导致整棵聊天树按打字节奏重渲染。
- `ChatTab.v2` 的普通状态变化会让消息列表重新执行映射、CoT 检测和解析判断；即使消息内容没有变化，也会增加切换面板时的体感延迟。

## 变更

- `useStreamPainting` 新增 `publishDomTextToReact` 保护开关：
  - 有直接 DOM 流式节点时，默认只写 `textContent`，不再每帧同步 React state。
  - 保留无 DOM 节点的结构化流式渲染路径，避免影响后续按需恢复结构化 Markdown 预览。
- `ChatTab.v2` 将主聊天流式阶段切回轻量纯文本 DOM 绘制：
  - 流式期间优先保证顺滑响应；
  - 回复结束后仍走既有最终 Markdown 渲染路径。
- `ChatMessageList` 增加 `React.memo` 自定义比较，并在 `ChatTab.v2` 中 memo 化 `displayMessages` 与空会话占位，减少无关状态更新带来的消息列表重算。
- `useWebSocket` 稳定化 `send` 与返回对象引用，避免上层 `sendMessage` / `quickSend` 因 transport 对象每次渲染变化而连带刷新子树。

## 影响

- 流式中间态不再实时构建代码块 / 表格结构，优先换取更稳定的输入、切页和滚动响应。
- 最终消息内容与最终 Markdown 渲染不变。
- 没有改变 Gateway 协议、模型配置、消息入库格式或 API Key 读取逻辑。

## 验证

- `npx tsc --noEmit`
- `npx vitest run`
