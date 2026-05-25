# Fix: 饼图图例重叠 & 标签可读性优化

**日期**: 2026-05-25  
**类型**: Enhancement  
**影响范围**: src/components/canvas/EChartsRenderer.tsx / docs/01_system_prompts/DIAGRAM_PROTOCOL.md / resources/system_prompts/DIAGRAM_PROTOCOL.md

---

## 问题

饼图在 Canvas 中渲染时有两个视觉问题：

1. **图例（legend）重叠**：AI 生成的 option 将 legend 置于右侧（如 `legend: { right: '5%' }`），饼图为圆形，右侧无剩余空间，导致 legend 与图表区域重叠。
2. **标签可读性差**：饼图扇区上的标签使用 `textStyle.color`（`#8b949e` 灰色）或 ECharts 默认色，在深色主题背景下难以分辨。

---

## 修改

### Layer 1 — EChartsRenderer 渲染层兜底

`src/components/canvas/EChartsRenderer.tsx` — `applyOctTheme()`：

- 检测 `hasPie`（series 中是否有 `type: 'pie'`）
- **Legend**：饼图时强制置于底部居中（`bottom: 10, left: 'center'`），清除冲突的 `top`/`right` 定位
- **Label**：饼图系列默认标签样式 `{ color: '#e6edf3', fontSize: 13, fontWeight: 'bold' }`，与 AI 自定义 label 合并（AI 指定值优先）

### Layer 2 — System Prompt 提示词层

`docs/01_system_prompts/DIAGRAM_PROTOCOL.md`：

- "标签使用规范 → 硬约束"新增：饼图图例应置于底部
- "标签使用规范 → 正例"更新：饼图示例加入 `legend: { bottom: 0 }` 和 `label` 样式

### Layer 3 — 运行时镜像同步

`resources/system_prompts/DIAGRAM_PROTOCOL.md` 同步更新。

---

## 效果

- 饼图图例默认在底部居中，不再与圆形图表重叠
- 扇区标签为白色粗体，在深色主题下清晰可读
- AI 仍可自定义 label/legend 样式，系统兜底仅在未指定时生效
