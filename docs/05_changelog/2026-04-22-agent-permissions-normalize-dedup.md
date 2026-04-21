# 2026-04-22：Agent 权限 normalize 去重

## 摘要

`normalizeAgentPermissions` 仅以 `oct-gateway/config.js` 为唯一实现；`oct-gateway/security/agent_permissions_policy.js` 改为调用 `config.normalizeAgentPermissions`，并继续对外导出同名薄包装；`electron/main.ts` 删除本地重复实现，首次读写 Agent 权限 IPC 时惰性 `require('oct-gateway/config.js')` 复用同一函数与 `DEFAULT_AGENT_PERMISSIONS`。布尔归一化规则未改。

## 涉及文件

- `oct-gateway/config.js`（逻辑保持，仍为权威实现）
- `oct-gateway/security/agent_permissions_policy.js`
- `electron/main.ts`
