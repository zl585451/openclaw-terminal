# Render Protocol v3 执行计划

日期：2026-05-19

建议分支：`codex/render-protocol-v3-structured-blocks`

## Phase Status

| Phase | Status | Branch | Evidence |
|---|---|---|---|
| Phase 0：现状盘点与风险冻结 | Completed | `codex/render-protocol-v3-structured-blocks` | `docs/04_dev_guides/2026-05-19-render-protocol-v3-phase0-baseline.md` |
| Phase 1：定义 Render Blocks Schema | Completed | `codex/render-protocol-v3-structured-blocks` | `docs/03_specs/RENDER_BLOCKS_SCHEMA.md` |
| Phase 2：Gateway Render Normalizer | Completed | `codex/render-protocol-v3-structured-blocks` | `oct-gateway/services/renderBlocksNormalizer.js`, `oct-gateway/test/renderBlocksNormalizer.test.js` |
| Phase 3：前端 Render Blocks 渲染层 | Completed | `codex/render-protocol-v3-structured-blocks` | `src/ui/chat/renderBlocksAdapter.ts`, `src/ui/chat/renderBlocksAdapter.test.ts`, `src/ui/chat/MessageList.tsx` |
| Phase 4：Provider Adapter 与提示词分层 | Completed | `codex/render-protocol-v3-structured-blocks` | `docs/03_specs/RENDER_PROVIDER_CAPABILITIES.md`, `oct-gateway/providers.js`, `oct-gateway/runtime/providerRouter.js` |
| Phase 5：Golden Tests 与稳定性压测 | Completed | `codex/render-protocol-v3-structured-blocks` | `src/ui/chat/__fixtures__/renderProtocolV3GoldenFixtures.ts`, `src/ui/chat/renderProtocolV3Golden.test.ts`, `oct-gateway/test/renderBlocksNormalizer.test.js` |
| Phase 6：迁移与 Legacy 收敛 | Completed | `codex/render-protocol-v3-structured-blocks` | `src/utils/optionBoxParser.ts`, `src/utils/optionBoxParser.test.ts`, `docs/01_system_prompts/OCT_PROTOCOL.md`, `docs/03_specs/RENDER_PROTOCOL.md` |

## 背景

Render Protocol v2 已经提升了 Markdown、代码块、表格和交互标签的基础稳定性，但近期 Google 渠道模型测试暴露出更深一层的问题：

- 模型会用自然语言表达“任务清单”和“胶囊选项”，但前端只能靠文本形态猜。
- 同一意图在不同模型里可能写成 `[pills]`、`■ 选项`、Markdown checkbox、加粗 checkbox 或普通段落。
- 单点补 parser 规则能修一个样例，但无法保证 Claude、GPT、Gemini、DeepSeek 等模型长期稳定。
- 交互组件不应该依赖 Markdown 猜测；应由结构化协议明确表达。

结论：v3 的目标不是继续增强正则，而是建立“结构化渲染意图”链路，让模型、Gateway 和前端各司其职。

## 总目标

将当前“Markdown + 标签 + 自动检测”的混合协议，升级为：

1. 模型输出渲染意图。
2. Gateway 解析、校验、修复或降级。
3. 前端接收确定性的 `render_blocks` 并渲染组件。
4. 旧协议继续兼容，但退到兜底层。

目标效果：

- `TaskList` 和 `PillOptionBox` 不再互相抢占。
- 表格、代码块、普通列表和交互组件互不污染。
- 不同 provider 的输出差异由 adapter 消化，不直接暴露给前端。
- 测试从“肉眼看截图”升级为自动化 golden tests。

## 核心原则

- **结构优先**：交互组件优先走 schema，不靠 Markdown 猜。
- **Markdown 退位**：Markdown 只负责正文、代码、表格等展示内容。
- **Gateway 守门**：前端不负责猜模型意图，只负责渲染已校验结构。
- **兼容渐进**：保留 `[pills]`、`[tasklist]`、`[clarify_card]` 和自动检测作为 legacy fallback。
- **Provider 适配**：Google、DeepSeek、OpenAI、Claude 允许不同输出形态，但最终收敛到同一 `render_blocks`。
- **失败可降级**：schema 不合法时显示安全 Markdown，不白屏，不泄露半截协议。

## 建议标准格式

v3 推荐引入 `render_blocks` 作为内部标准结构。模型可以直接输出，也可以由 Gateway 从 legacy 文本转换得到。

```json
{
  "version": "3.0",
  "blocks": [
    {
      "type": "markdown",
      "content": "下面是修复流程。"
    },
    {
      "type": "tasklist",
      "title": "接下来需要执行的任务清单",
      "items": [
        { "id": "reproduce", "label": "复现并记录 Bug 现象" },
        { "id": "locate", "label": "定位相关文件和调用链" }
      ]
    },
    {
      "type": "pills",
      "prompt": "是否需要我提供代码模板？",
      "items": [
        { "label": "需要，提供代码模板", "value": "需要代码模板" },
        { "label": "暂不需要，直接修 Bug", "value": "不需要代码模板" }
      ]
    }
  ]
}
```

第一阶段不要求模型完全直接输出 JSON。更稳的过渡方案是：

- 支持模型直接输出 fenced JSON：````json render_blocks`。
- 支持 Gateway 从现有 `[pills]` / `[tasklist]` 标签转换。
- 支持当前 parser 作为最后兜底。

## Phase 0：现状盘点与风险冻结

目标：启动前先固定当前行为，避免边修边漂。

任务：

- 盘点现有渲染入口：
  - `src/utils/optionBoxParser.ts`
  - `src/ui/chat/MessageList.tsx`
  - `src/utils/markdownPreprocess.ts`
  - `oct-gateway/services/markdownNormalizer.js`
- 盘点现有协议文档：
  - `docs/03_specs/RENDER_PROTOCOL.md`
  - `docs/01_system_prompts/OCT_PROTOCOL.md`
  - `docs/01_system_prompts/CLARIFICATION_PROTOCOL.md`
- 固化当前四条稳定性测试口令为 `docs/test-results` 或自动化 fixture。
- 明确哪些行为属于 legacy fallback，哪些行为属于 v3 正式路径。

验收标准：

- 有一份当前渲染链路图。
- 有一份测试样例清单。
- 明确 v3 不会移除旧协议，只会新增标准结构层。

建议标签：

`render-v3-phase0-baseline`

## Phase 1：定义 Render Blocks Schema

目标：先定义协议，不碰 UI。

任务：

- 新增规格文档：`docs/03_specs/RENDER_BLOCKS_SCHEMA.md`。
- 定义 block 类型：
  - `markdown`
  - `code`
  - `table`
  - `tasklist`
  - `pills`
  - `checkbox`
  - `question`
  - `clarify_card`
  - `notice`
- 定义字段规则、最大长度、合法 item 数量、降级策略。
- 定义安全约束：
  - `value` 不允许携带隐藏命令。
  - `markdown` 不允许嵌入未闭合交互协议。
  - `tasklist` 勾选不发送消息。
  - `pills` 点击才发送消息。
- 在 `OCT_PROTOCOL.md` 中告诉模型优先输出结构化渲染意图。

验收标准：

- Schema 文档能覆盖当前 `[pills]`、`[tasklist]`、`[clarify_card]`。
- 每种 block 都有正确示例和错误示例。
- 不引入前端行为变化。

建议标签：

`render-v3-phase1-schema`

## Phase 2：Gateway Render Normalizer

目标：让 Gateway 成为协议裁判。

任务：

- 新增 `oct-gateway/services/renderBlocksNormalizer.js`。
- 能力一：解析模型直接输出的 `render_blocks` JSON。
- 能力二：从 legacy 文本提取 `[pills]`、`[tasklist]`、`[question]`、`[clarify_card]`。
- 能力三：将纯 Markdown 保留为 `markdown` block。
- 能力四：对非法 schema 做降级处理，而不是抛给前端。
- 增加单元测试：
  - 合法 blocks 通过。
  - 缺字段自动降级。
  - TaskList + pills 混排保序。
  - 代码块内标签不触发。
  - 表格内容不被误解析为选项。

验收标准：

- Gateway 能从同一段模型输出得到稳定 `render_blocks`。
- legacy 标签仍可被转换。
- 非法 JSON 不导致聊天失败。

建议标签：

`render-v3-phase2-gateway-normalizer`

## Phase 3：前端 Render Blocks 渲染层

目标：前端从“解析文本”转向“渲染结构”。

任务：

- 新增或抽象 `RenderBlocksRenderer`。
- 支持按 block 类型渲染：
  - `markdown` → Markdown renderer
  - `tasklist` → TaskList
  - `pills` → OptionBox with `forcePills`
  - `question` → QuestionCards
  - `clarify_card` → InlineInquiry
- `MessageList` 优先使用 `message.renderBlocks`。
- 若无 `renderBlocks`，沿用现有 `parseOptionBox()` legacy path。
- 确保流式阶段和最终阶段不会重复渲染交互组件。

验收标准：

- 同一消息中 `tasklist` 和 `pills` 同时出现时，两者都稳定显示。
- 点击 pills 只发送 pills value，不带标签。
- 勾选 TaskList 不发送消息。
- legacy 文本路径仍工作。

建议标签：

`render-v3-phase3-frontend-renderer`

## Phase 4：Provider Adapter 与提示词分层

目标：不同模型可以有不同输出策略，但最终协议一致。

任务：

- 在 provider 配置中声明输出能力：
  - `supportsStructuredOutput`
  - `supportsToolCalling`
  - `preferredRenderMode`
- 为 Google、DeepSeek、OpenAI/Claude 设计不同提示策略：
  - Google：优先工具或 fenced `render_blocks` JSON，减少自由 Markdown 猜测。
  - DeepSeek：强模板 + Gateway 校验。
  - GPT/Claude：可优先 schema，但仍必须校验。
- 系统提示词拆分：
  - 交互协议说明
  - 输出格式约束
  - provider-specific hints
- 保留统一 fallback。

验收标准：

- 同一测试 prompt 在不同 provider 下能收敛到相同 block 类型。
- provider 差异不泄露到前端组件。
- 提示词不再把所有稳定性压力压给模型自觉。

建议标签：

`render-v3-phase4-provider-adapters`

## Phase 5：Golden Tests 与稳定性压测

目标：建立可重复的“协议稳定测试台”。

任务：

- 将现有 4 条稳定性测试口令纳入 fixtures。
- 新增 golden 输出断言：
  - 结构化组件混合：`markdown + code + table + pills`
  - 符号防误触：不出现 pills
  - clarify_card：生成合法 inquiry spec
  - 任务清单 vs 胶囊：同时出现 `tasklist + pills`
- 建立测试报告格式：
  - 原始模型输出
  - Gateway normalized output
  - Render blocks
  - 前端解析结果
  - 判定结果
- 可选：加入手动截图回归记录。

验收标准：

- 一条命令可跑完整协议稳定性测试。
- 失败时能指出是模型输出、Gateway normalizer、还是前端渲染层的问题。
- 后续换模型不需要靠肉眼重新判断全部流程。

建议标签：

`render-v3-phase5-golden-tests`

## Phase 6：迁移与 Legacy 收敛

目标：稳定后逐步减少正则猜测的权重。

任务：

- 将自动检测策略标记为 legacy fallback。
- 降低裸符号、裸 checkbox 自动触发优先级。
- 对模型系统提示词减少 `[pills]` 文本标签依赖，改为结构化 blocks。
- 保留向后兼容，不一次性删除旧代码。

验收标准：

- 新路径稳定覆盖核心场景。
- 老聊天记录仍可显示。
- 没有大规模 UI 回归。

建议标签：

`render-v3-phase6-legacy-convergence`

## 推荐执行顺序

1. Phase 0：先冻结现状和样例。
2. Phase 1：定义 schema 和文档。
3. Phase 2：实现 Gateway normalizer，不动前端。
4. Phase 3：接入前端 `renderBlocks` 渲染。
5. Phase 5：尽早补 golden tests，最好和 Phase 2/3 穿插推进。
6. Phase 4：等基础结构稳定后做 provider adapter。
7. Phase 6：最后再收敛 legacy。

## 合并策略

- 使用独立分支：`codex/render-protocol-v3-structured-blocks`。
- 每个 Phase 单独提交。
- 不直接推送或合并 `main`。
- 每个 Phase 至少跑：
  - `npx vitest run`
  - `npx tsc --noEmit`
  - `npx tsc -p tsconfig.electron.json --noEmit`
- 涉及构建链路或前端渲染时额外跑：
  - `npm run build`

## 不做事项

本计划不建议一开始就做：

- 不立即删除 `[pills]` / `[tasklist]` / `[clarify_card]`。
- 不把所有 Markdown 都强制 JSON 化。
- 不让前端继续无限加正则补丁。
- 不依赖单一模型测试结论。
- 不把 provider-specific 提示词硬编码到前端。

## 启动口令

当要正式开始时，建议使用：

```text
开始 Render Protocol v3 Phase 0：冻结当前渲染链路和稳定性测试样例。只做盘点和文档，不改运行时代码。
```

如果要直接进入实现，可使用：

```text
开始 Render Protocol v3 Phase 1：定义 Render Blocks Schema 和系统提示词协议，不接入前端运行时。
```
