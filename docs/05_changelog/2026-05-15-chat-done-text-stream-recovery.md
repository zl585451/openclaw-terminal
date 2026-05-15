# Chat Done Text Stream Recovery

Date: 2026-05-15

## Summary

- Fixed a chat rendering race where the frontend could finish an assistant message from partial streamed deltas while ignoring the gateway's final `done` payload.
- The final `done.text` is now used as a recovery source when it is more complete than the current streamed buffer, preventing replies from stopping mid-sentence after dropped or delayed delta frames.

## Verification

- Added a focused unit test for recovering from a partial delta with a longer final done payload.
