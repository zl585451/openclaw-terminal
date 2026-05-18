# 2026-05-18 Config Phase 2 Slice 1

## What Changed

- 将 `oct-gateway/config.js` 中三块低耦合逻辑抽到 `oct-gateway/config/`：
- `fileSources.js`
- `probeCache.js`
- `memoryConfig.js`
- `agentPermissions.js`

## Why

- `config.js` 同时承载配置源读取、provider 解析、模型注册表、probe cache、memory 默认值和 agent 权限，变化原因过多
- Phase 2 先拆低风险公共模块，保留现有 `config` 对外接口，降低后续继续拆分的回归成本

## Kept Stable

- `require('./config')` 的现有调用方式不变
- `config.getProbeCacheEntry`
- `config.setProbeCacheEntry`
- `config.normalizeAgentPermissions`
- `config.DEFAULT_AGENT_PERMISSIONS`
- `config.memory.*`

## Notes

- 这是 Phase 2 的第一刀，不代表 `config.js` 已拆完
- provider registry 和 loader/source priority 仍保留在 `config.js`，后续阶段继续处理
