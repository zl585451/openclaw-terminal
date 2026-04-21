# Cursor 任务使用说明

## 你该怎么用

不要让 Cursor 自己猜。

正确做法：

1. 打开一个 `cursor-task-xx-*.md` 文件
2. 全部复制
3. 整段发给 Cursor 自动模式
4. 等它做完
5. 检查它的总结
6. 再决定要不要发下一个任务

## 推荐顺序

如果你不懂代码，就按这个顺序来：

1. [cursor-task-01-provider-utils-tests.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-01-provider-utils-tests.md)
2. [cursor-task-02-ai-connection-errors-tests.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-02-ai-connection-errors-tests.md)
3. [cursor-task-03-settings-provider-types.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-03-settings-provider-types.md)
4. [cursor-task-04-recommended-models-cleanup.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-04-recommended-models-cleanup.md)
5. [cursor-task-05-provider-view-helpers.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-05-provider-view-helpers.md)
6. [cursor-task-06-google-base-url-helper.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-06-google-base-url-helper.md)
7. [cursor-task-07-agent-permissions-normalize.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-07-agent-permissions-normalize.md)

## 你暂时不要发给 Cursor 的任务

以下任务先不要直接做：

- 拆 `electron/main.ts`
- 大改 `src/hooks/useMessages.ts`
- 重构聊天主链路
- 大改 `oct-gateway/index.js`
- 全量重构 `oct-gateway/gateway/slash.js`

## 判断它有没有跑偏

如果 Cursor 出现下面任意一种情况，就停止：

- 它开始修改没有写进任务单的文件
- 它说“顺手优化了一些相关逻辑”
- 它开始谈“更好的架构”
- 它没有跑验证
- 它没有明确说自己改了哪些文件

## 最简单建议

如果你只打算先试一次，就先用：

- [cursor-task-01-provider-utils-tests.md](/e:/windows-window/OpenClaw-Terminal/docs/04_dev_guides/cursor-task-01-provider-utils-tests.md)

这是最稳的一步。
