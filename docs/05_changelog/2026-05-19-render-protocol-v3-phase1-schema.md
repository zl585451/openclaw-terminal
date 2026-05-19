# 2026-05-19 Render Protocol v3 Phase 1 Schema

## Summary

Started Render Protocol v3 Phase 1 by defining the planned `render_blocks` schema and updating protocol docs to identify structured blocks as the future formal path.

## Added

- `docs/03_specs/RENDER_BLOCKS_SCHEMA.md`
  - Defines the `render_blocks` envelope.
  - Covers `markdown`, `code`, `table`, `tasklist`, `pills`, `checkbox`, `question`, `clarify_card`, and `notice`.
  - Documents shared field limits, item limits, degradation behavior, and safety constraints.

## Updated

- `docs/03_specs/RENDER_PROTOCOL.md`
  - References Render Blocks v3 as the formal structured path.
  - Keeps current tag protocol as legacy fallback.
- `docs/01_system_prompts/OCT_PROTOCOL.md`
  - Tells models to prefer `render_blocks` fenced JSON when explicitly requested by system prompt.
  - Clarifies that legacy tags remain compatible and should not be duplicated with equivalent blocks.
- `docs/01_system_prompts/templates/OCT_PROTOCOL.template.md`
  - Mirrors the v3 structured-output guidance in the template.
- `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md`
  - Marks Phase 1 as started.

## Notes

This phase does not change runtime code. Gateway schema validation, frontend render-block rendering, and provider adapters are deferred to later phases.
