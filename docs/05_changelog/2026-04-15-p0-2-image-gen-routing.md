# fix: 欢迎卡片 image_gen 路由 — 直接打开 Image Studio

> Date: 2026-04-15  
> Type: Bug Fix / Feature  
> 影响范围: 欢迎界面"生图"卡片点击行为

## 问题

点击欢迎界面"生图"卡片后，AI 收到 prompt 尝试自己生成图片，
而不是打开右侧专属的 Image Studio 面板。

## 根因

`handleWelcomeCardClick` 中 `capabilityId` 对 `image_gen` 无路由逻辑，
所有卡片最终都走 `msgs.sendMessage(prompt)` → AI 聊天。

## 修复

### src/ui/chat/ChatTab.v2.tsx — handleWelcomeCardClick

当 `capabilityId === 'image_gen'` 时：
1. `setImageStudioOpen(true)` 打开右侧 Image Studio 面板
2. `requestAnimationFrame(() => imagePromptInjectorRef.current?.(prompt))` 注入 prompt
3. `return` 提前退出，不走 AI 聊天

## 路由表（当前完整状态）

| capabilityId | 行为 |
|---|---|
| chat | sendMessage → AI 聊天 |
| background_task | sendMessage → AI 聊天 |
| canvas | openPanel + sendMessage → AI 处理 |
| image_gen | setImageStudioOpen + 注入 prompt → 不走 AI 聊天 |
