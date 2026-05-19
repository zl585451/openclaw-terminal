# Render Protocol v3 Phase 11：Raw Output Discovery

日期：2026-05-19

## 变更摘要

- 搜索本地项目目录、oct-gateway 数据文件、用户配置目录及 Electron 存储目录，判断 8 条真实模型 run 的原始输出是否已存在于任何日志文件中。
- 确认所有 8 条 run 的 `evidenceSource` 为 `screenshot`，意味着模型响应通过截图观察记录，未通过程序化管道持久化到磁盘文件。
- 新增 discovery 文档：`docs/04_dev_guides/2026-05-19-render-protocol-v3-phase11-raw-output-discovery.md`。
- all 8 runs marked as `not_found` — no raw model output exists in any accessible local file on this machine.

## 搜索覆盖范围

- 项目根目录 `/`、`/logs/`（不存在）、`/data/`、`/tmp/`（不存在）、`/core/`（不存在）
- `oct-gateway/data/tool_results.jsonl`（MCP tool results，非模型推理输出）
- `oct-gateway/logger.js` / `memory_raw_log.js`（console-level 日志，无文件持久化）
- `$USERPROFILE\.openclaw\workspace\memory\turns\{May 18-19}.jsonl`（conversation turns，无 render case 引用）
- `$APPDATA\openclaw-terminal\`（Electron 缓存 + LevelDB，非模型响应数据）
- VSCode globalStorage、Session Storage 等 Chromium 级别缓存
- `.openclaw\agents\main\sessions\`（March 2026 会话，早于五月测试）

## 结果汇总

| Status | Count | Runs |
|---|---|---|
| found | 0 | None |
| not_found | 8 | gemini-case-{1,2,3,4}, deepseek-case-{1,2,3,4} |
| ambiguous | 0 | None |

## 约束

- 未修改 `docs/test-results/render-v3-real-model/raw/*.txt` 文件。
- 未修改 `corpus.json` 的任何字段。
- 未调用 Gemini、DeepSeek 或任何外部 API。
- 未删除任何文件。
- 未复制任何 raw output 内容到本文档。

## 验证

- `git diff --check`
- `git status --short --branch`
