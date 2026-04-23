# 2026-04-24 Script Role Detect Result Panel

## Summary

- Upgraded `识别当前章角色` from a silent action into a `1 main button + 1 result panel` workflow.

## What Changed

- Added a dedicated `ScriptRoleDetectPanel` to present role-detection results.
- Added a standalone `roleDetect.ts` module for role-detection result shaping, separate from the main script view logic.
- Clicking `识别当前章角色` now:
  - runs chapter-local detection
  - updates role colors / attributions
  - opens a result panel showing:
    - recognized roles
    - attributed dialogue lines
    - unresolved candidate dialogue lines

## User Impact

- Users can inspect how the AI judged the current chapter instead of only seeing colorized output.
- The feature remains modular and easier to debug because detection result shaping and result presentation are separated.
