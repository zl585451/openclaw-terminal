# 2026-04-26 Script Adapter Hide User-Facing Tech Fields

## Summary

- Removed Agent ID, Run ID, input artifact type, and output artifact type fields from the user-facing execution card detail.
- Removed the open-work-order technical details block from the default workbench flow.
- Reworded the older stage detail panel to hide token/runtime metrics, rule paths, and input artifact lists from the user-facing surface.
- Updated the execution view copy to focus on production roles and key deliverables.
- Updated content workbench docs to clarify that technical identifiers stay in logs, protocol docs, debug tools, or internal operations views instead of the default user flow.

## Why

These identifiers are useful for development and traceability, but they are not meaningful to content creators during production review. The execution view should keep attention on what was produced and which role is responsible.
