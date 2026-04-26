# 内容制作工作台模块

## 状态

当前模块处于“工作台 V2”阶段，所有数据均为 mock，不连接任何 AI、Gateway 或持久化层。

V2 的产品定位是“内容制作多 Agent 工作台”，有声小说只是第一套团队模板。

## 如何进入

- 在 OCT 主界面顶部右侧点击“内容制作工作台”
- 进入后可通过左上角“← 返回 Chat”回到主 Chat 视图

## 当前模板

- `audiobook_multicast.v1`：多人演播有声小说
- `radiodrama.v1`：广播剧改编预留模板

## State 访问约定

- 所有状态变更必须走 `src/modules/script-adapter/store/actions.ts`
- 组件只读取 store，不直接调用 `useScriptAdapterStore.setState`
- 当前主要 action 包括：
  - `loadProject`
  - `setAgents`
  - `setViewMode`
  - `selectStage`
  - `openStageInWorkbench`

## 当前 V2 展示结构

- 项目与章节：展示《长夜未瞑》项目、章节列表、当前模板。
- 团队流程：展示项目摄入、作品分析、场景拆分、文本改编、角色音标注、演播设计、质检审核、打包交付。
- 制作团队：展示每个制作角色的职责、交付内容和人工确认要求。
- 阶段详情：展示当前阶段的用户可理解说明、交付内容、产物预览和占位操作按钮。

## 调试接口

模块初始化后会把 action 挂到 `window.__scriptAdapter`：

```ts
window.__scriptAdapter.setViewMode('pipeline');
window.__scriptAdapter.selectStage(6);
window.__scriptAdapter.openStageInWorkbench(4);
```

## 下一阶段 TODO

- 定义最小真实 schema：`ProjectContext`、`TeamTemplate`、`VoiceRegistry`、`ReviewReport`。
- 接入第一个真实能力：章节切分。
- 预留 Gateway 工具：打开工作台、运行阶段、保存产物。
- 增加人工确认节点和打回理由弹窗。
