# Render Protocol v3 Phase 11.5: Raw Output Recapture Plan

日期：2026-05-19

分支：`codex/render-protocol-v3-structured-blocks`

## Why Phase 12 Cannot Execute Yet

Phase 12 (Raw Output Capture) requires at least one run to be marked `found` with a reliable source of exact raw model output text. Phase 11 discovery confirmed:

- All 8 runs in `docs/test-results/render-v3-real-model/corpus.json` are `not_found`.
- No local log file, session store, gateway trace, or Electron cache contains the raw API response body for any of the 8 runs.
- The original evidence was captured via **screenshot observation only** (`evidenceSource: "screenshot"`), meaning the raw output text was never programmatically or manually extracted and saved.

Therefore, Phase 12 is blocked until raw outputs are re-captured through an active recapture procedure.

## Recapture Procedure

This section defines how to re-run the 4 stability test prompts against both Gemini and DeepSeek providers, capturing exact raw model output into the corpus.

### Step 1: Prepare Environment

1. Ensure the OCT gateway is running (`node --watch index.js` from `oct-gateway/`).
2. Open the OCT desktop app or the Vite frontend (`npx vite`, port 5176) with Electron so that `ipcRenderer` can reach the gateway.
3. Verify the gateway is connected and responding.

### Step 2: Switch Provider to Google (Gemini)

1. Open OCT Settings → Connection.
2. Set **Provider** to `google` (Google Gemini / Vertex AI Express).
3. Set **Model** to `gemini-3.1-flash-lite-preview`.
4. Ensure the correct API key is configured (via Settings or `.env` `GOOGLE_AI_API_KEY`).
5. Save and confirm the provider is active (gateway log should show `"Active provider"` with `google`).

**Use the `google` provider for recapture** — the original corpus used Google and should be regenerated on the same provider family.

### Step 3: Switch Provider to DeepSeek

1. In Settings → Connection, change **Provider** to `deepseek` / `bailian` (as configured).
2. Set **Model** to `deepseek-v4-pro`.
3. Ensure the correct API key is configured (via `.env` `DEEPSEEK_API_KEY`).
4. Save and confirm.

### Step 4: Execute Each Case in Fresh Sessions

For each combination (Gemini × 4 cases, DeepSeek × 4 cases), create a **new chat session** and paste the exact prompt. Do NOT continue an existing conversation, as context from prior turns would contaminate the raw output.

The 4 prompts are in `docs/test-results/stability_test_prompts.md`:

| Case | Prompt Title | Expected Blocks |
|---|---|---|
| Case 1 | 结构化组件混合压测 | markdown, code, table, pills |
| Case 2 | 自动检测防御测试 | markdown only |
| Case 3 | InlineInquiry (clarify_card) 极端压测 | markdown, clarify_card |
| Case 4 | 任务清单 vs 复选框 边界测试 | markdown, tasklist, pills |

### Step 5: Capture Raw Output

After the model responds and streaming completes, capture the **exact raw model text** using one of these methods (in priority order):

#### Method A: Electron DevTools Console (Recommended)

1. Open Electron DevTools (Ctrl+Shift+I).
2. In the Network tab, find the WebSocket frame containing the final `ai_response` or `chunk` message for the current turn.
3. Copy the `content` or `text` field from the WebSocket payload — this is the **exact raw model output** before any frontend rendering.
4. Paste verbatim into the corresponding `raw/{run-id}.txt` file.

#### Method B: Gateway Log (If Console Logging Enabled)

1. If the gateway is started with `LOG_LEVEL=DEBUG` (see `oct-gateway/logger.js`), the full model response may appear in the terminal output.
2. Copy the raw response text from the gateway terminal.
3. Paste verbatim into the raw file.

#### Method C: WebSocket Trace Script

1. Use a Node.js script with the `ws` package connecting to `ws://127.0.0.1:18789`.
2. Send the test prompt as a standard chat message.
3. Collect all streamed chunks and concatenate them.
4. Save the concatenated text as the raw output.

This is the most reliable method for automated recapture. A trace script should be added under `docs/test-results/render-v3-real-model/scripts/` before execution.

### Step 6: Anti-Screenshot Rules

Follow these rules strictly to avoid repeating the Phase 11 failure:

- **DO NOT take screenshots as the primary evidence**. Screenshots already exist from Phase 7; this step is specifically about raw text.
- **DO NOT transcribe text from screenshots**. Transcription introduces errors (typos, missing whitespace, wrong formatting markers).
- **DO NOT paraphrase or summarize** the model output. Copy it character-for-character.
- **DO NOT use frontend-rendered HTML or DOM innerText** — that is already processed by the renderer, not the raw model output.

### Step 7: Privacy and Secret Check

Before committing any raw output into the corpus:

1. Search the raw text for patterns that look like:
   - API keys or tokens (`sk-`, `AIza`, `gpt-`, base64 strings, JWT-like tokens).
   - Internal URLs or IP addresses that were not part of the prompt.
   - System prompt leakage (look for `<system>`, `OCT_PROTOCOL`, or internal documentation text).
   - Personal data from the user's machine that should not be in test fixtures.
2. If any of these are found:
   - Document the finding in the changelog.
   - Redact the sensitive portion with `[REDACTED]` before committing the raw file.
   - Do not commit API keys or private data under any circumstances.

### Step 8: File Naming and Structure

Each captured raw output goes into the corresponding placeholder file:

| Run ID | File Path |
|---|---|
| gemini-case-1 | `docs/test-results/render-v3-real-model/raw/gemini-case-1.txt` |
| gemini-case-2 | `docs/test-results/render-v3-real-model/raw/gemini-case-2.txt` |
| gemini-case-3 | `docs/test-results/render-v3-real-model/raw/gemini-case-3.txt` |
| gemini-case-4 | `docs/test-results/render-v3-real-model/raw/gemini-case-4.txt` |
| deepseek-case-1 | `docs/test-results/render-v3-real-model/raw/deepseek-case-1.txt` |
| deepseek-case-2 | `docs/test-results/render-v3-real-model/raw/deepseek-case-2.txt` |
| deepseek-case-3 | `docs/test-results/render-v3-real-model/raw/deepseek-case-3.txt` |
| deepseek-case-4 | `docs/test-results/render-v3-real-model/raw/deepseek-case-4.txt` |

The raw file content should be structured as:

```text
--- METADATA ---
Provider: google
Model: gemini-3.1-flash-lite-preview
Case ID: case-1-mixed-components
Timestamp: 2026-05-19T...
Capture Method: WebSocket trace / DevTools Network / Gateway log

--- RAW MODEL OUTPUT ---
(Paste exact model response text here)
```

### Step 9: Update Corpus After Capture

After capturing and verifying each raw output:

1. Change the corresponding run's `rawOutputStatus` from `"missing"` to `"captured"`.
2. Verify the metadata in `rawOutputPath` points to the correct file.
3. Run `npx vitest run src/utils/renderProtocolV3Corpus.test.ts` to confirm tests pass.

### Phase 12 Prerequisites Checklist

Phase 12 can begin when:

- [ ] At least one run has `rawOutputStatus: "captured"` with exact raw text in its `.txt` file.
- [ ] Raw files pass privacy/secret checks.
- [ ] `npx vitest run src/utils/renderProtocolV3Corpus.test.ts` passes.
- [ ] `npx tsc --noEmit` passes.

## Stop Condition

If re-execution is not feasible (e.g., no valid API key, gateway not available), document the blocker and keep Phase 12 at `blocked`. Do not proceed with fabricated or inferred outputs.
