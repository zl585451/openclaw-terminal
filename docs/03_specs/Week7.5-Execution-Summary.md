# Week 7.5 — 真实试产 MVP 与 DOCX 收口总结

> 日期: 2026-04-27
> 结论: Week 7.5 已按“真实试产可控化 + DOCX 主交付化”的目标收口。

## 本次实际完成内容

### 1. 批次 response hotfix

- Electron 现在不只处理 `scriptAdapter.run.*`
- 也会正确 resolve `scriptAdapter.batch.*`
- 批次的 `start / status / list / rerunChapter / cancel / delete` 不再因 pending request 不回收而超时

### 2. 真实 Agent 试产开关进入 UI

工作台预算区域现在提供:

- `模拟演示`
- `真实 Agent 试产`

本次不是要求用户改 `.env` 或 `config.json`，而是把本次任务的执行模式透传给 Gateway。

### 3. 交付项从单一总开关拆成可理解项

当前 UI 已拆成:

- 多人演播台本
- 角色音表
- 质检报告
- CV 演播指导
- BGM/SFX 建议

并且:

- `BGM/SFX` 默认关闭
- `CV` 与 `BGM/SFX` 分开控制
- 预算会随这些选项变化

### 4. 单章 / 批次 DOCX 导出链路

已新增 Word 导出能力:

- 单章 `DeliveryPreview` 支持 `导出 Word DOCX`
- 批次 `BatchProgressView` 支持 `导出 Word DOCX`
- Electron main 通过 `docx` 依赖生成真实 `.docx`

### 5. 导出内容按选项裁剪

导出层现在会避免输出未启用的空模块:

- 未启用 `BGM/SFX` 时，不导出空的 BGM/SFX 区块
- 未启用 `CV` 时，不导出空的 CV 指导区块
- Markdown 与 DOCX 都按同样原则裁剪

## 本次采用的实现策略

本次没有把 Week 7.5 做成一个全新的系统，而是在 Week 7 批次骨架上继续收口:

1. 保留 Week 7 的 `BatchJob -> ChapterRun`、SQLite、串行执行
2. 在此基础上新增本次任务级的:
   - `executionMode`
   - `realAgents`
   - `deliveryOptions`
3. 继续复用现有单章 pipeline，不重写 5 个 Agent
4. 把主要新增工作集中在:
   - Electron response 分发
   - 执行上下文透传
   - 导出层
   - 工作台预算 / 开关 UI

## 本次没有完成的部分

以下内容仍然留在后续迭代:

1. 真正的 `pause / resume`
2. 费用上限自动暂停
3. 更复杂的“经济 / 标准 / 增强 / 自定义”完整矩阵
4. `.epub` 导出
5. 全书一致性层
6. 真实 3-5 章样本 DOCX 的仓库内留档

## 为什么这样切

Week 7.5 的目标不是继续铺功能面，而是把下面这条链闭合:

```text
书库章节
  -> UI 选择真实试产
  -> 预算确认
  -> 真实 / 模拟执行透传
  -> 逐章生成
  -> DOCX 导出
  -> 用户可直接在 Word / WPS 中打开
```

只要这条链打通，Week 7.5 就成立。

## 验证情况

已完成的本地验证:

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
- `node -e "import('docx').then(()=>console.log('docx ok'))"`

说明:

- 类型检查通过
- Electron 类型检查通过
- Vitest 通过
- `docx` 依赖可正常加载

## 当前判断

Week 7.5 现在已经把产品从“批次骨架 + Markdown 留痕”推进到了“**可切真实试产、可控高费用项、可导出 Word 主交付**”。

它仍然不是完整生产系统，但已经足够支撑:

1. 单章真实试产
2. 3-5 章小批量真实试产
3. 用 DOCX 给制作团队做第一轮讨论

## 下一步建议

### Week 8 优先

1. 做 `pause / resume`
2. 做预算上限自动暂停
3. 补真实 3-5 章试产录屏 / 截图 / 样本路径
4. 把失败章节清单导出独立化

### Week 8.5 / 9

1. 完整交付模式矩阵
2. 角色别名归并与术语一致性
3. `.docx + .md + .json` 打包交付
4. `.epub` / 整书导出
