# 任务安排初步分析 Agent 规则

## 文档状态

- 版本：v1.0
- 状态：已定版，作为上传素材后、第二步任务规划前的轻量分析 Agent 规则
- Agent ID：`task.intake_planner@1.0`
- 定位：任务安排 Agent，不是业务创作 Agent

---

## 1. 核心定位

任务安排初步分析 Agent 负责在用户确认素材后，快速判断“这份素材应该如何进入内容制作流程”。

它不做深度剧情分析，不改写文本，不生成演播稿。它只做轻量摄入分析、任务草案生成和 Agent 预分配。

一句话：

`task.intake_planner@1.0` 决定“接下来该怎么干”，后续业务分析 Agent 才判断“内容具体有什么问题”。

---

## 2. 触发时机

触发条件：

1. 用户完成第 1 步素材确认。
2. 系统已保存 `RawAsset`。
3. 系统已完成文本抽取和基础清洗。
4. 系统已生成 `SourceDocument` 和基础 `SourceProfile`。

触发后，前端不进入正式工作台，而是回填第 2 步任务详细规划面板。

---

## 3. 输入对象

必需输入：

1. `RawAsset`
2. `SourceDocument`
3. `SourceProfile`
4. 用户在入口阶段选择的初始目标
5. 用户在入口阶段填写的初始要求

可选输入：

1. 历史项目上下文。
2. 用户常用制作偏好。
3. 同名项目历史任务。
4. 已有角色库或术语库。

---

## 4. 输出对象

必须输出：

1. `IntakeReport`
2. `TaskDraft`
3. `AgentPreAllocation`
4. `IntakeWarnings`

这些对象只用于第 2 步规划确认，不代表正式执行。

---

## 5. 分析范围

允许分析：

1. 素材类型：小说、剧本、访谈稿、课程稿、短片段。
2. 结构特征：章节、标题、段落、对白密度、旁白比例。
3. 规模判断：字数、章节数、是否过长。
4. 目标匹配度：素材是否适合目标产物。
5. 推荐范围：全文、前 1 章、自定义范围。
6. 推荐本轮目标：先分析问题、直接生成样章、只做作品分析。
7. 后续 Agent 预分配。

禁止分析：

1. 不做完整剧情结构分析。
2. 不做角色关系深挖。
3. 不改写原文。
4. 不输出最终演播设计。
5. 不替用户直接进入业务执行。

---

## 6. 推荐时效

目标时长：

1. 小文本：5 秒以内。
2. 普通章节：5-20 秒。
3. 长篇文件：20-60 秒。

如果超过 60 秒，应先返回部分结果，并将长耗时任务放入后台队列。

长文本不应在这一阶段全文深读。可以使用目录、开头、章节标题、随机段落抽样和元数据进行轻量判断。

---

## 7. 输出格式

建议结构：

```json
{
  "intake_report": {
    "content_type": "novel_body",
    "structure": "chapter_detected",
    "suitability": "good_for_multicast_audiobook",
    "summary": "素材为小说正文，旁白和对白混合，适合先做多人演播方向分析。"
  },
  "task_draft": {
    "recommended_target": "multicast_audiobook",
    "recommended_scope": "chapter_1",
    "recommended_goal": "analysis_first",
    "reason": "先控制样章范围，避免首次任务过大。"
  },
  "agent_pre_allocation": {
    "ready": ["business.content_analyzer"],
    "standby": ["scene.splitter", "text.rewriter", "voice.role_marker"]
  },
  "intake_warnings": [
    {
      "level": "low",
      "message": "字数和章节边界仍需真实解析结果确认。"
    }
  ]
}
```

---

## 8. 和业务分析 Agent 的边界

任务安排 Agent：

1. 判断任务怎么排。
2. 生成任务草案。
3. 推荐 Agent 队列。
4. 找明显冲突。

业务分析 Agent：

1. 分析作品内容问题。
2. 分析剧情结构、人物关系、节奏风险。
3. 给出具体改编建议。
4. 生成可供用户确认的分析报告。

两者不能合并，否则第一步会变慢，用户会在上传后等待过久。
