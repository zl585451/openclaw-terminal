# 2026-05-10 NewAPI 自定义模型状态修复

## 背景

设置面板里的 `New API 外部分发网关` 支持手动填写后台渠道模型 ID，但前端状态同步存在两个问题：

- 进入自定义模式后，输入框首个字符会把 `OCT_MODEL` 从 `__custom__` 直接改成该字符，后续输入只更新 `CUSTOM_MODEL`，实际生效模型可能停留在首字符或早期值。
- 已保存的自定义模型重新载入设置面板时，没有回填成 `__custom__ + CUSTOM_MODEL` 的 UI 状态，导致下次修改看起来“填写了但没生效”。

## 变更

- 在 `src/ui/settings/tabs/ConnectionTabView.tsx` 中移除了自定义模型输入框对 `OCT_MODEL` 的即时覆盖，保持 `__custom__` 作为 UI 哨兵值，只更新 `CUSTOM_MODEL`。
- 在 `src/hooks/settings/useApiKeys.ts` 中新增已保存配置归一化逻辑：
  - `newapi` / `google` 若加载到的 `OCT_MODEL` 不在预设模型列表中，会自动回填为 `OCT_MODEL='__custom__'`，并把真实模型名放入 `CUSTOM_MODEL`。
  - `custom` provider 若仅保存了 `OCT_MODEL`，会补齐 `CUSTOM_MODEL` 供设置页继续编辑。

## 效果

- `New API` 自定义模型现在会稳定以 `CUSTOM_MODEL` 为准，不再出现输入后实际请求模型停留在首字符的问题。
- 设置页刷新或重开后，自定义模型会继续显示在输入框里，并保持“自定义模式”可编辑。

## 验证

- `npx tsc --noEmit`
- `npx vitest run`
