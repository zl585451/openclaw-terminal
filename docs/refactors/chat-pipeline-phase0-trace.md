# Chat Pipeline Phase 0 Trace Notes

> Date: 2026-06-18
> Branch: `codex/chat-pipeline-audit`
> Baseline tag: `chat-pipeline-audit-start-20260618`

## How This Trace Was Run

Command:

```bash
node scripts/chat-pipeline-trace-phase0.js
```

Scope:

- Deterministic runtime harness, no external LLM/API/network calls.
- Real modules exercised: `createChatRequestHandler`, `ChatEngine`, `StreamController`, `TurnSegmentTracker`, `ToolLoop`, and `agent_runner`.
- Mocked boundaries: LLM responses, tool results, and the Electron frontend runtime.
- Use this as Phase 1 evidence. Do not use it as sole deletion evidence for later A/D cleanup; live UI trace is still required before deleting production paths.

## Module Hit Table

| Module / branch | Pure chat | Main chat + search tool | Background Researcher Agent | Evidence |
|---|---:|---:|---:|---|
| `orchestrator.dispatch` | yes | yes | n/a in direct agent harness | handler trace event |
| `contextBuilder.build` | yes | yes | no | handler trace event; Agent path bypasses main context |
| `ChatEngine.execute` / `StreamController` | yes | yes | no | `chat.delta`, `chat.seg`, `stream done` |
| Gateway `delta` event | yes | yes | no | `chat.delta` count: pure 1, tool 2 |
| Gateway segment event | yes | yes | yes | `chat.seg` count: pure 4, tool 9, agent 9 |
| `ToolLoop.handleToolCalls` | no | yes | no | `tool_calls`, `tool_call`, `tool_result` |
| `onRoundReset` / `chat.reset` | no | yes | no | tool trace has one `chat.reset` after tool result |
| `agent_runner` tool loop | no | no | yes | Agent trace emitted `tool_call`, `tool_result`, final segment |
| Agent short-answer guard | no | no | yes | Agent fetch count 3; second response was short, third became final report |

## Runtime Findings

1. Main chat still emits both old `delta` and new `seg` events. Code evidence:
   - `oct-gateway/runtime/chatRequestHandler.js:207` sends `delta`.
   - `oct-gateway/runtime/chatRequestHandler.js:217` sends `seg`.
   - `oct-gateway/runtime/chatEngine.js:25` attaches `TurnSegmentTracker` beside the old stream.

2. Segment protocol is active enough to drive rendering, not just backend shadow. Code evidence:
   - `src/hooks/useMessages.ts:425` handles `onChatSeg`.
   - `src/hooks/useMessages.ts:447` sets `segProtocolActiveRef.current = true` on a text segment.
   - `src/hooks/useMessages.ts:522` skips old delta writes after segment protocol is active.

3. Main tool continuation still uses two anti-duplication mechanisms:
   - Segment boundaries (`text -> tool_use -> text/final`).
   - `onRoundReset` / `chat.reset`, emitted by `ToolLoop` continuation and handled by frontend reset logic.
   This confirms B2 should not be deleted blindly; it needs a later live UI check.

4. Main chat and background Agent have different final-answer safety behavior:
   - Main `ToolLoop` path completed after a tool round without an equivalent short-final guard.
   - `agent_runner` forced a third request after a short transition-like second response.
   This supports doing B1 before broader protocol deletion.

5. C1 is still open. The deterministic trace used a dated mock query/result, but it did not prove that the real `ContextBuilder` injects the authoritative current date into the live model context.

## Phase 0 Status

Phase 0 is sufficient to start Phase 1 (`B1`, `C1`) because the key live branches for those fixes are mapped. It is not sufficient to authorize A3/D deletions; those require the plan's full delete gate: grep no references, tests green, and live UI trace not hitting the path.
