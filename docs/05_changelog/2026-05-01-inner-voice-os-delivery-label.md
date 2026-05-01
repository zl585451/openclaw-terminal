# 2026-05-01 Inner voice OS delivery label

## Changed

- Updated Script Adapter export rendering so `inner_monologue` segments display as `[角色][OS]` in Markdown/DOCX delivery payloads.
- Updated workbench artifact preview to show inner monologue speakers as `角色 · OS`.
- Added a unit test for the export speaker label formatter.

## Notes

- This is a presentation-layer change only. The internal payload remains `type = inner_monologue` with a normal `speaker` value.
