# Script Adapter Module

## 状态

当前模块处于“骨架 v1”阶段，所有数据均为 mock，不连接任何 AI、Gateway 或持久化层。

## 如何进入

- 在 OCT 主界面顶部右侧点击“打开小说改编模块”
- 进入后可通过左上角“← 返回 Chat”回到主 Chat 视图

## State 访问约定

- 所有状态变更必须走 `src/modules/script-adapter/store/actions.ts`
- 组件只读取 store，不直接调用 `useScriptAdapterStore.setState`
- 当前主要 action 包括：
  - `loadProject`
  - `setAgents`
  - `setViewMode`
  - `selectStage`
  - `openStageInWorkbench`

## 调试接口

模块初始化后会把 action 挂到 `window.__scriptAdapter`：

```ts
window.__scriptAdapter.setViewMode('pipeline');
window.__scriptAdapter.selectStage(6);
window.__scriptAdapter.openStageInWorkbench(4);
```

## 下一阶段 TODO

- 不接 AI 调用（Gateway、LLM Provider、Nocturne）
- 不做真实章节切分 / 分析 / 改写
- 不做数据库持久化（SQLite 只写 DDL，不建表）
- 不做真实的打回 / 重跑逻辑
- 不做场景列表、双栏对比、打回弹窗等复杂子组件
- 正式入口位置待产品确认，当前为骨架阶段临时入口
