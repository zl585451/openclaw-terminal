# 2026-04-29 Script Adapter P1 Step 4 Voice Registry Panel

## 变更

1. `BatchProgressView.tsx` 中的跨章角色音摘要升级为可折叠只读面板。
2. 批次运行中可查看完整 VoiceRegistry：角色名、分类、声音提示、出现次数。
3. 新增 VoiceRegistry 分类样式与说明文案，为后续编辑能力预留只读展示位。

## 验证

1. `npx tsc --noEmit`
2. `node --check oct-gateway/index.js`
