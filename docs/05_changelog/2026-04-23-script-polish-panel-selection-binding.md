# 2026-04-23 Script Polish Panel Selection Binding

## Summary

- Changed script Canvas selection editing from immediate AI polish to an explicit edit panel flow.
- Added persistent bound-selection highlighting so the chosen script lines stay visibly targeted after the panel takes focus.

## What Changed

- Toolbar and floating selection actions now open a selection edit panel instead of immediately sending an AI polish request.
- The panel now includes:
  - a read-only view of the bound source text
  - an editable draft area
  - an `AI 润色` action inside the panel
  - a `去聊天讨论` action that sends the selected passage into chat for discussion
- Bound script selections now render with a custom highlight independent of the browser's native text selection state.
- Applying changes back to the source now uses the bound selection snapshot rather than relying on the live browser selection.

## User Impact

- Users can keep the panel open, discuss revisions in chat, manually edit the draft, and then apply the result back to the selected script passage.
- The selected script region remains visible while interacting with the panel, reducing accidental edits and selection confusion.
