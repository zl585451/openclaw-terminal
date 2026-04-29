# 2026-04-29 业务分析失败信息外显

## 背景

第二个确认页在业务分析启动失败时，只显示“失败 / 未启动前不会占用模型调用”，无法判断是 IPC 未注入、Gateway 请求失败，还是模型调用失败。

## 改动

- 第 3 步等待面板在 `analysisStatus = failed` 时展示 `analysisError`。
- 右侧“下一步 Agent”失败态展示具体错误信息，不再只显示模型占用提示。

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
