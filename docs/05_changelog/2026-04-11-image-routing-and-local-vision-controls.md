# 2026-04-11 图片链路与本地视觉控制

## 本次调整

- 图片理解顺序改为：原生视觉优先，MCP `understand_image` 次之，本地 BLIP 最后兜底
- 设置面板新增“本地视觉模型（BLIP）”卡片
- 用户可显式启用或关闭本地视觉兜底
- 用户可手动下载本地视觉模型，并看到下载中、成功、失败状态

## 解决的问题

- 非 Qwen 视觉套餐用户发图时，过去容易直接落到本地 BLIP 下载失败，导致“模型看不到图”
- 本地 BLIP 过去是隐式自动下载，失败原因对用户不可见
- 现在即使没有代理，只要 MCP 图片理解可用，也不必依赖本地 BLIP 才能看图

## 涉及文件

- `oct-gateway/image_analyzer.js`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/SettingsPanel.tsx`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/styles/SettingsPanel.css`
- `src/vite-env.d.ts`
