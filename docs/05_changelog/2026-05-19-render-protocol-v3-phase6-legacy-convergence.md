# Render Protocol v3 Phase 6 Legacy Convergence

Date: 2026-05-19

## Summary

Phase 6 reduces reliance on legacy automatic detection without removing backward compatibility. New model output should prefer `render_blocks`, then paired legacy tags. Bare symbols and bare Markdown checkbox lines remain supported only as a conservative fallback.

## Changes

- Updated `src/utils/optionBoxParser.ts` so automatic symbol and checkbox detection requires at least two parsed items plus one of:
  - an explicit choice cue,
  - a task-list header for checkbox task lists,
  - a block that is almost entirely option lines.
- Added regression tests for explanatory symbol and checkbox examples that must remain plain Markdown.
- Updated `docs/01_system_prompts/OCT_PROTOCOL.md` and `docs/01_system_prompts/templates/OCT_PROTOCOL.template.md` to prefer `render_blocks` over legacy labels for new output.
- Updated `docs/03_specs/RENDER_PROTOCOL.md` to mark automatic detection as legacy fallback.
- Updated the v3 execution plan and changelog index.

## Compatibility

- Paired tags such as `[pills]`, `[checkbox]`, `[question]`, `[tasklist]`, and `[clarify_card]` remain supported.
- Explicit `[RENDER:xxx]` hints still bypass the stricter automatic-detection rules.
- Old pure option lists such as a message containing only `■ A / ■ B` still render as options.

## Verification

- `npx vitest run src/utils/optionBoxParser.test.ts src/ui/chat/renderProtocolV3Golden.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`
