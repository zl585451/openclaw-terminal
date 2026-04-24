# 2026-04-24 - Script Adapter Skeleton Task 4

## Summary

- Added `ScriptAdapterLayout` with 3 view tabs:
  - Workbench
  - Pipeline
  - Agents
- Added workbench components:
  - `WorkbenchView`
  - `StageSidebar`
  - `StageDetail`
- Added pipeline components:
  - `PipelineView`
  - `StageNode`
- Added `AgentListView`
- Expanded `scriptAdapterActions` with UI-triggered placeholder actions:
  - `openStageInWorkbench`
  - `openArtifact`
  - `viewArtifactHistory`

## Notes

- All interactions route through `scriptAdapterActions`.
- No inline styles were introduced.
- No protected files were modified.
- Pipeline currently renders all 8 mock stages (`idx 0..7`) to stay aligned with the provided mock data.
