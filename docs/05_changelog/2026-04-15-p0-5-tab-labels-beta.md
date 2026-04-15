# 2026-04-15 · P0-5 Tab 中文化与 Beta 标记

## 目标

Phase P0 Task P0-5：主导航 Tab 面向用户改为中文；实验性 Tab 标注 Beta。

## 改动

- **`src/components/TabBar.tsx`**
  - `chat` → 文案「对话」；`sound` →「音频」+ `Beta`；`reaper` →「Reaper」+ `Beta`（**`id` 未改**，仍为 `chat` / `sound` / `reaper`）。
  - 保险箱按钮文案「VAULT」→「保险箱」。
  - 保留 `SHOW_BETA_TABS`：为 `false` 时仍只显示对话 Tab。
- **`src/styles/TabBar.css`**
  - 新增 `.oct-tab-beta-badge`。

## 验收

- Tab 显示中文（Reaper 保留产品名拼写）。
- 音频、Reaper 右侧有 Beta 徽标。
- 切换 Tab、保险箱抽屉行为与此前一致。

## 参考

- `refactor/02_P0_首屏改造.md` Task P0-5
