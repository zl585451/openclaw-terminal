# Canvas Studio 实施方案（展示优先）

更新时间：2026-04-06  
负责人：你 + Codex

---

## 1. 目标与范围

### 1.1 总目标

将当前 Canvas 升级为“视觉展厅模式（Studio）”，优先服务 AI 视觉成果展示，不先做重编辑器能力。

### 1.2 本期范围（做）

- 视觉成果展示（diagram / ui-draft）
- 展示视图的可读性、可切换、可导出
- AI 产出与 Canvas 展示的衔接规范
- 当前优先专项：线路图 / 路线图 / roadmap 展示优化

### 1.3 本期不做（暂缓）

- 重代码编辑器（Monaco/AST/实时 lint）
- 文档写作工作流深度打磨
- 复杂协同编辑/局部补丁改写

---

## 2. 实施阶段

## 阶段一：Studio 骨架（双栏展示）

目标：把 Canvas 从“单预览窗口”升级为“说明 + 预览”的展厅结构。  
建议周期：1 次迭代

交付内容：

- [x] Canvas 主区支持双栏：
  - 左栏：标题、解释、摘要、关键信息
  - 右栏：实际渲染预览
- [x] 兼容窄屏回落为单栏
- [x] 保留现有工具栏行为（Copy / Export / Delete / Close）

主要文件：

- `src/components/CanvasPanel.tsx`
- `src/components/CanvasPanel.css`

验收标准：

- 打开任意 Canvas 文档时，结构稳定、信息层级清晰
- `diagram` 和 `ui-draft` 在右栏展示正常

---

## 阶段二：视觉预览增强（展示操作）

目标：让视觉内容“易看、易演示、易导出”。  
建议周期：1 次迭代

交付内容：

- [x] Diagram 展示增强：
  - Fit / 100% / 缩放控制
  - PNG 高清导出入口
- [x] UI Draft 展示增强：
  - 视口切换（Desktop / Tablet / Mobile）
  - 预览容器居中与尺寸信息展示
- [x] 统一展板样式（标题条、边框、背景、间距）

主要文件：

- `src/components/canvas/MermaidRenderer.tsx`
- `src/components/canvas/plugins/htmlPlugin.tsx`
- `src/components/CanvasPanel.css`

验收标准：

- 切换视口时，UI 预览尺寸正确
- Mermaid 在大图场景下依旧可读

---

## 阶段三：作品卡与版本回看

目标：将每次 AI 产出沉淀成“可浏览作品”。  
建议周期：1 次迭代

交付内容：

- [ ] 新增作品列表区（按 documents）
- [ ] 支持切换、重命名、删除
- [ ] 默认聚焦最新作品

主要文件：

- `src/components/CanvasPanel.tsx`
- `src/contexts/CanvasContext.tsx`（必要时扩展）

验收标准：

- 多作品切换流畅
- 历史版本可回看，不覆盖丢失

---

## 阶段四：AI 输出规范对齐（并行）

目标：让 AI 产出天然适配“展厅展示”。  
建议周期：并行小步推进

交付内容：

- [ ] 强化 `artifactType` 触发词
- [ ] Diagram 规则：短句、分层、总览优先
- [ ] UI Draft 规则：产出时附带简短解释（用于左栏说明）

主要文件：

- `oct-gateway/ai.js`
- `oct-gateway/orchestrator.js`（若涉及触发策略）

验收标准：

- AI 的首版产物可读性提升明显
- explanation 能直接用于展示文案

---

## 3. 当前进度（实时更新）

已完成：

- [x] Canvas 独立宿主层（CanvasHost）拆出
- [x] Canvas 事件桥接（useCanvasBridge）建立
- [x] Canvas 渲染插件注册表建立（diagram / markdown / code / html）
- [x] CanvasPanel 从硬编码 if/else 改为插件分发
- [x] 数学公式渲染接入（remark-math + rehype-katex）

进行中：

- [x] 阶段一：Studio 双栏展示骨架

待开始：

- [ ] 阶段二：视觉预览增强
- [ ] 阶段三：作品卡与版本回看
- [ ] 阶段四：AI 输出规范对齐

---

## 4. 风险与应对

- 风险：展示层改动影响现有功能  
  应对：每阶段仅做一个主题，保留行为回归检查（`npx tsc --noEmit` + 手工验证）

- 风险：样式互相污染  
  应对：按模块命名样式类，限制全局覆盖

- 风险：AI 输出不稳定  
  应对：优先提示词模板约束，再做兜底清洗

---

## 5. 协作方式

- 本文档作为唯一进度板，每完成一项就更新勾选状态。
- 变更优先走小步提交，避免一次性大改。
- 如方向调整，先更新“目标与范围”再动代码。
