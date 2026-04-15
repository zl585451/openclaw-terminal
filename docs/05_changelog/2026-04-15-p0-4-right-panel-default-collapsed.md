# 2026-04-15 · P0-4 右栏默认折叠

## 目标

Phase P0 Task P0-4：右侧开发者信息栏默认收拢为窄条，减轻新用户认知负担；可点击展开，状态可持久化。

## 改动

- **`src/ui/chat/ChatTabRightPanel.tsx`**
  - 初始折叠：`localStorage.getItem('oct.devpanel.expanded') === '1'` 时才展开，否则默认折叠。
  - 切换时写入 `oct.devpanel.expanded`（`'1'` / `'0'`）。
  - **收放交互**：沿用侧边浮动 **`right-panel-toggle`**（折叠 / 展开为旧版同款单角引号形箭头），与改版前一致；不设面板内单独「收起」行。
  - 连接状态仍在展开后面板顶部的 GW/MEM 圆点展示（非收放钮）。
- **`src/styles/ChatTab.css`**
  - `.right-panel--collapsed` 折叠宽度 **40px**（与历史版本一致，便于点击箭头）。

## 修订（同日）

- 曾试用窄条 + 绿点 + 顶栏「收起」，按产品反馈改回 **箭头收放钮**，去掉绿点收放与顶栏收起。

## 验收

- 首次安装或未写入 `oct.devpanel.expanded` 时右栏为窄条。
- 点击侧边箭头展开/收起完整面板。
- 刷新后保持上次展开/折叠偏好。

## 参考

- `refactor/02_P0_首屏改造.md` Task P0-4
