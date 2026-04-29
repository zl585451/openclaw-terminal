# 2026-04-29 真实批次失败状态修复

## 背景

用户在真实 Agent 制作第 4 章时看到顶部提示“试产已完成，交付物可以导出了”，但章节行显示 `failed`，统计也显示 `0/1` 完成、`1` 失败。继续排查本地批次数据库后确认，章节失败原因是 `REAL_BATCH_CONTAINS_MOCK_ARTIFACT: adapted_script`。

## 根因

1. `agentRunner` 调用产物生成器时只传入了局部上下文，导致 `realAgentsOverride: all` 和 `deliveryOptions` 没有进入 `createArtifactForAgent`。
2. 真实批次里的 Agent 产物生成因此可能走到 mock fallback，随后被真实批次 mock 防漏 guard 拦截。
3. `batchOrchestrator` 的最终状态汇总只看是否还有 `pending` 章节，没有把 failed 章节抬升为批次 `failed`。
4. 前端只按 `batch.status === completed` 展示交付窗口，未额外校验失败章数。

## 修改

1. `agentRunner` 现在把完整 `ctx` 透传给 `createArtifactForAgent`，确保真实模式、交付选项和共享角色音上下文都能进入真实 Agent 选择逻辑。
2. Agent 产物生成失败时，当前 Agent Run 会标记为 `failed`，并把失败时的 `TaskExecutionSheet` 附着在错误对象上。
3. `batchOrchestrator` 在章节失败时持久化失败现场 sheet，便于前端展开查看卡住的 Agent 与错误。
4. 批次最终汇总新增 failed 优先级：只要存在失败章节，批次状态就是 `failed`，不会再显示为 `completed`。
5. `BatchProgressView` 和 `BatchExecutionPanel` 只有在 `status=completed` 且 `failedChapters=0` 时才显示完成交付；失败批次显示失败提示、错误原因和重跑入口。
6. Gateway 启动时会把历史上 `status=completed` 且 `failedChapters>0` 的批次迁移为 `failed`，避免旧错误状态继续污染当前工作台。

## 验证

1. `node --check oct-gateway/script_adapter/agentRunner.js`
2. `node --check oct-gateway/script_adapter/batchOrchestrator.js`
3. `npx tsc --noEmit`
4. `npx tsc -p tsconfig.electron.json --noEmit`
