# 2026-05-18 Settings Schema Phase 4 Slice 1

## What Changed

- Phase 4 开始拆 `src/ui/settings/tabs/ConnectionTabView.tsx`
- 新增 `src/ui/settings/providerConnectionSchema.ts`
- 首批迁出的映射职责：
- provider 切换时的 Base URL / 默认模型回填
- provider 对应 Base URL 字段选择
- 测试连接 payload builder

## Outcome

- `ConnectionTabView.tsx` 里与 provider 相关的值映射不再完全靠内联 `if / else`
- Base URL 字段和测试连接 payload 已开始使用统一 mapper/schema 层
- Phase 4 先从数据映射层切入，暂未重写表单 JSX 结构

## Verification

- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 下一步继续把 provider 级别的文案、可编辑字段和模型输入策略往 schema 层迁
