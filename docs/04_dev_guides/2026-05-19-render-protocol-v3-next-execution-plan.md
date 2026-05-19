# Render Protocol v3 Next Execution Plan

日期：2026-05-19

分支：`codex/render-protocol-v3-structured-blocks`

## Purpose

This document defines the concrete execution plan after Phase 10. It exists to prevent drift: every next step should have a clear input, action, acceptance criteria, verification command, and stop condition.

## Current Baseline

Completed phases:

| Phase | State | Evidence |
|---|---|---|
| Phase 0-8 | Completed | `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md` |
| Phase 9 | Completed | `src/utils/renderProtocolV3Corpus.test.ts` |
| Phase 10 | Completed | `docs/test-results/render-v3-real-model/raw/*.txt` and `rawOutputPath` entries in `corpus.json` |

Current test state:

| Command | Expected Result |
|---|---|
| `npx vitest run src/utils/renderProtocolV3Corpus.test.ts` | 18 passed, 8 skipped |
| `npx tsc --noEmit` | Pass |
| `git diff --check` | Pass, CRLF warnings are acceptable |

Current corpus state:

- 8 real-model runs are recorded in `docs/test-results/render-v3-real-model/corpus.json`.
- All 8 runs have `rawOutputPath`.
- All 8 raw files are placeholders.
- All 8 runs still have `rawOutputStatus: "missing"`.

## Execution Rules

- Do not call Gemini, DeepSeek, or any external model API unless a phase explicitly says so.
- Do not infer raw outputs from screenshots.
- Do not modify `verdict`, `observedBlocks`, `missingBlocks`, `unexpectedBlocks`, `failureLayer`, or `notes` unless the phase explicitly asks for a re-review.
- Do not modify Gateway normalizer, frontend renderer, or `optionBoxParser` in corpus-capture phases.
- Do not push, merge, reset, or delete files without explicit approval.
- Each phase must end with status, verification output summary, and a clean or clearly explained working tree.

## Phase 11: Raw Output Discovery

Goal: find whether the real raw outputs already exist in local logs.

Inputs:

- `docs/test-results/render-v3-real-model/corpus.json`
- `docs/test-results/render-v3-real-model/raw/*.txt`
- OCT raw logs, Gateway logs, or exported chat logs

Allowed actions:

- Search local project logs and known OCT log folders.
- Read candidate log files.
- Document which run IDs can or cannot be matched.

Forbidden actions:

- Do not edit raw placeholder files.
- Do not change `rawOutputStatus`.
- Do not call model APIs.
- Do not delete or rotate logs.

Deliverables:

- New document: `docs/04_dev_guides/2026-05-19-render-protocol-v3-phase11-raw-output-discovery.md`
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase11-raw-output-discovery.md`
- Update `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md` with Phase 11 status.

Acceptance criteria:

- A table lists all 8 run IDs.
- Each run is marked as one of:
  - `found`
  - `not_found`
  - `ambiguous`
- Every `found` or `ambiguous` entry includes the source path and matching reason.
- No corpus raw placeholder content is changed in this phase.

Verification:

- `git diff --check`
- `git status --short --branch`

Stop condition:

- If candidate logs contain secrets, API keys, or unrelated private content, stop and document only the path and risk without copying content.

## Phase 12: Raw Output Capture

Goal: copy exact raw model outputs into the matching raw files.

Prerequisite:

- Phase 11 completed.
- At least one run is marked `found` with a reliable source.

Allowed actions:

- Copy exact model output into the matching `raw/*.txt` file.
- Preserve the metadata header already in the placeholder file.
- Add a delimiter before exact raw output:

```text
--- RAW MODEL OUTPUT ---
```

- Update that run's `rawOutputStatus` from `missing` to `captured`.

Forbidden actions:

- Do not paraphrase raw outputs.
- Do not normalize Markdown.
- Do not fix model mistakes in the raw output.
- Do not change verdict or block audit fields yet.

Deliverables:

- Updated raw files for captured runs.
- Updated `corpus.json` statuses.
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase12-raw-output-capture.md`

Acceptance criteria:

- Each captured run has exact raw text.
- Each captured run has `rawOutputStatus: "captured"`.
- Uncaptured runs remain `missing`.
- Raw files do not contain API keys, local credentials, or unrelated private data.

Verification:

- `npx vitest run src/utils/renderProtocolV3Corpus.test.ts`
- `npx tsc --noEmit`
- `git diff --check`
- `git status --short --branch`

Stop condition:

- If the only available source is a screenshot, do not capture it as raw output. Keep the run `missing`.

## Phase 13: Captured Output Assertions

Goal: make captured raw outputs useful as regression tests.

Prerequisite:

- Phase 12 captured at least one raw output.

Allowed actions:

- Extend `src/utils/renderProtocolV3Corpus.test.ts`.
- For `captured` runs, assert:
  - raw file exists,
  - raw file contains `--- RAW MODEL OUTPUT ---`,
  - raw text after delimiter is non-empty,
  - placeholder TODO is not the only content.

Forbidden actions:

- Do not call Gateway normalizer yet.
- Do not change runtime parser behavior.

Deliverables:

- Updated `src/utils/renderProtocolV3Corpus.test.ts`.
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase13-captured-output-assertions.md`

Acceptance criteria:

- Missing runs continue to skip content checks.
- Captured runs fail if raw text is absent or still placeholder-only.

Verification:

- `npx vitest run src/utils/renderProtocolV3Corpus.test.ts`
- `npx tsc --noEmit`
- `git diff --check`

## Phase 14: Normalizer Replay Harness

Goal: replay captured raw outputs through Gateway normalization without calling external APIs.

Prerequisite:

- Phase 13 completed.
- At least one captured raw output exists.

Allowed actions:

- Import or require the existing Gateway render normalizer in a test.
- Feed captured raw output into the normalizer.
- Assert basic normalized block shape.

Forbidden actions:

- Do not modify normalizer behavior in this phase.
- Do not add provider prompt changes.
- Do not call model APIs.

Deliverables:

- New or updated test file for corpus replay.
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase14-normalizer-replay.md`

Acceptance criteria:

- Captured raw outputs can be replayed locally.
- Failures are reported as corpus replay failures, not hidden behind screenshots.
- No runtime code changes.

Verification:

- `npx vitest run src/utils/renderProtocolV3Corpus.test.ts`
- `npx vitest run <new replay test>`
- `npx tsc --noEmit`
- `git diff --check`

## Phase 15: Failure Classification Update

Goal: update corpus observations based on replay evidence.

Prerequisite:

- Phase 14 completed.
- Replay results exist.

Allowed actions:

- Update `failureLayer` only when replay evidence proves the current classification is wrong or incomplete.
- Add a `replayNotes` field if useful.

Forbidden actions:

- Do not change raw output text.
- Do not change model verdicts based only on preference.

Deliverables:

- Updated `corpus.json`.
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase15-failure-classification.md`

Acceptance criteria:

- Each updated classification cites replay evidence.
- No screenshot-only reclassification.

Verification:

- `npx vitest run src/utils/renderProtocolV3Corpus.test.ts`
- Relevant replay tests
- `git diff --check`

## Phase 16: Fix Planning Gate

Goal: decide whether fixes belong in provider prompts, Gateway repair, or frontend fallback.

Prerequisite:

- Phase 15 completed.

Allowed actions:

- Write a fix plan document.
- Prioritize failures by severity and blast radius.

Forbidden actions:

- Do not implement fixes in this phase.

Deliverables:

- New document: `docs/04_dev_guides/2026-05-19-render-protocol-v3-fix-plan.md`
- New changelog: `docs/05_changelog/2026-05-19-render-protocol-v3-phase16-fix-planning-gate.md`

Acceptance criteria:

- Each proposed fix names:
  - failure ID,
  - owner layer,
  - expected behavior,
  - tests to update,
  - rollback risk.

Verification:

- `git diff --check`

## Suggested Next Task Prompt

Use this for the next worker task:

```text
请执行 Render Protocol v3 Phase 11：Raw Output Discovery。只做日志发现和文档记录，不修改 raw 占位文件、不修改 corpus 状态、不调用任何模型 API、不提交、不推送、不合并。

阅读：
- docs/04_dev_guides/2026-05-19-render-protocol-v3-next-execution-plan.md
- docs/test-results/render-v3-real-model/corpus.json

目标：
1. 搜索本地项目日志、Gateway raw logs、OCT raw logs，找是否存在 8 个 run 对应的真实模型原始输出。
2. 新增 docs/04_dev_guides/2026-05-19-render-protocol-v3-phase11-raw-output-discovery.md。
3. 文档中列出 8 个 run id，并标记 found / not_found / ambiguous。
4. 对 found 或 ambiguous 项写明来源路径和匹配理由。
5. 新增 docs/05_changelog/2026-05-19-render-protocol-v3-phase11-raw-output-discovery.md。
6. 更新 docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md，记录 Phase 11 已启动或已完成。

限制：
- 不要复制 raw output 内容。
- 不要修改 docs/test-results/render-v3-real-model/raw/*.txt。
- 不要修改 corpus.json 的 rawOutputStatus。
- 如果日志里疑似包含密钥或私人内容，只记录路径和风险，不复制内容。

验证：
- git diff --check
- git status --short --branch

完成后汇报：
- 搜索了哪些位置
- 8 个 run 的 found/not_found/ambiguous 结果
- 是否有任何 raw 文件或 corpus 状态被修改
```
