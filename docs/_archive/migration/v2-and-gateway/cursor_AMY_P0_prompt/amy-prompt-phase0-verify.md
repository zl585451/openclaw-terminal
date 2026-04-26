# AMY 任务：OCT v2 Phase 0 验收

## 背景
少爷正在进行 OCT v2 架构迁移。Phase 0 是准备工作，Cursor 刚执行完。现在需要你验收。

## 你需要检查的事项

### 检查 1：文件是否存在
请确认以下文件/目录存在：

```
src/core/types.ts          ← 核心类型定义（最重要，内容不能为空）
src/core/blockRouter.ts    ← 占位文件
src/core/turnFSM.ts        ← 占位文件
src/core/streamRouter.ts   ← 占位文件
src/components/ChatTab.v1.tsx  ← ChatTab 备份
```

### 检查 2：types.ts 内容完整性
打开 `src/core/types.ts`，确认包含以下关键类型：

- `ContentBlockType`（类型枚举，包含 text/cot/code/tool_call 等）
- `ContentBlock`（接口，有 id/type/content/streamState 字段）
- `MessageV2`（接口，有 blocks: AnyContentBlock[] 字段）
- `TurnPhase`（类型，包含 idle/submitted/thinking/streaming 等）
- `ChatMessageV1`（旧消息类型的兼容定义）
- `OptionItem`（选项条目，有 num/label/value 字段）

### 检查 3：现有功能不受影响
- OCT 能正常启动
- 能正常和 AMY 对话
- 选项框、任务清单、CoT 面板都正常工作

## 验收结果格式

请按以下格式汇报给少爷：

```
📋 Phase 0 验收结果

文件检查：
✅/❌ src/core/types.ts 存在且内容完整
✅/❌ src/core/blockRouter.ts 占位文件存在
✅/❌ src/core/turnFSM.ts 占位文件存在
✅/❌ src/core/streamRouter.ts 占位文件存在
✅/❌ src/components/ChatTab.v1.tsx 备份存在

类型完整性：
✅/❌ ContentBlockType 定义完整
✅/❌ MessageV2 包含 blocks 字段
✅/❌ TurnPhase 状态枚举完整
✅/❌ 兼容层类型存在

功能检查：
✅/❌ OCT 正常启动
✅/❌ 对话功能正常
✅/❌ 交互组件正常

结论：Phase 0 ✅ 通过 / ❌ 未通过（原因：...）
```

## 验收通过后

提醒少爷执行：

```powershell
cd E:\windows-window\OpenClaw-Terminal
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "v2-phase0: done - core types and directory structure"
git tag v2-phase0-done
```

然后告诉少爷可以回 Claude 要 Phase 1 的 Cursor Prompt 了。
