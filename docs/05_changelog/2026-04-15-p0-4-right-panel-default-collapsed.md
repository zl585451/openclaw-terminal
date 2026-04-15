# 2026-04-15 · P0-4 右栏默认折叠

## 目标

Phase P0 Task P0-4：右侧开发者信息栏默认收拢为窄条，减轻新用户认知负担；可点击展开，状态可持久化。

## 改动

- **`src/ui/chat/ChatTabRightPanel.tsx`**
  - 初始折叠：`localStorage.getItem('oct.devpanel.expanded') === '1'` 时才展开，否则默认折叠。
  - 切换时写入 `oct.devpanel.expanded`（`'1'` / `'0'`）。
  - 折叠态：仅显示连接状态色点（绿 = WebSocket 已连，红 = 未连），`title` 为「展开开发者面板」。
  - 展开态：面板顶部「收起」按钮；移除原侧边 ‹ › 浮动切换钮（避免与新产品交互重复）。
- **`src/styles/ChatTab.css`**
  - `.right-panel--collapsed` 宽度改为 `24px`，并增加 `.oct-devpanel-expand` / `.oct-status-dot` / `.oct-devpanel-collapse`。

## 验收

- 首次安装或未写入 `oct.devpanel.expanded` 时右栏为窄条。
- 点击色点展开完整面板；点击「收起」回到窄条。
- 刷新后保持上次展开/折叠偏好。
- Gateway 断开时色点为红色。

## 参考

- `refactor/02_P0_首屏改造.md` Task P0-4
