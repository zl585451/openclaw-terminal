# Script Role Detect Flow

## Entry

- User clicks `识别当前章角色` inside the script panel toolbar.

## Flow

1. Frontend extracts the currently active chapter only.
2. Frontend collects quote-containing candidate lines from that chapter.
3. Frontend also collects colon-style dialogue-label lines as structured-record candidates.
4. Frontend normalizes parser-derived role candidates so prose speaker cues such as `周佳宁应了一声：` do not pollute the role list.
5. Frontend sends the chapter text, cleaned existing role library, quote candidates, and structured-record candidates to `POST /api/script-role-detect`.
6. `oct-gateway` runs a one-shot completion with the dedicated role-detect prompt.
7. Frontend normalizes returned role names again before merging them into the current document's `scriptCharacterLibrary`.
8. Frontend stores returned attributions, structured-line markers, and voice-fragment markers under the current chapter key.
9. Script view renders lines marked as structured records as normal text instead of role-colored dialogue.
10. Script view renders voice-fragment quotes with lightweight speaker-colored emphasis without treating them as confirmed top-bar roles.
11. Frontend opens the role-detect result panel to show recognized roles, attributed dialogue, excluded structured lines, voice fragments, and unresolved candidate lines.

## Scope

- This flow is intentionally limited to current-panel, current-chapter recognition.
- It does not rewrite source text and does not assume any downstream audiobook/TTS pipeline.
