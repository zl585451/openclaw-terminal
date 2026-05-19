# Render Protocol v3 Phase 7 Real Model Evaluation

日期：2026-05-19

分支：`codex/render-protocol-v3-structured-blocks`

## Summary

Phase 7 的目标是把真实模型输出纳入 Render Protocol v3 的评估链路。Phase 0 到 Phase 6 已经完成 schema、Gateway normalizer、前端 `renderBlocks` 渲染层、provider capabilities、golden tests 和 legacy 自动检测收敛；但真实模型仍会出现自由文本漂移、交互组件缺失或误触发。

本阶段先记录 Gemini 与 DeepSeek 在 4 条稳定性口令上的人工审查结果，作为后续 real model golden corpus 的来源。此文档只做评估，不修改运行时代码。

## Evaluation Inputs

| Case | Prompt Intent | Expected Rendering |
|---|---|---|
| Case 1 | 渲染协议优化方案分析 | Markdown + TypeScript code block + Markdown table + final `pills` |
| Case 2 | 符号检测模式解释 | Plain Markdown only; symbols inside explanation must not become real buttons |
| Case 3 | `[clarify_card]` 周报自动化信息收集 | Inline inquiry with all requested dimensions |
| Case 4 | Bug 修复流程和任务清单 | `TaskList` plus separate `PillOptionBox`; they must not steal each other |

## Review Rubric

| Dimension | What Good Looks Like |
|---|---|
| Markdown stability | Headings, paragraphs, inline code and emphasis render as readable Markdown without corrupting layout. |
| Code/table stability | Code fences and tables remain display-only content and do not trigger interaction parsing. |
| Interaction precision | Required interactive blocks render exactly once and in the expected component type. |
| False-positive defense | Explanation-only symbols, checkboxes or bracketed examples do not become clickable UI. |
| Completeness | The answer covers all requested fields, not just the first visible component. |

## Gemini Review

| Case | Verdict | Evidence | Failure Layer |
|---|---|---|---|
| Case 1 | Partial | Markdown, TypeScript code block and comparison table rendered acceptably. The final pill choices were not reliably visible as a stable `PillOptionBox`. | Model output / Gateway repair |
| Case 2 | Fail | The prompt explicitly asked not to trigger real interaction buttons, but the response still produced final CTA-style pills such as implementation/test/no-need choices. | Model output |
| Case 3 | Partial | Inline inquiry appeared, which proves the path can trigger `InlineInquiry`. The visible progress showed `1/3`, while the prompt asked for 4 dimensions, so completeness is suspicious. | Model output / inquiry generation |
| Case 4 | Partial | Task list rendered as a `TaskList`, but the separate pill choices under it did not render as a stable `PillOptionBox`. | Model output / legacy conversion |

Gemini is useful for structured inquiry triggering, but currently has two reliability risks:

- It may ignore negative interaction constraints and add helpful-looking CTA buttons.
- It often describes or partially emits interaction intent instead of producing a complete component set.

## DeepSeek Review

| Case | Verdict | Evidence | Failure Layer |
|---|---|---|---|
| Case 1 | Pass | Markdown, code block, table and final choices rendered cleanly. This was the strongest mixed-format sample among the screenshots. | None observed |
| Case 2 | Pass | Symbol examples stayed explanatory and did not become accidental buttons. The answer also explained `[text]`-style protection clearly. | None observed |
| Case 3 | Partial | Inline inquiry appeared for the platform question. The visible progress showed `1/3`; the original prompt asked for 4 dimensions, so full-card completeness still needs raw-output verification. | Model output / inquiry generation |
| Case 4 | Partial | The output was visually polished and readable, but it leaned on Markdown tables and bracketed choices instead of clearly producing `TaskList + PillOptionBox` as separate deterministic components. | Model output |

DeepSeek appears more stable than Gemini for long Markdown, tables, code fences and false-positive defense. Its main gap is that it may choose a good-looking document shape instead of the exact requested protocol component shape.

## Comparative Result

| Capability | Gemini | DeepSeek | Current Winner |
|---|---|---|---|
| Mixed Markdown/code/table rendering | Good enough | Strong | DeepSeek |
| Final pill generation | Unstable | Better, but not universal | DeepSeek |
| False-positive symbol defense | Weak in Case 2 | Strong in Case 2 | DeepSeek |
| Inline inquiry triggering | Works, but possibly incomplete | Works, but possibly incomplete | Tie |
| Protocol obedience | Inconsistent | Better, still not deterministic | DeepSeek |

Overall conclusion: DeepSeek is currently the better visual and protocol-behavior baseline, but neither model should be trusted as the protocol source of truth. The v3 architecture remains necessary: model output should be normalized into `render_blocks`, and the frontend should render only validated structure.

## Risk Findings

| Severity | Finding | Impact |
|---|---|---|
| High | Models still confuse "helpful answer" with "protocol-compliant answer". | A model may create or omit interactive UI even when the user prompt is explicit. |
| High | `[clarify_card]` completeness cannot be trusted from first visible page alone. | A card can look successful while missing required dimensions. |
| Medium | Legacy auto-detection can only reduce false positives; it cannot create missing intent reliably. | Missing pills/tasklists must be fixed before or inside Gateway normalization. |
| Medium | Screenshots are not enough as regression artifacts. | Future changes cannot be automatically compared unless raw outputs are captured. |

## Recommended Next Step

Create a Phase 7 real model golden corpus:

1. Save raw Gemini and DeepSeek outputs for the 4 test cases as fixtures.
2. Add expected-component assertions per sample:
   - Case 1: `markdown + code + table + pills`.
   - Case 2: no interactive components.
   - Case 3: valid inquiry with all requested dimensions.
   - Case 4: `tasklist + pills`.
3. Classify each failure into:
   - model output failure,
   - Gateway normalizer or repair failure,
   - frontend parser or renderer failure.
4. Only after corpus capture, decide whether to adjust:
   - provider prompt profiles,
   - Gateway `render_blocks` repair,
   - legacy parser thresholds,
   - or frontend rendering.

## Non-Goals

- Do not add new schema fields in this phase.
- Do not change `optionBoxParser`.
- Do not change Gateway normalizer behavior.
- Do not change frontend components.
- Do not treat one model's successful screenshot as protocol proof.

## Acceptance Criteria

- The real-model review is written down in a stable project document.
- The document clearly separates visual quality from protocol compliance.
- The document recommends corpus capture before further code changes.
- Runtime code remains untouched in this phase.
