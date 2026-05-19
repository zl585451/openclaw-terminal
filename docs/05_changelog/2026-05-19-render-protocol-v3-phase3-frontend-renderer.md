# 2026-05-19 Render Protocol v3 Phase 3 Frontend Renderer

## Summary

Phase 3 introduces the first frontend `renderBlocks` rendering entry point. `MessageList` now prefers structured `message.renderBlocks` when present and keeps the existing Markdown / legacy parser path unchanged when it is absent.

## Changes

- Added `src/ui/chat/renderBlocksAdapter.ts`.
  - Converts Render Blocks v3 objects into existing `RenderSegment` structures.
  - Maps `markdown`, `code`, `table`, and `notice` to Markdown text segments.
  - Maps `tasklist`, `pills`, `checkbox`, and `question` to existing interactive segment types.
  - Keeps `clarify_card` out of raw chat text until the InlineInquiry hook path is wired for structured blocks.
- Updated `src/ui/chat/chatTypes.ts`.
  - Added typed `RenderBlock` and `RenderBlockItem`.
  - Replaced the temporary `any[]` `renderBlocks` field.
- Updated `src/ui/chat/MessageList.tsx`.
  - Uses structured render blocks before `blockRouter` / `parseOptionBox`.
  - Keeps legacy parsing unchanged when `renderBlocks` is missing.
  - Includes render block content in the final parse cache key.
- Added `src/ui/chat/renderBlocksAdapter.test.ts`.
  - Covers ordered `markdown` + `tasklist` + `pills` conversion.
  - Covers cache separation when structured blocks change.

## Verification

- `npx vitest run src/ui/chat/renderBlocksAdapter.test.ts src/utils/optionBoxParser.test.ts src/utils/renderProtocolRegression.test.ts`
- `npx tsc --noEmit`

## Notes

- This phase does not connect Gateway delivery yet; it prepares the frontend deterministic render path once messages carry `renderBlocks`.
- Legacy fallback remains intact.
