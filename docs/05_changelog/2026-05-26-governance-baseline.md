# 2026-05-26 OCT 代码治理 Phase 0 基线

## Scope

本基线只做事实核对，不修改运行时代码。当前工作分支为 `codex/oct-governance-phase0`，创建自 `main` 的 `382ae6b`。

## Git / workspace

- 当前 `main` 已包含 `chore/dependency-dedupe`：`git log main..chore/dependency-dedupe` 无输出。
- 当前 `main` 未包含 `codex/dependency-refactor-2026-05-26`：该分支相对 `main` 仍有 6 个提交，包含 `docs/03_specs/dependency-boundaries.md`、`docs/03_specs/dependency-major-version-boundaries.md`、`oct-gateway/optional-tools/package.json` 和依赖脚本相关改动。
- 当前未跟踪文件：`project_structure.txt`。本阶段未读取或修改该文件。

## File size baseline

排除 `node_modules`、`dist`、`dist-electron`、`release`、`.git`、`.kilo` 后，当前最大代码文件如下：

| Lines | Path |
| ---: | --- |
| 4740 | `electron/main.ts` |
| 2479 | `docs/_archive/legacy_model_context/08_for_claude/ChatTab.tsx` |
| 1634 | `oct-gateway/ai.js` |
| 1429 | `src/ui/settings/tabs/ConnectionTabView.tsx` |
| 1327 | `oct-gateway/config.js` |
| 1137 | `oct-gateway/gateway/slash.js` |
| 1130 | `src/ui/chat/MessageList.tsx` |
| 1058 | `src/workbench/plugins/script/ScriptViewer.tsx` |
| 1025 | `src/utils/optionBoxParser.ts` |
| 940 | `src/hooks/useMessages.ts` |

指定入口文件当前行数：

| Lines | Path | Current role |
| ---: | --- | --- |
| 230 | `src/App.tsx` | 应用壳、tab/view 状态、首次启动设置、聊天历史加载与保存、懒加载主视图 |
| 604 | `src/ui/chat/ChatTab.v2.tsx` | 聊天输入与发送、网关连接桥接、节点检查、头部 portal、聊天主界面组合 |
| 498 | `src/ui/settings/SettingsPanel.tsx` | 设置面板容器、tab 切换、配置读取/保存编排、MCP 状态刷新、TTS 试听 |
| 319 | `oct-gateway/index.js` | Gateway 组合根：配置/服务实例化、懒加载边界、HTTP/WS transport 接线、启动任务 |

## Test baseline

- 测试文件总数：79。
- 分布：`electron` 4、`oct-gateway` 48、`src/root` 27。
- `npm test` 结果：通过。Vitest 输出 `46 passed | 1 skipped (47)`，用例 `378 passed | 9 skipped (387)`。

## Dependency baseline

当前可见 package 边界：

| Path | dependencies | devDependencies | scripts |
| --- | ---: | ---: | --- |
| `package.json` | 27 | 23 | `check:node`, `init`, `postinstall`, `dev`, `rebuild:gateway:native`, `build:electron`, `build`, `start`, `start:fast`, `electron:*`, `test`, `test:watch` |
| `oct-gateway/package.json` | 13 | 0 | `check:node`, `ensure:native`, `start`, `dev` |
| `oct-gateway/mcp-servers/oct-file-ops/package.json` | 1 | 0 | `start`, `dev` |

当前 `main` 中不存在 `oct-gateway/optional-tools/package.json`，也不存在 `npm run deps:check`、`npm run deps:gateway`、`npm run deps:optional-tools` 三个脚本。它们存在于未合入的 `codex/dependency-refactor-2026-05-26` 分支。

## Verified issues

- 依赖治理主分支状态需区分两条线：`chore/dependency-dedupe` 已被 `main` 包含；`codex/dependency-refactor-2026-05-26` 尚未合入 `main`。
- `project_structure.txt` 确认为当前唯一未跟踪文件。
- Phase 0 计划里的依赖验证命令在当前 `main` 基线上不可运行，因为脚本不存在。
- `src/core/types.ts` 不是“完全未使用”：`src/core/blockRouter.ts` 和 `src/core/blockAdapter.ts` 通过 `./types` 引用 `ContentBlock`。
- `src/workbench/types.ts` 有多处活跃引用；`src/ui/settings/types.ts` 被 `SettingsPanel.tsx` 引用。
- `src/gateway/search.ts:45` 当前不是 `any`，该行为空行；文件内未检出 `any` 文本。该文件仍有 `response.json()` 后的隐式 `unknown` 结构假设，但不是报告里描述的 `search.ts:45 any`。
- 当前大文件问题的首要目标不完全等同于计划里的四个入口：`electron/main.ts`、`oct-gateway/ai.js`、`ConnectionTabView.tsx`、`oct-gateway/config.js` 当前比 `src/App.tsx`、`ChatTab.v2.tsx`、`SettingsPanel.tsx`、`oct-gateway/index.js` 更大。

## Unconfirmed or stale issues

- “未引用 CSS”不能按旧报告直接采信。历史记录显示近期已有 `dialog.css` 删除、`ResponseTray.css` 孤儿引用移除、Workbench/Canvas CSS 恢复等清理；需要用当前 CSS import/reference 专项脚本重新确认。
- `dependency-boundaries.md` 与 `dependency-major-version-boundaries.md` 当前不在 `main`，所以 Phase 1 若以它们为准，应先决定是合入/摘取 `codex/dependency-refactor-2026-05-26`，还是在新 Phase 1 分支重新生成边界文档。
- `oct-gateway/optional-tools` 当前不在 `main`，所以 optional tools 依赖边界在本基线上尚不能按三层 package 结构验收。

## Validation

- `git status --short`: `?? project_structure.txt`
- `npm run deps:check`: failed, missing script.
- `npm run deps:gateway`: failed, missing script.
- `npm run deps:optional-tools`: failed, missing script.
- `npm test`: passed.
