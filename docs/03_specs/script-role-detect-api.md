# Script Role Detect API

## Endpoint

- `POST /api/script-role-detect`

## Purpose

- Only analyze the chapter currently displayed in the script panel.
- Detect likely speaker roles from the current chapter.
- Return chapter-local line attributions without rewriting the source text.

## Request Body

```json
{
  "chapterTitle": "第1章 第1章 樟木箱",
  "chapterText": "当前章节全文",
  "existingRoles": ["周婉云", "周佳宁"],
  "candidateLines": [
    { "lineIndex": 8, "text": "“该扔的就扔，别舍不得。”周婉云又说。" },
    { "lineIndex": 9, "text": "“知道了。”" }
  ],
  "structuredCandidates": [
    { "lineIndex": 14, "label": "案号", "text": "案号：临公刑字[1986]012。" },
    { "lineIndex": 16, "label": "日期", "text": "日期：1986年4月17日。" }
  ]
}
```

## Response Body

```json
{
  "success": true,
  "result": {
    "roles": ["周婉云", "周佳宁"],
    "structuredLines": [
      { "lineIndex": 14, "label": "案号" },
      { "lineIndex": 16, "label": "日期" }
    ],
    "voiceFragments": [
      { "lineIndex": 22, "speaker": "老马", "mentionedNames": ["老马"] },
      { "lineIndex": 24, "mentionedNames": ["李局"] }
    ],
    "attributions": [
      { "lineIndex": 8, "speaker": "周婉云", "confidence": "high" },
      { "lineIndex": 9, "speaker": "周佳宁", "confidence": "medium" }
    ]
  }
}
```

## Notes

- `candidateLines` is the only set of lines eligible for line attribution output.
- `structuredCandidates` is the only set of lines eligible for structured-record exclusion output.
- `voiceFragments` can only point to `candidateLines`, because they are quote-based OS / echo / fragmented role-voice judgments.
- The route is intentionally narrow and chapter-scoped so it can remain a small reusable module.
- Frontend pre-normalizes role candidates before request assembly, especially for prose cue text like `周佳宁应了一声：`.
- Frontend stores the returned roles as a per-document character color library, stores attributions by chapter key, stores structured-line exclusions by chapter key, and stores voice-fragment markers by chapter key.
- Frontend may additionally derive a debug/result-panel view from the same response without changing the API contract.
