# Week 7.5 — OCT 真实试产 MVP + DOCX 交付闭环 Prompt(Cursor / Claude 交接包)

> 2026-04-27 实际执行说明:
> 本文已按“Week 7 骨架收口 + 真实试产可控化 + DOCX 主交付”方向执行。
> 实装结果与取舍见 `docs/03_specs/Week7.5-Execution-Summary.md`。

> 状态:Week 7 已完成批次生产骨架,但尚未闭合“真实 Agent 试产 -> 客户可读 DOCX 产物”链路  
> 工期:**1 - 2 天**  
> 核心定调:**不做 Week 8 大扩展,只把最小真实 MVP 跑通并导出 Word 交付物**  
> 双线:Track 1 真实试产开关 + 批次链路 hotfix + 预算/选项补齐 / Track 2 DOCX 交付包 + 试产验收样本  
> 风险等级:中高(第一次要求真实 Agent 输出可交付文档,不能停留在 mock / Markdown)

---

## 〇、Week 7.5 总目标

Zilong 一句话验收:**“我能在 UI 里选择一本书的 1 章或 3-5 章,打开真实 Agent 试产,关闭高费用 BGM/SFX,确认预算后跑完,最后拿到一份能给制作团队看的 `.docx`。”**

Week 7.5 不是 Week 8。不要在本阶段追求完整全书一致性、术语 Bible、复杂暂停恢复、并发调度、`.epub` 或完整交付模式矩阵。

本阶段只解决 5 件事:

1. 修通 Week 7 批次 IPC 响应链路,确保前端 `scriptAdapter.batch.*` 不再超时。
2. 把真实 Agent 启用从“配置文件 / 环境变量”变成 UI 可控,不要求 Zilong 开终端。
3. 在预算面板中明确显示并控制 `CV 演播指导`、`BGM/SFX 建议`、`质检报告` 等可选成本项。
4. 增加 `.docx` 导出,把 Markdown 从客户主交付降级为内部留痕。
5. 产出一份真实试产证明:真实 Agent 跑出的单章或 3-5 章 DOCX。

---

## 〇.1、为什么需要 Week 7.5

Week 7 已经有:

1. `BatchJob -> ChapterRun` 二层模型。
2. SQLite 持久化。
3. 章节范围选择。
4. 批次进度与历史。
5. 整批 Markdown 导出。

但 Week 7 还没有完全满足“敢交给客户前自己先跑一遍”的条件:

1. **批次响应漏接**:Electron 当前只处理 `scriptAdapter.run.*` 的 response,没有处理 `scriptAdapter.batch.*`,批次启动 / 查询可能在前端超时。
2. **真实 Agent 开关不在 UI**:当前真实 Agent 主要依赖 `SCRIPT_ADAPTER_REAL_AGENTS`,不符合 Zilong 不开终端、不动配置文件的要求。
3. **高费用选项表达不够清晰**:当前 UI 是一个 `开启 BGM / SFX / CV 演播设计` 复合开关,但实际产品上 CV 指导和 BGM/SFX 成本、用途不同,需要拆清楚。
4. **Markdown 不是客户交付物**:制作团队客户更容易接受 Word 文档,MD 只适合内部调试。
5. **缺少真实试产验收样本**:需要一份真实书稿输入后生成的 `.docx`,证明链路不是演示壳。

---

## 〇.2、Week 7.5 的边界

### 必须做

1. 修 `scriptAdapter.batch.*` response 回传。
2. UI 增加“试产模式”:
   - `模拟演示`
   - `真实 Agent 试产`
3. UI 增加交付内容开关:
   - `多人演播台本` 必选
   - `角色音表` 默认开
   - `质检报告` 默认开
   - `CV 演播指导` 默认关或按模式开启
   - `BGM/SFX 建议` 默认关,并标为高费用项
4. 批量 start payload 带上本次任务的 real agent 与 delivery options,不要让用户改 `.env`。
5. `.docx` 导出:
   - 单章 DOCX
   - 批次 DOCX
6. 导出文档中不出现未勾选模块的空标题。
7. docs/changelog 写清楚“复制粘贴就能用”的开关说明,但优先提供 UI 路径,不要要求 Zilong 开终端。

### 明确不做

1. 不做全书 BookBible。
2. 不做 `.epub`。
3. 不做完整“经济 / 标准 / 增强 / 自定义”矩阵。
4. 不做并发执行。
5. 不做复杂供应商价格后台配置。
6. 不做真实全书一百万字首轮验收。
7. 不把 BGM/SFX 默认打开。

---

## 〇.3、最小 MVP 定义

### MVP 输入

1. 书库中已有一本书。
2. 用户选择:
   - 单章,或
   - 3-5 章小批量。

### MVP 执行

1. 真实 Agent 试产开关打开。
2. 默认执行:
   - 文本改编 Agent
   - 角色音 Agent
   - 质检 Agent
   - 交付打包
3. 默认关闭:
   - BGM/SFX 建议
4. 可选打开:
   - CV 演播指导

### MVP 产物

必须生成:

1. `.docx`:客户可读主交付物。
2. `.md`:内部留痕与问题排查。

可选生成:

1. `.json`:结构化 artifact 存档。

### MVP 通过标准

Zilong 不看代码、不跑终端,只做:

1. 在 UI 中选择书和章节。
2. 打开真实 Agent 试产。
3. 确认预算。
4. 等待任务完成。
5. 点击导出 DOCX。
6. 用 Word / WPS 打开文档,检查内容是否可读、可交付。

---

# Track 1 — 真实试产开关、批次链路 hotfix、预算选项补齐

## 1 总目标

让“真实跑一次”从工程配置变成产品操作。

用户不应该理解 `SCRIPT_ADAPTER_REAL_AGENTS`。UI 应该直接告诉用户:

```text
试产模式
[ ] 模拟演示:不花模型费用,用于看流程
[x] 真实 Agent 试产:会调用模型并产生费用
```

---

## 1.1 — 修复 Electron 批次 response 漏接

### 当前问题

Gateway 已实现:

```text
scriptAdapter.batch.start
scriptAdapter.batch.status
scriptAdapter.batch.list
scriptAdapter.batch.cancel
scriptAdapter.batch.rerunChapter
scriptAdapter.batch.delete
```

Electron main 发送请求也已实现,但 response 分发处只处理:

```typescript
msg.method.startsWith('scriptAdapter.run.')
```

导致 `scriptAdapter.batch.*` response 没有 resolve pending request,前端表现为 Gateway 请求超时。

### 修改目标

把判断改为:

```typescript
msg.method.startsWith('scriptAdapter.run.')
|| msg.method.startsWith('scriptAdapter.batch.')
```

或更稳妥:

```typescript
msg.method.startsWith('scriptAdapter.')
```

但注意不要误吞 `image.generate` 等其它 method。

### 文件

- 修改:`electron/main.ts`

### Done criteria

- 点击“确认预算并启动批次”不再超时。
- `status / list / rerunChapter / cancel / delete` 都能收到响应。
- `npx tsc -p tsconfig.electron.json --noEmit` 通过。

---

## 1.2 — 真实 Agent 试产开关

### 产品目标

Zilong 不改 `.env`、不改 `config.json`、不开终端。真实 Agent 是否启用必须从 UI 传入本次任务。

### UI 文案建议

```text
试产模式

模拟演示
不调用真实模型,适合检查流程和界面。

真实 Agent 试产
调用真实模型生成台本、角色音和质检结果,会产生费用。
建议先跑 1 章,合格后再跑 3-5 章。
```

### 类型建议

```typescript
export type TrialExecutionMode = 'mock' | 'real';

export interface TrialRunOptions {
  executionMode: TrialExecutionMode;
  realAgents: 'off' | 'all' | string[];
  safetyPreset: 'single_chapter' | 'small_batch';
}
```

### 前端 payload 建议

```typescript
startGatewayBatch({
  bookId,
  bookTitle,
  chapterIndices,
  estimate,
  config: {
    executionMode: 'real',
    realAgents: 'all',
    includeVoiceRegistry: true,
    includeQualityReview: true,
    includeCvDirections: false,
    includeBgmSfx: false
  }
});
```

### Gateway 侧建议

当前 `mockArtifactFactory.js` 的真实 Agent 判断只读全局配置。Week 7.5 要支持本次任务覆盖:

```javascript
function isRealAgentEnabled(agentId, ctx = {}) {
  const override = ctx?.realAgentsOverride;
  if (override) return matchAgentFlag(override, agentId);
  return matchAgentFlag(getScriptAdapterRealAgentsRaw(), agentId);
}
```

并在 `agentRunner` / `batchOrchestrator` 传入:

```javascript
ctx: {
  sourceText,
  realAgentsOverride: batch.config?.realAgents || 'off',
  deliveryOptions: batch.config?.deliveryOptions || {}
}
```

### 文件

- 修改:`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
- 修改:`src/modules/script-adapter/services/gatewayBatch.ts`
- 修改:`src/modules/script-adapter/types/batch.ts`
- 修改:`oct-gateway/script_adapter/batchOrchestrator.js`
- 修改:`oct-gateway/script_adapter/agentRunner.js`
- 修改:`oct-gateway/script_adapter/mockArtifactFactory.js`

### Done criteria

- UI 选择“模拟演示”时,不调用真实模型。
- UI 选择“真实 Agent 试产”时,不需要改配置即可调用真实 Agent。
- 单章真实跑能产出非 mock 的 adapted_script / voice_registry / review_report。
- Changelog 必须写清楚:
  - UI 路径:`内容创作工作台 -> 批次试产 -> 试产模式 -> 真实 Agent 试产`
  - 备用配置行:`SCRIPT_ADAPTER_REAL_AGENTS=all`
  - 明确说明 Zilong 默认不用备用配置。

---

## 1.3 — 拆清楚交付内容开关

### 当前问题

当前 UI 可见的是:

```text
开启 BGM / SFX / CV 演播设计
```

这个开关把 3 类不同成本和用途混在一起:

1. `CV 演播指导`:给配音演员看的情绪 / 语速 / 气口建议。
2. `BGM 建议`:给后期或导演看的配乐氛围建议。
3. `SFX 建议`:给后期看的音效点建议。

真实试产 MVP 里,BGM/SFX 应先默认关闭,因为:

1. 成本会放大。
2. 制作团队初期更关心台本和角色音是否可用。
3. BGM/SFX 的质量评判更主观,容易拖慢第一轮验收。

### UI 调整

预算面板中改成:

```text
本次交付内容
[x] 多人演播台本 必选
[x] 角色音表 建议开启
[x] 质检报告 建议开启
[ ] CV 演播指导 可选,会增加费用
[ ] BGM/SFX 建议 高费用项,默认关闭
```

当章节数 > 5 且打开 BGM/SFX:

```text
BGM/SFX 会按章节额外调用模型。建议先关闭,等台本质量确认后再单独生成。
```

### 类型建议

```typescript
export interface DeliveryOptions {
  adaptedScript: true;
  voiceRegistry: boolean;
  qualityReview: boolean;
  cvDirections: boolean;
  bgmSfx: boolean;
  finalPackage: boolean;
}
```

### 执行策略

1. `adaptedScript`:必跑。
2. `voiceRegistry`:默认跑。
3. `qualityReview`:默认跑。
4. `cvDirections`:可选。
5. `bgmSfx`:可选且默认关。
6. 如果 `cvDirections=false` 且 `bgmSfx=false`,不跑 `performanceDesignerAgent`。
7. 如果 `cvDirections=true` 且 `bgmSfx=false`,可以先跑同一个 agent,但输出时只保留 `cvDirections`,不要导出 BGM/SFX 空段。
8. 如果 `cvDirections=false` 且 `bgmSfx=true`,输出只保留 BGM/SFX。

### 文件

- 修改:`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
- 修改:`src/modules/script-adapter/services/batchBudget.ts`
- 修改:`src/modules/script-adapter/types/batch.ts`
- 修改:`oct-gateway/script_adapter/mock_execution.js`
- 修改:`oct-gateway/script_adapter/mockArtifactFactory.js`
- 修改:`oct-gateway/script_adapter/agents/performanceDesignerAgent.js` 或在 dispatcher 中裁剪 payload

### Done criteria

- UI 上能明确看到 BGM/SFX 默认关闭。
- 开关 BGM/SFX 后预算有变化。
- 未勾选 BGM/SFX 时,DOCX 和 Markdown 都不出现 BGM/SFX 章节。
- 未勾选 CV 指导时,DOCX 不出现 CV 指导章节。

---

## 1.4 — 安全试产预算闸门

### 目标

真实 Agent 试产必须保护用户不要误跑全书。

### 规则

1. `真实 Agent 试产` + `全书`:
   - 阻止直接启动。
   - 提示:“首次真实试产建议先跑 1 章或 3-5 章。”
2. `真实 Agent 试产` + `章节数 > 5`:
   - 允许启动,但二次确认。
3. `BGM/SFX` + `章节数 > 5`:
   - 二次确认。
4. 预算显示必须区分:
   - 基础台本 / 角色音 / 质检
   - CV 演播指导
   - BGM/SFX

### UI 文案建议

```text
真实试产建议
当前选择 5 章 / 约 4.2 万字。
建议先关闭 BGM/SFX,验证台本和角色音质量后再扩展。

预计费用:约 ¥X - ¥Y
预计耗时:约 X - Y 分钟
```

### Done criteria

- 用户无法一键误跑全书真实 Agent。
- 开工前能看到 BGM/SFX 是否关闭。
- 预算确认弹窗中列出本次启用的交付项。

---

# Track 2 — DOCX 交付包与真实试产证明

## 2 总目标

让产物从“开发者可读 Markdown”升级为“客户可打开 Word 文档”。

客户主交付不应是 `.md`。Markdown 保留,但定位为:

1. 内部审查。
2. 版本留痕。
3. 问题定位。

客户主交付应是 `.docx`。

---

## 2.1 — DOCX 导出技术方案

### 推荐方案

新增 `docx` npm 依赖,在 Electron main 进程生成 `.docx`。

原因:

1. 当前项目已有 `mammoth`,但它是 DOCX 读取工具,不是可靠写入工具。
2. 不建议把 HTML 伪装成 `.docx`,客户打开体验不可控。
3. Electron main 已经负责 `delivery:exportMarkdown`,继续放在 main 进程最自然。

### 依赖建议

```json
"docx": "^9.x"
```

如果 Cursor 不想立刻加新依赖,可以先做 Word-compatible `.doc` HTML 作为临时演示,但 Week 7.5 验收必须以真 `.docx` 为准。

### IPC 建议

```typescript
window.electronAPI.delivery.exportDocx({
  filename,
  documentTitle,
  sections,
  metadata
});
```

### 数据结构建议

```typescript
export interface DocxExportPayload {
  filename: string;
  documentTitle: string;
  subtitle?: string;
  metadata?: Array<{ label: string; value: string }>;
  sections: DocxSection[];
}

export interface DocxSection {
  title: string;
  level: 1 | 2 | 3;
  blocks: DocxBlock[];
}

export type DocxBlock =
  | { type: 'paragraph'; text: string; style?: 'normal' | 'note' | 'warning' }
  | { type: 'scriptLine'; speaker: string; text: string; note?: string }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'bullet'; items: string[] };
```

### 文件

- 新增:`src/modules/script-adapter/services/docxExport.ts`
- 修改:`src/modules/script-adapter/services/exportClient.ts`
- 修改:`src/types/electronAPI.ts`
- 修改:`electron/preload.ts`
- 修改:`electron/main.ts`
- 修改:`package.json`
- 修改:`package-lock.json` 或对应 lockfile

### Done criteria

- 单章 execution sheet 可导出 `.docx`。
- 批次 chapterRuns 可导出 `.docx`。
- 导出的文件可被 Word / WPS 打开。
- `npx tsc --noEmit` 和 Electron 类型检查通过。

---

## 2.2 — DOCX 内容结构

### 主文档文件名

单章:

```text
{书名}_{章节名}_多人演播试产交付.docx
```

批次:

```text
{书名}_第1-5章_多人演播试产交付.docx
```

### 文档结构

```text
封面
  项目名称
  书名
  章节范围
  生成时间
  试产模式:真实 Agent
  BGM/SFX:未启用

一、交付摘要
  本次处理章节
  已生成内容
  未启用内容
  需人工确认事项

二、角色音总表
  表格:角色 / 类别 / 出场次数 / 声线建议 / 备注

三、多人演播台本
  按章节展开
  每行格式:
    [旁白] ...
    [角色名] ...
    [内心] ...
  rewriteNote 可作为浅色备注,不要喧宾夺主

四、CV 演播指导
  仅在启用 cvDirections 时出现

五、BGM/SFX 建议
  仅在启用 bgmSfx 时出现

六、质检报告
  结论
  P0/P1/P2 问题表
  建议处理方式

七、失败 / 跳过章节
  仅存在失败章节时出现
```

### 重点要求

1. 不要把 JSON 原样塞进 Word。
2. 不要让客户看到 artifactId / runId / internal agent id。
3. 不要出现空章节标题。
4. 角色音表放在台本前,方便制作团队先分工。
5. BGM/SFX 未启用时,只在交付摘要里写“未启用”,不要生成专门章节。

### Done criteria

- 客户打开 DOCX 第一眼能知道这是什么项目、哪几章、启用了哪些内容。
- 台本部分可连续阅读。
- 角色音表是 Word 表格,不是纯文本 JSON。
- BGM/SFX 关闭时文档不出现空的 BGM/SFX 区块。

---

## 2.3 — 单章 DOCX 导出

### 目标

先闭合最小链路:

```text
书库选 1 章 -> 真实 Agent -> 单章 execution sheet -> DOCX
```

### UI 入口

在 `DeliveryPreview` 或执行完成区域增加:

```text
[导出 Markdown] [导出 Word DOCX]
```

### 输出内容

单章 DOCX 至少包含:

1. 封面 / 元信息。
2. 角色音表。
3. 多人演播台本。
4. 质检报告。
5. 如果启用 CV / BGM/SFX,再追加相关章节。

### Done criteria

- 用一段真实文本跑单章,导出 DOCX 可打开。
- DOCX 中台本内容来自真实 adapted_script,不是 mock 固定样例。

---

## 2.4 — 批次 DOCX 导出

### 目标

闭合小批量链路:

```text
书库选 3-5 章 -> 真实 Agent 串行 -> chapterRuns 持久化 -> 批次 DOCX
```

### UI 入口

`BatchProgressView` 中把导出按钮拆成:

```text
[导出 Word DOCX] [导出 Markdown 留痕]
```

默认主按钮是 DOCX。

### 输出内容

批次 DOCX 至少包含:

1. 交付摘要。
2. 整批角色音表。
3. 各章台本。
4. 质检汇总。
5. 失败章节清单。

### 失败章节策略

1. 已完成章节照常导出。
2. 失败章节进入“失败 / 跳过章节”。
3. 文档封面或摘要中标明:

```text
本次批次共 5 章,完成 4 章,失败 1 章。失败章节未进入台本正文。
```

### Done criteria

- 3-5 章真实试产后能导出 DOCX。
- 已完成章节按章节顺序排列。
- 失败章节不会让导出失败。

---

## 2.5 — 真实试产证明产物

### 目标

Cursor 完成 Week 7.5 后,必须留下真实产物,不是只说测试通过。

### 产物路径建议

```text
docs/05_changelog/artifacts/week7_5_real_mvp/
  sample-single-chapter-delivery.docx
  sample-batch-delivery.docx
  sample-batch-delivery.md
  sample-run-notes.md
```

如果真实书稿涉及版权或隐私,不要提交正文到仓库。可以改为:

```text
userData/script-adapter/exports/...
```

并在 changelog 中写明本机路径和截图说明。

### sample-run-notes.md 内容

```text
# Week 7.5 Real MVP Sample Run

书名:
章节范围:
试产模式:真实 Agent
BGM/SFX:关闭
CV 指导:关闭/开启
质检:开启
生成文件:
- xxx.docx
- xxx.md

人工检查:
- 台本是否可读:
- 角色音是否合理:
- 是否出现 mock 固定样例:
- 是否有空章节:
- 是否可交给制作团队:
```

### Done criteria

- Cursor 必须提供一份真实 `.docx` 文件路径。
- Cursor 必须说明是否使用真实 Agent。
- Cursor 必须说明 BGM/SFX 是否关闭。
- Cursor 必须说明是否发现 mock 占位或失败回退。

---

# 验收流程

## Zilong 5 分钟单章验收

```text
1. 打开内容创作工作台
2. 选择项目素材库中的一本书
3. 选择 1 章
4. 试产模式选择“真实 Agent 试产”
5. 保持 BGM/SFX 关闭
6. 确认预算并开工
7. 等待完成
8. 点击“导出 Word DOCX”
9. 用 Word / WPS 打开
10. 检查台本、角色音表、质检报告是否可读
```

## Zilong 15 分钟小批量验收

```text
1. 选择同一本书
2. 范围选 3-5 章
3. 真实 Agent 试产
4. BGM/SFX 关闭
5. CV 演播指导默认关闭,如要测试可只开 1 次
6. 确认预算并启动批次
7. 批次完成后导出 DOCX
8. 检查章节顺序、角色音汇总、失败章节清单
9. 判断这份文档是否能给制作团队讨论
```

---

# Week 7.5 验收标准

## Track 1 验收

- [ ] `scriptAdapter.batch.*` response 不再超时
- [ ] UI 有“模拟演示 / 真实 Agent 试产”开关
- [ ] 真实 Agent 试产不要求 Zilong 修改 `.env` 或 `config.json`
- [ ] UI 明确显示 BGM/SFX 默认关闭
- [ ] CV 演播指导与 BGM/SFX 在 UI 上分开
- [ ] 预算面板能反映交付项变化
- [ ] 真实试产全书时有拦截或强提醒
- [ ] `npx tsc --noEmit` 通过
- [ ] `npx tsc -p tsconfig.electron.json --noEmit` 通过

## Track 2 验收

- [ ] 单章真实 Agent 可导出 `.docx`
- [ ] 3-5 章批次真实 Agent 可导出 `.docx`
- [ ] `.docx` 可被 Word / WPS 打开
- [ ] `.docx` 不包含内部 artifactId / runId
- [ ] 未启用 BGM/SFX 时,文档不出现 BGM/SFX 空章节
- [ ] 角色音表是 Word 表格
- [ ] 失败章节不阻断 DOCX 导出
- [ ] Markdown 仍可作为内部留痕导出
- [ ] changelog 写明真实试产开关的 UI 路径和备用复制粘贴配置

---

# 推荐提交顺序

## Commit 1 — batch response hotfix

范围:

- `electron/main.ts`
- 最小测试 / 类型检查

提交信息:

```text
fix(electron): resolve script adapter batch responses
```

## Commit 2 — real trial mode and delivery options

范围:

- UI 试产模式
- delivery options 类型
- Gateway per-run realAgents override
- BGM/SFX 与 CV 分拆

提交信息:

```text
feat(script-adapter): add real trial mode and delivery option gates
```

## Commit 3 — DOCX export

范围:

- `docx` 依赖
- Electron exportDocx IPC
- export client
- 单章 / 批次 DOCX rendering

提交信息:

```text
feat(script-adapter): export real delivery packages as docx
```

## Commit 4 — docs and proof

范围:

- changelog
- sample run notes
- 真实产物路径说明

提交信息:

```text
docs(script-adapter): document week 7.5 real mvp proof
```

---

# 卡壳速查

1. **DOCX 依赖装不上**  
   先不要用 HTML 冒充最终产物。可以临时导出 `.doc` HTML 演示,但 Week 7.5 最终验收仍必须回到真 `.docx`。

2. **真实 Agent 输出失败**  
   不要让 pipeline 崩。保持现有 fallback,但 DOCX 和 sample-run-notes 必须标明“该章节使用失败回退”,不能伪装成功。

3. **BGM/SFX 关闭后质检 Agent 报缺少 performance_design**  
   修改质检 prompt / 输入摘要,让它知道本次未启用演播设计,不要把缺失当错误。

4. **CV 指导和 BGM/SFX 暂时仍由同一个 Agent 生成**  
   可以接受,但导出层必须按用户选项裁剪。未选 BGM/SFX 就不展示 BGM/SFX。

5. **预算估算不准**  
   Week 7.5 允许粗估,但必须标注“预估”。重点是开工前让用户知道会产生费用,不是做财务级结算。

6. **客户看不懂质检术语**  
   DOCX 中使用“需要确认 / 建议调整 / 可进入制作”这类自然语言,不要只写 P0/P1/P2。

---

# 给 Cursor / Claude 的最后提醒

Week 7.5 的成功标准不是“功能列表变长”,而是这条链真的跑通:

```text
书库章节
  -> UI 选择真实试产
  -> 预算确认
  -> 真实 Agent 逐章生成
  -> 本地保存
  -> DOCX 导出
  -> Zilong 打开 Word 看得懂
```

如果这条链闭合,哪怕只跑 1 章,也是可验证 MVP。

如果这条链没闭合,即使做了全书按钮、历史页和更多开关,也还不能交给客户。

---

## 相关文档

- Week 7 合并总结:`docs/03_specs/Week7-Merged-Execution-Summary.md`
- Week 7 批量生产方案:`docs/03_specs/Week7-Dual-Track-Cowork-Handoff.md`
- Week 6 交付导出与切片:`docs/05_changelog/2026-04-27-script-adapter-export-and-chunking.md`
- 多人演播 Agent 编排:`docs/03_specs/内容创作工作台/多人演播有声书Agent团队编排规范.md`
- Gateway 执行桥:`docs/03_specs/内容创作工作台/内容创作Gateway执行桥接协议.md`
