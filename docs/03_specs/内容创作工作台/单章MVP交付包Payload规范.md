# 单章 MVP 交付包 Payload 规范

状态：阶段 6 已实现

`final_package.payload` 是交付阶段给 UI、复制 JSON 和导出链路使用的统一包。

## 字段

```jsonc
{
  "versionTag": "audiobook-mvp-YYYYMMDD-v1",
  "manifest": [
    { "name": "文件名", "type": "台本|角色音|质检|演播设计|清单", "size": "估算大小" }
  ],
  "notes": "交付说明",
  "adapted_script": { "chapterTitle": "...", "totalCharCount": 0, "segments": [] },
  "voice_markers": { "registry": [], "unresolved": [] },
  "voice_registry": { "registry": [], "unresolved": [] },
  "basic_qc_report": { "conclusion": "pass", "issues": [] },
  "review_report": { "conclusion": "pass", "issues": [] },
  "performance_design": { "bgmTrack": {}, "sfxList": [], "cvDirections": [] }
}
```

## 兼容策略

- `voice_markers` 是阶段 6 推荐字段；`voice_registry` 保留给既有 UI 和导出逻辑。
- `basic_qc_report` 是阶段 5 规则质检结果；`review_report` 保留给既有 UI 和导出逻辑。
- `performance_design` 可选。单章 MVP 主线可跳过演播设计，但 manifest 和 notes 仍应完整生成。
- UI 展示 final package 时优先读取包内字段；缺失时回退到执行 sheet 中独立 artifacts。
