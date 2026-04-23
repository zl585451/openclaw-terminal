# Script Voice Fragment Classification

## Summary

- Extended current-chapter role detection so AI can mark quote lines as `voiceFragments` when they behave more like OS / echo / fragmented role voice than standard dialogue.
- Stored per-chapter voice-fragment markers separately from explicit dialogue attribution and structured-line exclusion.
- Script view now highlights quote text for voice fragments without promoting those names into the top explicit-role strip.

## Behavior Change

- `识别当前章角色` now classifies quote candidates into three buckets:
  - normal attributed dialogue
  - structured records to exclude
  - voice fragments / OS-style lines
- Voice fragments can carry an optional `speaker` or `mentionedNames`, but they are not treated as confirmed top-bar roles by default.

## Files

- `src/workbench/types.ts`
- `src/workbench/DocumentStore.ts`
- `src/workbench/plugins/script/roleDetect.ts`
- `src/workbench/plugins/script/ScriptRoleDetectPanel.tsx`
- `src/workbench/plugins/script/ScriptLineView.tsx`
- `src/workbench/plugins/script/ScriptContent.tsx`
- `src/workbench/plugins/scriptPlugin.tsx`
- `oct-gateway/transport/httpRoutes.js`
