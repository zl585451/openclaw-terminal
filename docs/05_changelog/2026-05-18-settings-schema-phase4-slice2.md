# 2026-05-18 Settings Schema Phase 4 Slice 2

## What Changed

- 继续拆 `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/providerConnectionSchema.ts` 新增 provider view schema
- 迁出的 UI 策略包括：
- provider 提示文案
- 模型输入模式（文本框 / 下拉）
- 自定义模型输入显隐策略
- 自定义 provider 扩展区显隐
- 高级 Base URL 区显隐策略

## Outcome

- `ConnectionTabView.tsx` 中绝大多数 provider 条件分支已改成 schema / helper 调用
- 新增 provider 时，不再需要在主表单里复制多段提示文案和输入模式分支
- Phase 4 已接近收口，主表单逻辑从条件分支转向配置驱动

## Verification

- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 剩余的 provider 特殊逻辑主要是自定义 provider 预设识别，不再影响主表单结构
