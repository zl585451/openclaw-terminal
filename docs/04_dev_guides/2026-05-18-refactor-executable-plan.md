# 2026-05-18 Refactor Executable Plan

## Plan Name

`refactor/executable-stabilization-plan-2026-05-18`

## Goal

用 5 个可独立验收的阶段，逐步降低网关主链路、配置系统、聊天前端状态层和设置页的耦合度，避免继续在单文件里叠加职责。

## Scope

- `oct-gateway/ai.js`
- `oct-gateway/gateway/slash.js`
- `oct-gateway/config.js`
- `src/hooks/useMessages.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/modules/script-adapter/ScriptAdapterApp.tsx`

## Non-Goals

- 本计划不重写现有功能
- 本计划不引入新的产品能力
- 本计划不优先处理纯样式问题

## Phase Map

### Phase 0

- Tag: `refactor-plan-phase0-start-2026-05-18`
- Status: started
- Target: 固化计划、冻结起点、明确阶段边界
- Deliverables:
- 新建执行计划文档
- 新建阶段记录 changelog
- 创建计划分支和起始 tag
- Exit Criteria:
- 后续每一阶段都能基于同一计划名继续推进

### Phase 1

- Tag: `refactor-plan-phase1-gateway-capability-core`
- Status: completed
- Target: 抽离 `ai.js` 和 `gateway/slash.js` 的重复 provider 能力逻辑
- Files:
- `oct-gateway/ai.js`
- `oct-gateway/gateway/slash.js`
- `oct-gateway/runtime/` 下新增共享模块
- Work Items:
- 抽出统一的 `buildChatHeaders`
- 抽出统一的 tool support probe
- 抽出 probe failure classify 和 cache 写入
- 让 `ai.js` 与 `slash.js` 只消费共享能力层
- Exit Criteria:
- `ai.js` 与 `slash.js` 不再复制同一套 probe 逻辑
- probe 相关单测或最小回归验证可覆盖共享实现

### Phase 2

- Tag: `refactor-plan-phase2-config-split`
- Status: completed
- Target: 拆解 `config.js` 的装载、注册表、缓存和默认值
- Files:
- `oct-gateway/config.js`
- `oct-gateway/config/` 下新增子模块
- Work Items:
- 分离 config loader
- 分离 model registry 和 provider registry
- 分离 probe cache
- 分离 memory/vector/summarizer 默认配置
- 保持现有导出接口向后兼容
- Result:
- `config.js` 已从超大逻辑文件收口为装配入口
- `oct-gateway/config/` 已承接 file sources、provider runtime、model registry、probe cache、memory config、agent permissions
- Exit Criteria:
- `config.js` 退化为组装入口，而不是超大逻辑文件
- provider/config 行为无可见回归

### Phase 3

- Tag: `refactor-plan-phase3-chat-state-split`
- Status: completed
- Target: 拆解 `useMessages` 的协议层、流式层和 UI 层
- Files:
- `src/hooks/useMessages.ts`
- `src/hooks/` 下新增拆分 hooks / helpers
- `src/core/` 相关类型
- Work Items:
- 抽出 transport event binding
- 抽出 streaming turn lifecycle
- 抽出 tool timeline sync
- 抽出 message mutation helpers
- 保持 `useMessages` 作为组合层
- Result:
- 已新增 `src/hooks/useMessages.helpers.ts`
- 已把流式收尾、chat done 写回、tool card 同步与系统命令判断迁出为纯 helper
- 已新增 `src/hooks/useMessages.gateway.ts`
- `useWebSocket` 事件处理与 `🦞` 状态解析已从 `useMessages` 抽离
- 已新增 `src/hooks/useMessages.runtime.ts`
- streaming lifecycle、timeout cleanup、stream completion handling 已从 `useMessages` 抽离
- `useMessages` 当前主要保留状态组合与发送入口
- Exit Criteria:
- `useMessages.ts` 不再同时管理所有职责
- 现有 hooks tests 继续通过，必要时补测试

### Phase 4

- Tag: `refactor-plan-phase4-settings-schema`
- Target: 把连接设置页从硬编码分支改成 schema 驱动
- Files:
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/`
- `src/hooks/settings/`
- Work Items:
- 抽出 provider form schema
- 抽出 provider field mapper
- 抽出 test payload builder
- 减少 `currentProviderId === ...` 条件分支
- Exit Criteria:
- 新增 provider 时不再要求复制整段 JSX/条件分支
- 设置页连接测试逻辑由映射层统一生成

### Phase 5

- Tag: `refactor-plan-phase5-script-adapter-wizard-state`
- Target: 降低 `ScriptAdapterApp.tsx` 和任务创建向导的状态复杂度
- Files:
- `src/modules/script-adapter/ScriptAdapterApp.tsx`
- `src/modules/script-adapter/store/`
- `src/modules/script-adapter/ui/`
- Work Items:
- 把任务创建流程状态迁移到 reducer 或 store slice
- 拆出 library data loading 和 wizard flow logic
- 抽出 footer action policy
- 降低页面组件内部的 `useState` 和 `handle*` 数量
- Exit Criteria:
- `TaskCreateWizard` 以容器 + 视图片区分层
- 关键业务流程可单独测试

## Execution Order

1. Phase 1: 先消除网关重复逻辑，避免后续拆 config 时继续扩散。
2. Phase 2: 再拆配置系统，给后续 provider/schema 改造打基础。
3. Phase 3: 稳定聊天前端状态边界，降低回归半径。
4. Phase 4: 处理设置页硬编码分支。
5. Phase 5: 最后收敛 script-adapter 入口状态。

## Risk Controls

- 每阶段只改一条主线，不并行做跨前后端的大混合重构
- 优先保持外部接口和配置键不变
- 每阶段结束都补一条 changelog 和记一个阶段 tag
- 有测试的模块先保测试绿，再继续下一阶段

## Verification Baseline

- `npm test`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- 必要时针对 gateway 增加最小命令式回归验证

## Done Definition

- 每阶段有独立提交
- 每阶段有对应阶段 tag
- 每阶段有文档回填
- Phase 5 完成后，再评估是否继续进入第二轮细化重构
