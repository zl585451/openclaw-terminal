# fix: 设置「应用」与连接配置快照一致、硅基 Key 落盘

## 现象

用户在「① 连接配置」填写硅基流动 API Key 后点「应用」，`config.json` 未更新或网关仍用旧 Key。

## 原因

1. **`hasGatewayConfigChanges` 误判**：`savedGatewayConfig` 在 `getApiKeys` 后用 `buildGatewayPayload(..., currentProvider = undefined)` 生成，而 `currentGatewayConfig` 使用完整 `providers[providerId]`。两者在 `DASHSCOPE_BASE_URL` /默认值等字段上可能不一致，导致 JSON 比较偶然相等，**跳过了 `saveGatewayAndReconnect`**。
2. **人格设置先保存**：`SettingsPanel` 原顺序先 `savePersonaSettings`，失败则直接 `return`，**连接配置永远不会保存**。
3. **硅基专用字段**：仅写 `DASHSCOPE_API_KEY` 时，部分环境仍依赖 `SILICONFLOW_API_KEY`；选硅基时若 `DASHSCOPE_BASE_URL` 残留百炼地址，落盘数据易混淆。

## 修改

- `src/hooks/settings/useApiKeys.ts`：`savedGatewayConfig` 基线与 `FALLBACK_PROVIDERS` / 已加载 `providers` 对齐；`siliconflow` 时规范化 `DASHSCOPE_BASE_URL`；payload 增加 `SILICONFLOW_API_KEY`（与当前服务商 Key 同步，非硅基时写空）。
- `src/components/SettingsPanel.tsx`：**先保存连接配置，再保存人格设置**。
- `electron/main.ts`：`SILICONFLOW_API_KEY` 变更触发 Gateway 重启判断。
- `electron/preload.ts`、`src/vite-env.d.ts`：类型补充。
