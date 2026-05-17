# 2026-05-18 Nocturne Final Removal

## Summary

This pass finishes the runtime-facing removal of Nocturne from OCT's default and active code paths.

## What changed

- Removed remaining `oct-gateway` runtime branches that conditionally switched between Nocturne and Memory v2.
- Replaced the old background `nocturne_task_queue` with `memory_task_queue`.
- Simplified `memory.js` into a Memory v2-only facade.
- Removed Nocturne-only maintenance scripts and repair helpers from `oct-gateway/`.
- Removed task migration and Nocturne status wording from slash commands.
- Updated active architecture/spec/prompt docs to describe Memory v2 as the only mainline backend.

## Result

- Gateway no longer depends on a Nocturne process, URL, config block, or packaging resource.
- Active product docs and prompts no longer describe Nocturne as a live part of the system.
- Remaining mentions are limited to historical archive notes under `docs/01_system_prompts/memory/`.

## Verification

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
