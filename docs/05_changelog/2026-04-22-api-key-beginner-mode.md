# 2026-04-22 API Key 设置分层与新手模式落地

## 本次变更

- 新增设置页 `Beginner / Advanced` 两层模式，并通过 `OCT_SETTINGS_MODE` 持久化当前选择。
- 在连接设置中加入新手模式快捷入口，默认聚焦 `bailian-coding`、`deepseek`、`minimax` 三家常用供应商。
- 新增 API Key 嗅探逻辑：识别常见 key 前缀，并在命中非新手供应商时提示切换到高级模式。
- 新增推荐模型逻辑与更友好的连接错误文案，降低初次配置时的理解成本。
- 新增“保存并测试连接”与“回滚到上次可用配置”交互，复用现有 `saveGatewayAndReconnect()` 链路，不改 gateway 核心数据流。

## 涉及文件

- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/hooks/settings/useApiKeys.ts`
- `src/hooks/settings/recommendedModels.ts`
- `src/utils/providerUtils.ts`
- `src/utils/aiConnectionErrors.ts`
- `electron/preload.ts`
- `electron/main.ts`
- `docs/02_architecture/config-system.md`
- `docs/02_architecture/provider-system.md`
- `docs/02_architecture/api-key-model-provider-unification-plan.md`

## 兼容性说明

- 旧配置字段保持不变，仍然走 `userData/config.json + .env + ~/.openclaw/openclaw.json` 的原有加载顺序。
- 未进入新手模式时，高级配置页行为保持原样。
- 本次没有修改 gateway provider 注册表、模型能力注册表和消息协议。

## 风险与后续

- 新手模式当前只覆盖 3 个默认供应商，其他 key 会提示转入高级模式。
- 目前主要完成了编译级验证，后续仍建议补一轮真实 UI 手测与供应商连通性验证。
