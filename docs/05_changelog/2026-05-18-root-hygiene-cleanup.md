# 2026-05-18 Root Hygiene Cleanup

## Summary

- Removed stale root-level cleanup artifacts that were no longer trustworthy:
  - `DEAD_CODE_REPORT.md`
  - `get_duplicate_code.sh`
  - `get_duplicated_types.sh`
  - `get_large_files.sh`
- Added `scripts/repo-hygiene-report.js` as the new cross-platform maintenance entrypoint.
- Added `npm run repo:hygiene` and `npm run repo:hygiene:json` to standardize repository health checks.

## Why

- The old report was generated on 2026-03-25 and referenced files that no longer exist in the repository.
- The old shell scripts were ad-hoc Unix snippets and were not reliable in the current Windows/Node development workflow.
- Root-level one-off maintenance files created noise and encouraged stale cleanup decisions.

## Validation

- `node scripts/repo-hygiene-report.js`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
