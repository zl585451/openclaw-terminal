# 2026-04-21 Gateway Token 说明文案更新

## 背景

设置页「Gateway 连接」里的 Token 帮助文案仍保留早期 OpenClaw Dashboard 的获取方式，已经不符合当前 OCT Gateway 的连接逻辑。

## 调整

- 将「如何获取 Token？」改为「Token 什么时候需要填写？」
- 说明桌面端会自动生成并同步 Gateway Token，通常无需手动获取。
- 补充外部 Gateway / 手动设置 `OCT_GATEWAY_TOKEN` 时才需要填写同一 Token。

## 验证

- `npx tsc --noEmit` 通过。
