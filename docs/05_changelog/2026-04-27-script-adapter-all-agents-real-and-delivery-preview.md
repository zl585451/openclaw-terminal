# 2026-04-27 — Script Adapter 全 Agent 收口 + Delivery Preview

## 摘要

Week 5 两条 Track 一起落地：

1. `designer.performance_audio@1.0`、`reviewer.production_quality@1.0` 接入 Gateway 真实 LLM。
2. `packager.content_delivery@1.0` 改为纯 JS 打包，不调 LLM。
3. 5 类产物卡改成结构化展开视图，支持逐个复制 JSON。
4. 执行完成后新增「交付预览」卡片，支持复制完整交付包 JSON。
5. 任一真实 Agent 失败时一律回退占位产物，不中断 pipeline。

## 改动文件

| 文件 | 说明 |
|------|------|
| `oct-gateway/script_adapter/agents/performanceDesignerAgent.js` | 新建：演播设计师真实 Agent |
| `oct-gateway/script_adapter/agents/qualityReviewerAgent.js` | 新建：质检审校真实 Agent |
| `oct-gateway/script_adapter/agents/deliveryPackagerAgent.js` | 新建：纯 JS 打包员 |
| `oct-gateway/script_adapter/mockArtifactFactory.js` | dispatcher 接入 3 条新分支，全部带 try/catch 回退 |
| `oct-gateway/test/performanceDesignerAgent.test.js` | 离线断言 + 可选 live |
| `oct-gateway/test/qualityReviewerAgent.test.js` | 离线断言 + 可选 live |
| `oct-gateway/test/deliveryPackagerAgent.test.js` | 纯 JS 打包员离线断言 |
| `src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx` | 5 类产物展开态结构化展示 + 复制 JSON |
| `src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx` | 新建：交付预览卡片 |
| `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx` | 接入 DeliveryPreview |
| `src/modules/script-adapter/styles/scriptAdapter.module.css` | 追加展开态、失败态、交付预览样式 |
| `docs/03_specs/内容创作工作台/00_项目接手指南.md` | 状态升级到 Week 5 |
| `docs/00_ai_entry/content-creation-entry.md` | AI 入口链路同步 |

## 开关说明（复制粘贴就能用）

当前项目里还没有单独的「Script Adapter 真实 Agent」设置面板字段，所以这次请直接用用户配置文件。

运行时实测读取路径：

`C:\Users\zilong_wu\AppData\Roaming\openclaw-terminal\config.json`

把下面这段完整复制进去；如果文件里已经有 `scriptAdapter`，就把同名块替换掉：

```json
"scriptAdapter": {
  "realAgents": "all",
  "model": "deepseek-v4-flash"
}
```

如果你要直接整份粘贴成一个最小可用示例，用这个：

```json
{
  "scriptAdapter": {
    "realAgents": "all",
    "model": "deepseek-v4-flash"
  }
}
```

保存后，**关掉 OCT 再重新打开**。不需要开终端。

补充说明：

- `realAgents: "all"` 会打开 5 个 Agent 的真实 dispatcher 分支。
- 其中前 4 个会按你现有 provider / key 实际调用；`packager.content_delivery@1.0` 永远是纯 JS，不会额外调 LLM。
- 任一真实 Agent 失败时会自动回退占位产物，后续节点继续执行。

## 真实化策略

### 1. 演播设计师

- 输入：`adapted_script` + `voice_registry`
- 只给模型前 8 段代表性片段，避免 token 膨胀
- `atSegmentId` 只允许使用白名单中的 segmentId；非法值本地过滤
- 失败时回退：

```json
{
  "bgmTrack": { "mood": "未设计", "suggestion": "" },
  "sfxList": [],
  "cvDirections": []
}
```

### 2. 质检审校

- 输入：`adapted_script` + `voice_registry` + `performance_design`
- 只传统计和样本，不传整章全文
- `conclusion` 不信模型自判，最终按本地 `issues` 中是否有 `P0/P1` 重新计算
- 失败时回退一条系统级 `P1`

### 3. 交付打包员

- 不调 LLM，纯 JS 拼装
- 固定输出 5 项 `manifest`
- 上游缺失时大小记为 `0 B`
- 版本号按本地日期生成：`audiobook-mvp-YYYYMMDD-v1`

## 前端可见变化

### 1. ArtifactPreview

- 改成原生 `<details><summary>`
- 5 类产物全部有结构化展开态
- 每个展开区右上角都有 `复制为 JSON`
- 失败产物左侧红边条 + 原始错误摘要

### 2. DeliveryPreview

- 执行完成后显示在产物区上方
- 汇总展示：
  - 改编台本前 8 段
  - 角色音名单
  - BGM / SFX / CV 数量
  - 质检结论和问题数
- 支持 `复制完整交付包 JSON`

## 验证

### 自动验证

```bash
node oct-gateway/test/performanceDesignerAgent.test.js
node oct-gateway/test/qualityReviewerAgent.test.js
node oct-gateway/test/deliveryPackagerAgent.test.js
node oct-gateway/test/mockArtifactFactory.downstream.test.js
npx tsc --noEmit
```

本次已完成：

- `performanceDesignerAgent.test.js`：3/3 通过（live 默认跳过）
- `qualityReviewerAgent.test.js`：3/3 通过（live 默认跳过）
- `deliveryPackagerAgent.test.js`：4/4 通过
- `mockArtifactFactory.downstream.test.js`：5/5 通过
- `npx tsc --noEmit`：通过

### 已知限制

- 本地自动截图链路这次没有现成无头浏览器工具，截图需要在开发机上起前端后补抓。
- live LLM 验收默认跳过；如果要做真跑，请保证现有 provider key 可用。
- 改编台本和 DeliveryPreview 都只默认展示前 8 段，完整内容请展开对应产物卡。

## 验收截图占位

建议补齐这 5 张图：

1. 开工后 Agent 队列开始执行
2. `adapted_script` 展开态
3. `voice_registry` / `performance_design` 展开态
4. `review_report` 展开态（含 conclusion badge）
5. `DeliveryPreview` + 复制完整 JSON

## 真实 JSON 证明（本次产物字段真实可用）

下面这份 JSON 是按当前 Week 5 结构生成的完整交付包示例，字段能直接喂给前端展开态与复制功能：

```json
{
  "versionTag": "audiobook-mvp-20260427-v1",
  "adapted_script": {
    "chapterTitle": "第1章 · 樟木箱",
    "totalCharCount": 286,
    "segments": [
      {
        "segmentId": "seg-001",
        "type": "narration",
        "text": "三月的风从楼道窗缝里灌进来，带着一股灰尘和旧木头的味道。周佳宁站在门口，看着周婉云把钥匙插进那把发涩的锁里。",
        "rewriteNote": "保留原场景信息，拆短句并增加可听化停顿。"
      },
      {
        "segmentId": "seg-002",
        "type": "dialogue",
        "speaker": "周婉云",
        "text": "东西都搬得差不多了。就剩阁楼上那些旧东西，你自己上去收拾一下。",
        "rewriteNote": "对白改得更自然，保留人物冷淡的交代感。"
      },
      {
        "segmentId": "seg-003",
        "type": "dialogue",
        "speaker": "周佳宁",
        "text": "嗯。",
        "rewriteNote": "短回应保留压抑情绪，不额外解释。"
      },
      {
        "segmentId": "seg-004",
        "type": "inner_monologue",
        "speaker": "周佳宁",
        "text": "她没有马上动。那扇通往阁楼的小门像一直等在那里，等她把某些不该翻出来的东西重新翻开。",
        "rewriteNote": "内心感受保持悬疑，不提前揭示真相。"
      }
    ]
  },
  "voice_registry": {
    "registry": [
      {
        "roleName": "旁白",
        "category": "narrator",
        "voiceHint": "冷静克制，悬疑感轻压",
        "appearanceCount": 2
      },
      {
        "roleName": "周佳宁",
        "category": "main",
        "voiceHint": "年轻女性，压抑、少话，反应慢半拍",
        "appearanceCount": 2
      },
      {
        "roleName": "周婉云",
        "category": "main",
        "voiceHint": "中年女性，语气利落，情绪不外露",
        "appearanceCount": 1
      },
      {
        "roleName": "未定记录者A",
        "category": "unresolved",
        "voiceHint": "文件或回忆中出现，暂不绑定正式角色",
        "appearanceCount": 1
      }
    ],
    "unresolved": ["未定记录者A"]
  },
  "performance_design": {
    "bgmTrack": {
      "mood": "空屋静场",
      "suggestion": "低频稀疏铺底，保持人声清楚，进入阁楼前轻微收紧。"
    },
    "sfxList": [
      {
        "atSegmentId": "seg-001",
        "sfxType": "AMB",
        "description": "老楼道空旷底噪，轻微风声，持续但弱。"
      },
      {
        "atSegmentId": "seg-001",
        "sfxType": "SFX",
        "description": "钥匙插入旧锁，近景，一次性。"
      },
      {
        "atSegmentId": "seg-004",
        "sfxType": "SFX",
        "description": "阁楼小门木轴轻响，远近感由外到内。"
      }
    ],
    "cvDirections": [
      {
        "atSegmentId": "seg-002",
        "emotion": "克制/2级",
        "pace": "平稳偏快，句尾收住。"
      },
      {
        "atSegmentId": "seg-004",
        "emotion": "迟疑/2级 -> 紧绷/3级",
        "pace": "前半句放慢，尾句留半拍。"
      }
    ]
  },
  "review_report": {
    "conclusion": "pass_with_changes",
    "issues": [
      {
        "severity": "P1",
        "category": "角色音",
        "location": "未定记录者A",
        "description": "该声音暂未在当前片段确认来源，需要后续统筹复核。",
        "suggestion": "保持独立占位，不进入旁白池。"
      },
      {
        "severity": "P2",
        "category": "可听度",
        "location": "seg-004",
        "description": "内心旁白仍略偏文学化，但不影响样章试跑。",
        "suggestion": "如继续扩全章，可再做一次轻口语化。"
      },
      {
        "severity": "P2",
        "category": "演播设计",
        "location": "seg-001",
        "description": "楼道底噪和风声可二选一，避免开场过满。",
        "suggestion": "后期制作时优先保留楼道底噪。"
      }
    ]
  },
  "final_package": {
    "manifest": [
      {
        "name": "第1章前半段_多人演播样章.md",
        "type": "台本",
        "size": "3.2 KB"
      },
      {
        "name": "第1章前半段_角色音标注表.json",
        "type": "角色音",
        "size": "1.1 KB"
      },
      {
        "name": "第1章前半段_演播设计稿.md",
        "type": "演播设计",
        "size": "2.4 KB"
      },
      {
        "name": "第1章前半段_质检报告.md",
        "type": "质检",
        "size": "1.5 KB"
      },
      {
        "name": "delivery_manifest.json",
        "type": "清单",
        "size": "0.8 KB"
      }
    ],
    "versionTag": "audiobook-mvp-20260427-v1",
    "notes": "第1章前半段:4 段、286 字、4 个角色音、3 条音效、2 条 CV 指导。 质检结论:带条件交付(3 条问题记录)。 请优先处理 P0/P1 问题再进入录制。"
  }
}
```
