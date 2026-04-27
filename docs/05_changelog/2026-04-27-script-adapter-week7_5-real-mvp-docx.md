# 2026-04-27 Script Adapter Week 7.5 真实试产与 DOCX 导出

## 这次做了什么

Week 7.5 重点不是继续加批次功能，而是把 Week 7 的批次骨架收口成“可以真实试产并导出 Word 文档”的 MVP。

本次完成:

1. 修复 `scriptAdapter.batch.*` response 回传
2. 增加 UI 级 `模拟演示 / 真实 Agent 试产`
3. 拆分交付项开关
4. 接入 `.docx` 导出
5. 让 Markdown / DOCX 都按选项裁剪输出

## 代码变更

### Electron / IPC

- 更新 `electron/main.ts`
  - `scriptAdapter.batch.*` response resolve hotfix
  - `script-adapter-run-start` 支持传入 `config`
  - 新增 `delivery:exportDocx`
- 更新 `electron/preload.ts`
  - 暴露 `delivery.exportDocx`
- 更新 `src/types/electronAPI.ts`
  - 增加对应类型

### Frontend

- 更新 `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
  - 试产模式开关
  - 交付项开关
  - 预算细分
- 更新 `src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`
  - 批次主导出按钮改为 DOCX
- 更新 `src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx`
  - 单章支持 DOCX 导出
- 更新 `src/modules/script-adapter/services/batchBudget.ts`
  - 成本按交付项拆分
- 更新 `src/modules/script-adapter/services/exportClient.ts`
  - 新增单章 / 批次 DOCX 导出构建

### Gateway

- 更新 `oct-gateway/script_adapter/mock_execution.js`
  - 本次任务级 `deliveryOptions`
  - 本次任务级 `realAgents`
- 更新 `oct-gateway/script_adapter/mockArtifactFactory.js`
  - 支持 `realAgentsOverride`
  - `performance_design` 按选项裁剪
- 更新 `oct-gateway/script_adapter/batchOrchestrator.js`
  - 批次保存并透传 `executionMode / realAgents / deliveryOptions`

## 用户路径

UI 路径:

`内容创作工作台 -> 批次章节范围 -> 试产模式 -> 真实 Agent 试产`

然后:

`本次交付内容 -> 勾选 / 取消 CV 演播指导 与 BGM/SFX 建议 -> 确认预算并启动批次`

完成后:

- 单章: `导出 Word DOCX`
- 批次: `导出 Word DOCX`

备用配置:

- `SCRIPT_ADAPTER_REAL_AGENTS=all`

说明:

- 这是备用方式
- 默认不要求 Zilong 手动配置

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
- `node -e "import('docx').then(()=>console.log('docx ok'))"`

结果:

- 类型检查通过
- Electron 类型检查通过
- Vitest 通过
- `docx` 依赖可用

## 这次没有包含

1. `pause / resume`
2. 预算超限自动暂停
3. 全书一致性层
4. `.epub`
5. 仓库内真实试产 DOCX 样本归档

## 现阶段结论

Week 7.5 现在已经支持:

- 在 UI 中直接选择真实试产
- 明确关闭高费用 BGM/SFX
- 预算确认后运行
- 导出真实 `.docx` 主交付物

这已经足够作为“单章 / 3-5 章真实试产 MVP”继续往下一步推进。
