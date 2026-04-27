# Week 7 — 合并执行总结

> 日期: 2026-04-27
> 结论: Week 7 按“**方案一做批次执行骨架 + 方案二借预算闸门前置**”落地。

## 本次实际采用的合并方式

本次没有机械地二选一，而是按当前代码现状做了收敛:

1. 以 `Week7-Batch-and-Book-Level-Handoff` 为主骨架
   - 先落 Gateway 批次执行内核
   - 建立 `batch_jobs + chapter_runs` SQLite 持久化
   - 保持单章 pipeline 复用，不改 5 个 Agent 内部实现
   - 批次串行调度、失败隔离、重启后 running → paused

2. 从 `Week7-Dual-Track-Cowork-Handoff` 中前置最有价值的产品控制点
   - 章节范围选择
   - 预算闸门
   - `BGM / SFX / CV` 作为独立高成本开关
   - 批次进度与历史入口

3. 主动缩掉本周会显著放大范围的部分
   - 没有完整做“经济 / 标准 / 增强 / 自定义”四档交付模式
   - 没有做 pause / resume 真正状态机
   - 没有做 JSON store，再迁 SQLite；而是直接一步到位用 SQLite

## 已执行部分

### 后端

- 新增 `oct-gateway/script_adapter/persistence.js`
  - SQLite 持久化 `batch_jobs / chapter_runs`
- 新增 `oct-gateway/script_adapter/batchOrchestrator.js`
  - `scriptAdapter.batch.start`
  - `scriptAdapter.batch.status`
  - `scriptAdapter.batch.list`
  - `scriptAdapter.batch.cancel`
  - `scriptAdapter.batch.rerunChapter`
  - `scriptAdapter.batch.delete`
- 复用现有单章 `mock_execution` 作为每章执行内核
- 批次按章节串行执行，单章失败不拖垮整批
- Gateway 启动时自动把中断的 `running` 批次修正为 `paused`
- 轻量跨章一致性:
  - 通过批次 `sharedContext.voiceRegistry` 累积角色音
  - 已锁角色在后续章节结果中保持优先

### 前端

- 工作台新增批次入口，同时保留单章测试入口
- 新增 `ChapterRangeSelector`
  - 范围 / 离散 / 全书
  - 轻量虚拟滚动
  - Shift 连选
- 新增预算闸门
  - 章节数
  - 总字数
  - 预计耗时
  - 预计费用
  - 高成本提示
- 新增 `BatchProgressView`
  - 每章状态
  - 失败重跑
  - 完成章节展开单章交付预览
- 新增批次历史区
- 新增整批 Markdown 合并导出

## 本次没有执行的部分

以下内容保留到 Week 8+，本次明确未做:

1. `pause / resume` 真正可恢复执行
2. 完整交付模式矩阵
   - 经济模式
   - 标准模式
   - 制作增强模式
   - 自定义模式
3. 费用上限触发自动暂停
4. 并发批次执行
5. 全书级一致性层
   - 术语词典
   - 剧情记忆
   - 风格基线
6. 失败章节清单单独导出文件
7. `.docx / .epub` 整书导出
8. 角色别名归并

## 为什么这样切

因为当前代码基线仍然是“单章执行单 + 单章交付预览”。

如果 Week 7 同时把:

- 批次执行
- 完整交付裁剪
- 预算上限状态机
- 暂停继续
- 全书一致性

一起铺开，风险会明显高于收益。

所以本次优先做的是:

1. 让系统真正能跑多章
2. 让用户开工前知道大概要花多少
3. 让失败不拖垮整批
4. 让结果能持久化、能回看、能导出

## 下一步建议

### Week 8

1. 做 `pause / resume`
2. 补费用上限自动暂停
3. 把批次历史从“列表 + 打开详情”升级成正式只读详情页
4. 把失败章节清单独立导出
5. 加强跨章一致性
   - 角色别名归并
   - 术语 / 地名锁定

### Week 9

1. 补完整交付模式矩阵
2. 做整书 `.docx / .epub`
3. 做并发执行和 provider 限流策略
4. 做批次级成本统计与设置面板联动

## 当前结论

Week 7 现状已经从“单章样章工具”推进到了“**可预算、可恢复、可回看、可导出的批次生产骨架**”。

这不是终局版全书制作系统，但已经是一个能继续往生产能力迭代的正确底座。
