# Canvas 渲染引擎升级计划

## 背景

当前问题：Mermaid 被用于两件性质不同的事：
- 聊天区快速预览（需要：小尺寸、容错、即看即走）
- Canvas 富展示（需要：复杂结构、大画布、可交互）

用同一工具做两件事 → 提示词打补丁永无止境。

## 目标架构

```
用户提问
  │
  ▼
AI 决策（系统提示词路由表）
  │
  ├─ 简单结构（≤5节点）──────► flowchart TD  ──► 聊天区 Mermaid 渲染
  │
  ├─ 占比数据（≤8项）────────► pie            ──► 聊天区 Mermaid 渲染
  │
  ├─ 复杂结构/架构/关系图 ───► react-flow JSON ──► Canvas ReactFlow 渲染
  │
  └─ 数值/趋势/对比图表 ─────► chart JSON     ──► Canvas ECharts 渲染（Phase 3）
```

---

## Phase 1 — 已完成 ✅

- Mermaid 聊天区限定 2 种类型（flowchart TD + pie）
- LR 方向、复杂图自动转 Canvas 摘要卡片
- 修复空白渲染、颜色主题、polishSvg 清除 AI 颜色注入
- 系统提示词决策树（4 条规则取代 50 条补丁）

---

## Phase 2 — Canvas 加入 React Flow（当前任务）

### 新增文件
```
src/components/canvas/
  ReactFlowRenderer.tsx     ← 核心渲染组件
  ReactFlowRenderer.css     ← 样式（主题适配）
  plugins/
    reactFlowPlugin.tsx     ← Canvas 插件注册
```

### 修改文件
```
src/contexts/CanvasContext.tsx
  CanvasArtifactType 加入 'react-flow'

src/components/canvas/plugins/index.ts
  注册 reactFlowPlugin

oct-gateway/ai.js
  系统提示词新增 react-flow JSON 格式规范
  复杂结构图触发条件
```

### AI 输出的 react-flow JSON 格式
```json
{
  "nodes": [
    { "id": "ws",     "label": "WebSocket 接口", "group": "接口层" },
    { "id": "http",   "label": "HTTP REST API",  "group": "接口层" },
    { "id": "router", "label": "消息路由",        "group": "业务层" },
    { "id": "ai",     "label": "AI 推理",         "group": "业务层" }
  ],
  "edges": [
    { "source": "ws",     "target": "router" },
    { "source": "http",   "target": "router" },
    { "source": "router", "target": "ai",    "label": "推理请求" }
  ],
  "direction": "LR",
  "title": "oct-gateway 后端架构"
}
```

### 布局算法（内置，不依赖 dagre）
1. 找出根节点（无入边的节点）
2. BFS 分层，记录每个节点的 depth
3. 按 direction 计算 x/y：LR → x=depth*220, y=同层索引*100
4. group 相同的节点颜色一致（从 CSS vars 取主题色）

### 节点颜色方案（主题自适应）
- 同 group 的节点共享同一背景色（用 --mermaid-pie-N 取色）
- 节点背景：10% 透明度，边框：50% 不透明度
- 文字：--text-primary
- 边/连线：--mermaid-line

---

## Phase 3 — Canvas 加入 ECharts（后续）

### 触发场景
- 柱状图、折线图、散点图、雷达图
- 之前被禁止的 xychart/sankey/radar 类型

### AI 输出格式
直接输出 ECharts option JSON：
```json
{
  "type": "chart",
  "chartType": "bar",
  "option": {
    "xAxis": { "data": ["Q1","Q2","Q3","Q4"] },
    "series": [{ "name": "收入", "data": [120,200,150,80] }]
  }
}
```

### 实现方式
- npm install echarts echarts-for-react
- 新建 EChartsRenderer.tsx + chartPlugin.tsx
- CanvasArtifactType 加入 'chart'

---

## 最终系统提示词路由（Phase 2 完成后）

```
图表路由（AI 必须按此执行）：
① 节点 ≤ 5、说明性结构 → flowchart TD（聊天区 Mermaid）
② 占比数据 ≤ 8 项        → pie（聊天区 Mermaid）
③ 复杂架构/依赖/流程图    → react-flow JSON（Canvas）
④ 数值/趋势数据图表        → chart JSON（Canvas ECharts，Phase 3）
```

---

## 依赖安装

```bash
# Phase 2
npm install @xyflow/react

# Phase 3（暂不安装）
# npm install echarts echarts-for-react
```
