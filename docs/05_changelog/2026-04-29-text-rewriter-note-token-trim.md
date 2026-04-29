# 2026-04-29 文本改写说明字段瘦身

## 背景

内容创作真实制作链路中，`adapter.audiobook_text_rewriter@1.0` 原先要求模型为每个台本片段输出 `rewriteNote`。该字段主要用于解释“为什么这么改”，对工作台调试有帮助，但不会驱动角色音分类、演播设计、质检或打包。

逐段生成改写说明会增加输出 token、延长响应时间，并提高 JSON 产物截断或超时概率。MVP 阶段优先保证台本核心内容跑通。

## 变更

1. `oct-gateway/script_adapter/agents/textRewriterAgent.js`
   - 文本改写系统提示不再要求输出 `rewriteNote`。
   - 输出 schema 收敛为 `segmentId`、`type`、`speaker`、`text`。
   - 归一化阶段不再保留模型返回的 `rewriteNote`。

2. `src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx`
   - 工作台台本预览改为显示本地固定说明：`已按多人演播台本格式处理`。

3. `src/modules/script-adapter/ui/Workbench/ReviewGatePreview.tsx`
   - 评审确认对比区不再显示逐段改写说明。
   - 代表片段选择改为优先旁白、对白、内心独白，而不是优先带说明的片段。

4. `src/modules/script-adapter/services/exportClient.ts`
   - Markdown 导出不再写入 `> 改编说明`。
   - DOCX payload 不再传递逐段 `note`。

5. 文档同步
   - 更新内容制作模型配置 MVP 方案。
   - 更新内容创作入口链路说明。

## 影响

- 下游 Agent 仍使用 `type`、`speaker`、`text`、`segmentId`，不受影响。
- 评审和交付文件更接近最终制作物，不再夹带内部改写解释。
- 文本改写请求更短，降低百炼 Qwen 长 JSON 输出的超时与截断风险。
