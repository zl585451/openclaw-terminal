# Render Protocol v2 执行计划

日期：2026-05-19

分支：`codex/render-protocol-v2`

## 背景

近期测试中出现 AI 回复把说明文字、编号步骤和 shell 命令混进多个代码框的问题。典型表现是：

- 普通说明被渲染成代码块。
- 一个命令说明被切成多个代码框。
- 流式输出过程中未闭合代码围栏导致前端显示跳动。
- 表格、列表、交互标签和 Markdown 自动检测互相干扰。

这类问题不能只依赖模型自觉修正。更稳妥的方案是建立三层约束：

1. 模型输出协议：让模型知道应该怎样写。
2. Gateway 清洗规范：在进入前端前修复常见坏格式。
3. 前端渲染容错：流式过程中稳定展示，结束后收敛到最终 Markdown。

## 可行性评估

结论：可行，建议分阶段做，先做协议和测试，再做实现。

有利条件：

- 项目已经使用 `react-markdown`、`remark-gfm`，具备 Markdown 表格和代码块基础能力。
- 已有 `docs/03_specs/RENDER_PROTOCOL.md` 和 `docs/01_system_prompts/OCT_PROTOCOL.md`，适合承载协议升级。
- 已有 `src/ui/chat/StreamingMarkdownContent.tsx`、`src/ui/chat/markdownComponents.tsx` 等聊天渲染分层，可在前端侧局部增强。
- 已有 `oct-gateway/services/postProcessor.js`，适合承载轻量文本规范化或接入新的 normalizer。

主要风险：

- 过度清洗可能误改真实代码块内容。
- 流式阶段与最终阶段渲染不一致，可能造成消息跳动。
- 交互标签 `[pills]`、`[question]`、`[tasklist]` 与 Markdown 自动检测的优先级必须保持稳定。
- 不同模型对 Markdown 围栏、表格空行和语言标记的遵循程度不一致。

控制策略：

- 第一阶段只改协议和测试样例，不动运行时代码。
- Gateway normalizer 只做保守修复：补齐围栏、补空行、规范语言标记，不重写大段内容。
- 前端只增强容错，不改变现有标签协议优先级。
- 每个阶段都跑 `npx tsc --noEmit`、`npx tsc -p tsconfig.electron.json --noEmit`、`npx vitest run`。

## 分支与合并策略

本任务使用独立分支：`codex/render-protocol-v2`。

分支来源：`origin/main`。

原因：

- 避免继承刚才清理分支的历史，降低合并噪音。
- 让本任务只包含渲染协议相关变更。
- 后续合并到 `main` 时更容易审查。

合并策略：

1. 所有改动先进入 `codex/render-protocol-v2`。
2. 不在本地直接 merge 到 `main`。
3. 不直接执行 `git push origin main`。
4. 验证通过后推送功能分支。
5. 通过 PR 或受控合并进入 `main`。

## Phase 1：协议文档与提示词约束

目标：先让模型输出更稳定。

改动范围：

- `docs/03_specs/RENDER_PROTOCOL.md`
- `docs/01_system_prompts/OCT_PROTOCOL.md`
- 如需要，同步模板：
  - `docs/01_system_prompts/templates/OCT_PROTOCOL.template.md`

新增规则：

- 普通说明禁止放入代码块。
- 命令代码块必须标记语言：Windows 默认 `powershell`，跨平台命令可用 `bash`。
- 一个代码块只放一种内容，不混入编号说明、标题或解释。
- 代码块前后必须空一行。
- 表格前后必须空一行。
- 表格列数建议不超过 5，行数建议不超过 12。
- 如果只给一条命令，优先用单独短代码块或行内代码，不输出长代码框。
- 交互组件优先使用成对标签，不依赖自动检测。

验收标准：

- 协议文档明确覆盖“说明误进代码块”的反例和正确示例。
- 提示词明确区分 Markdown 展示、命令块、交互标签。
- 不引入新的交互标签，避免扩大前端改动范围。

## Phase 2：Gateway Markdown Normalizer

目标：修复模型常见 Markdown 坏格式。

建议新增：

- `oct-gateway/services/markdownNormalizer.js`
- `oct-gateway/test/markdownNormalizer.test.js`

处理规则：

- 未闭合三反引号：在消息结束阶段补齐。
- 模糊语言标记：`code` / 空语言按内容推断为 `text`、`powershell`、`bash`、`json`。
- 表格粘连：在表格前后补空行。
- 代码块内混入编号说明：仅在明显形如 `1. **说明：**` 且后面跟命令时拆出正文。
- 保护原则：不解析、不修改代码块内部真实代码内容。

接入点：

- 优先接入 `oct-gateway/services/postProcessor.js` 的最终回复处理阶段。
- 流式中间态不强行重写，仅在最终消息收束时 normalize。

验收标准：

- 单元测试覆盖：
  - 未闭合代码围栏。
  - 说明文字误进代码块。
  - 表格和列表粘连。
  - 正常代码块不被改坏。
  - `[pills]` / `[question]` 标签不被破坏。

## Phase 3：前端流式渲染容错

目标：让流式输出过程中不再把内容切成碎代码框。

改动范围：

- `src/ui/chat/StreamingMarkdownContent.tsx`
- `src/ui/chat/markdownComponents.tsx`
- 相关测试文件

建议能力：

- 流式阶段检测未闭合 fence，临时按单个连续块展示。
- 表格未完整前按纯文本展示，完整后再渲染为表格。
- 消息完成后使用最终 normalized Markdown 重新渲染。
- 代码块 header 显示更清楚的语言名称，如 `PowerShell`、`Bash`、`JSON`、`Text`。

验收标准：

- 同一条消息中的代码块不会在流式阶段被拆成多段。
- 表格不会因为旁边有选项、编号或中文说明而消失。
- 交互标签仍按原优先级渲染。
- 代码块复制功能仍正常。

## Phase 4：端到端样例与回归集

目标：用真实坏样例防止回归。

新增测试样例：

- 中文编号 + PowerShell 命令。
- 表格 + 代码块 + `[pills]` 混排。
- 未闭合 fence 的流式片段。
- 模型输出 `code` 语言标记。
- 多段命令块中夹杂解释文本。

建议测试位置：

- Gateway normalizer 测试：`oct-gateway/test/markdownNormalizer.test.js`
- 前端渲染测试：沿用现有 `src/ui/chat` 或 `src/core` 测试布局。

## 推荐执行顺序

1. 先做 Phase 1：协议文档和提示词。（已完成：`dbc8949`）
2. 做 Phase 2：Gateway normalizer 和测试。（已完成：`a6acd42`）
3. 做 Phase 3：前端流式容错和测试。（已完成）
4. 最后做 Phase 4：真实样例回归集。（已完成）

每个阶段单独提交，提交粒度建议：

- `docs: define render protocol v2`
- `feat(gateway): normalize assistant markdown output`
- `fix(chat): stabilize streaming markdown rendering`
- `test: add render protocol regression cases`

## 合并前检查清单

- `git status` 确认工作区干净。
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
- `npm run build`
- 手动验证一条包含中文说明、表格、代码块和交互标签的 AI 回复。

## 不做事项

本轮不做：

- 不新增复杂富文本编辑器。
- 不替换 `react-markdown`。
- 不改变 `[pills]` / `[question]` / `[tasklist]` / `[clarify_card]` 现有协议语义。
- 不直接合并或推送 `main`。
- 不把所有模型输出强制转成 JSON。
