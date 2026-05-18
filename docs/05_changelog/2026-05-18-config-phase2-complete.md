# 2026-05-18 Config Phase 2 Complete

## What Changed

- 完成 `oct-gateway/config.js` Phase 2 拆分收口
- `config.js` 现在主要负责装配与导出
- 低耦合配置逻辑已迁移到 `oct-gateway/config/`：
- `fileSources.js`
- `providerRuntime.js`
- `modelRegistry.js`
- `probeCache.js`
- `memoryConfig.js`
- `agentPermissions.js`

## Outcome

- `config.js` 体量已明显下降
- provider 解析、模型能力、probe cache、memory 默认配置不再挤在同一文件
- 对外接口保持兼容：
- `config.getProviderConfig`
- `config.getModelCaps`
- `config.getEnvOrConfig`
- `config.getProbeCacheEntry`
- `config.setProbeCacheEntry`
- `config.normalizeAgentPermissions`

## Verification

- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- 直接 `node` 加载 `./oct-gateway/config` 并检查 provider/model/capability 读数

## Notes

- Phase 2 到这里结束，不再继续把 `config.js` 切成更碎的碎片
- 后续重点转到 Phase 3，处理前端聊天状态层 `useMessages`
