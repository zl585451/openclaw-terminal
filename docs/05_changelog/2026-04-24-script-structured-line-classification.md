# Script Structured Line Classification

## Summary

- Extended current-chapter role detection so AI also classifies colon-style label lines as either dialogue-related or structured records.
- Added per-chapter `scriptChapterStructuredLines` storage to keep excluded structured lines out of role-colored rendering.
- Updated the role-detect result panel to show which lines were excluded as structured content.

## Behavior Change

- `识别当前章角色` no longer only attributes quote lines.
- The same action now also sends colon-label candidates such as `案号：...` and `日期：...` to AI for classification.
- Lines classified as structured records are rendered as normal text instead of speaker-colored dialogue lines in the script view.

## Files

- `src/workbench/types.ts`
- `src/workbench/DocumentStore.ts`
- `src/workbench/plugins/script/roleDetect.ts`
- `src/workbench/plugins/script/ScriptContent.tsx`
- `src/workbench/plugins/script/ScriptLineView.tsx`
- `src/workbench/plugins/script/ScriptRoleDetectPanel.tsx`
- `src/workbench/plugins/scriptPlugin.tsx`
- `oct-gateway/transport/httpRoutes.js`
