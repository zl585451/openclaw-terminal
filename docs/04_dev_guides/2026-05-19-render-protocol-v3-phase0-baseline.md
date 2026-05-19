# Render Protocol v3 Phase 0 Baseline

Date: 2026-05-19

Branch marker: `codex/render-protocol-v3-structured-blocks`

## Goal

Phase 0 freezes the current rendering pipeline, stability prompts, and protocol boundary before any Render Protocol v3 runtime work begins.

This phase intentionally does not add schema, normalizer, parser, renderer, provider adapter, or runtime behavior.

## Current Rendering Pipeline

```text
Model output
  -> oct-gateway streamChat provider path
  -> ChatEngine finalization
  -> sanitizeAssistantReply()
  -> normalizeAssistantMarkdown()
  -> session.addMessage()
  -> WebSocket emitter.onDone({ reply })
  -> frontend ChatMessageList / MessageList
  -> assistant CoT stripping and leaked tool-call stripping
  -> blockRouter()
  -> blocksToSegments()
  -> parseOptionBox()
  -> Markdown / OptionBox / TaskList / QuestionCards / InlineInquiry rendering
```

Important current entry points:

| Layer | Current responsibility | Main file |
|---|---|---|
| Gateway finalization | Sanitizes and normalizes final assistant text before persistence and WS done event | `oct-gateway/runtime/chatEngine.js` |
| Markdown normalizer | Repairs common markdown/code-fence/table formatting issues | `oct-gateway/services/markdownNormalizer.js` |
| Frontend message render | Chooses streaming/final text, strips CoT, routes content to parser and render components | `src/ui/chat/MessageList.tsx` |
| Block bridge | Converts block-router output back into text segments for legacy parser compatibility | `src/core/blockIngest.ts`, `src/core/blockAdapter.ts` |
| Legacy interaction parser | Detects paired tags, checkbox/tasklist, symbol options, questions, and legacy option blocks | `src/utils/optionBoxParser.ts` |
| UI components | Render deterministic interaction widgets after parsing | `src/components/OptionBox.tsx`, `src/components/TaskList.tsx`, `src/components/QuestionCards.tsx`, `src/components/inlineInquiry/InlineInquiry.tsx` |

## Stability Prompt Fixtures

The source fixture for the current v3 stability baseline is now:

`docs/test-results/stability_test_prompts.md`

The fixture contains four high-value prompt scenarios:

| ID | Scenario | Expected stable behavior |
|---|---|---|
| 1 | Structured component mixed output | Markdown text, code, table, and final pills render without leaking tags or symbols into the wrong component |
| 2 | Symbol auto-detection defense | Explanatory uses of `■`, `●`, `◆`, and similar symbols remain plain text and do not create buttons |
| 3 | InlineInquiry / clarify_card stress | A valid inline inquiry opens, JSON remains valid, and labels are complete questions |
| 4 | TaskList vs pill boundary | User todo items render as `TaskList`; follow-up choices render as `PillOptionBox`; the two components do not suppress each other |

These prompts are reference fixtures for later golden tests. Phase 0 does not automate them yet.

## Legacy Fallback Boundary

The following behaviors are legacy fallback paths and must remain compatible during v3 migration:

- Paired tags: `[pills]`, `[checkbox]`, `[question]`, `[tasklist]`, `[text]`, `[cot]`
- Inline inquiry text fallback: `[clarify_card]...[/clarify_card]`
- Legacy option block: `[选项框开始]...[选项框结束]`
- Render hints: `[RENDER:pill]`, `[RENDER:checkbox]`, `[RENDER:question]`, `[RENDER:tasklist]`, `[RENDER:none]`
- Symbol auto-detection: `■`, `●`, `◆`, `○`, `◉`, `▪`, `▸`, `•`, `·`
- Markdown checkbox auto-detection: `- [ ]`, `[ ]`, `☐`, `□`, `☑`
- Natural task-list header fallback, such as “接下来你需要执行的任务清单”
- Gateway markdown normalization for code fences and table spacing

Legacy fallback is allowed to parse existing model output and old chat records. It should not become the primary v3 protocol.

## Render Protocol v3 Boundary

The intended v3 formal path is:

```text
Model or Gateway produces render_blocks
  -> Gateway validates and normalizes render_blocks
  -> WebSocket sends deterministic render data
  -> frontend renders blocks directly
  -> legacy parser is used only when render_blocks is absent
```

Phase 0 defines only this boundary. Later phases will decide exact schema, wire shape, validator behavior, and frontend renderer integration.

## Phase 0 Non-Goals

Phase 0 must not:

- Add `render_blocks` schema files.
- Add a Gateway render-block normalizer.
- Modify `optionBoxParser.ts`.
- Modify `MessageList.tsx`.
- Modify any render component.
- Change provider prompts or runtime provider behavior.
- Remove or weaken legacy fallback behavior.

## Baseline Risk Notes

- Current frontend interaction rendering still depends on text-shape inference.
- TaskList and pills can still conflict when a model omits explicit paired tags or emits uncommon formatting.
- Google, DeepSeek, GPT, and Claude may express the same interaction intent differently.
- Current tests cover parser regressions, but not full provider-to-frontend golden output.
- v3 should make interaction intent explicit before reducing legacy parser behavior.

## Phase 0 Verification

Required checks:

```powershell
npx vitest run src/utils/optionBoxParser.test.ts src/utils/renderProtocolRegression.test.ts
git diff --check
git status --short --branch
```

`npm run build` is not required for Phase 0 because this phase changes only documentation and fixture tracking.
