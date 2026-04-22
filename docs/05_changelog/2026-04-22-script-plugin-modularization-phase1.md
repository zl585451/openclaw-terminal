# 2026-04-22 Script Plugin 模块化 Phase 1

## 背景

`src/workbench/plugins/scriptPlugin.tsx` 已超过 1200 行，同时承载：

- 章节侧栏
- 角色色条
- 正文渲染
- 选区润色入口
- 润色结果弹层
- 大量本地 UI 状态

在继续做“小说 / 有声书兼容”之前，先做结构性瘦身，降低后续演进风险。

## 本次改动

本次只做模块拆分，不改变现有用户可见行为。

### 新增子模块

- `src/workbench/plugins/script/styles.ts`
- `src/workbench/plugins/script/ScriptSidebar.tsx`
- `src/workbench/plugins/script/ScriptCharacterBar.tsx`
- `src/workbench/plugins/script/ScriptContent.tsx`
- `src/workbench/plugins/script/ScriptLineView.tsx`
- `src/workbench/plugins/script/ScriptPolishPanel.tsx`

### 主文件调整

`src/workbench/plugins/scriptPlugin.tsx` 保留：

- 解析结果与状态管理
- 选区计算与润色逻辑
- 文档回填 / 撤销逻辑
- 组件编排

并把纯展示块下沉到独立组件。

## 收益

- 主插件文件显著减负
- 后续可继续把章节解析、角色提取、对白检测下沉为公共能力
- 为“剧本面板兼容小说 / 有声书视图”做下一步拆分准备
