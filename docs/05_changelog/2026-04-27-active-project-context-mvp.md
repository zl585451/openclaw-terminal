# 2026-04-27 当前书本上下文 MVP

## 这次做了什么

为内容创作 MVP 增加“当前书本上下文”能力：用户在书库里选定一本书后，AMY 在聊天时会自动感知这本书的基础结构信息，不再需要用户反复粘贴整本书背景。

在此基础上，补齐了最小可用的“按章读取正文”：

- 当用户在当前项目下提到“第 5 章 / 第五章 / 5章”时
- Gateway 会自动从项目库拉取该章节正文
- 并把这一章的内容作为本轮上下文注入给 AMY

同时收紧了 Workbench 的职责边界：

- 书稿上传与章节管理继续归 `AI.library / Library`
- Workbench 主要承载 AMY 产出的 artifact
- 聊天链路会自动把当前书的元数据和章节目录透传给 Gateway
- 透传完整链路现已覆盖 renderer → `electron/main.ts` → `oct-gateway`

## 代码改动

- 新增 `src/contexts/ProjectContext.tsx`
  - 管理当前选中的书本项目
  - 本地持久化 `oct.active-project-id`
- 更新 `src/main.tsx`
  - 注入 `ProjectProvider`
- 更新 `electron/main.ts`
  - `openclaw-send` IPC handler 读取 `projectContext`
  - `sendChatMessage` 向 Gateway `chat.send.params` 透传 `projectContext`
- 更新 `src/types/gateway.ts`
  - `GatewaySendPayload` 新增 `projectContext`
- 更新 `src/hooks/useWebSocket.ts`
  - `send()` 支持透传 `projectContext`
- 更新 `src/hooks/useMessages.ts`
  - `sendMessage` 与 `quickSend` 都会带上当前项目上下文
- 更新 `src/modules/script-adapter/ui/Library/BookCard.tsx`
  - 增加“设为当前项目”状态与入口
- 更新 `src/modules/script-adapter/ui/Library/LibraryView.tsx`
  - 接入 `ProjectContext`
  - 删除当前项目时同步清空活跃项目
- 更新 `src/components/workbench/WorkbenchPanel.tsx`
  - 移除上传文本入口
  - 空状态文案改成书库优先
- 更新 `oct-gateway/index.js`
  - 从请求参数读取 `projectContext`
- 更新 `oct-gateway/runtime/contextBuilder.js`
  - 在 system prompt 中注入当前书本结构信息
  - 当用户明确提到某一章时，自动抓取该章正文并注入本轮用户上下文
- 更新 `src/modules/script-adapter/ui/Library/UploadDialog.tsx`
  - 上传成功后把结果回传给素材库页
- 更新 `src/modules/script-adapter/ui/Library/LibraryView.tsx`
  - 在素材库上传成功后自动设为当前项目

## 行为结果

- 用户在书库中选择“当前项目”后，AMY 会自动知道：
  - 书名
  - 作者
  - 总章节数
  - 总字数
  - 前 60 章目录摘要
- 这层上下文默认只提供书本结构
- 只有当用户明确问到某一章时，才会自动把对应章节正文拉入本轮上下文
- 快捷发送与常规发送保持一致，不再出现“有时带项目、有时不带”的差异
- 书库页上传新书后，会自动把新书设为当前项目，避免“已上传但 AMY 还没切到这本书”的落差

## 定位说明

这次不是完整的 Claude Projects 式项目系统，而是一个更轻量、更准确的过渡层：

- 对内定位：`Current Project Context MVP`
- 核心目标：让 AMY 自动拥有“当前书本”上下文
- 不包含：项目任务编排统一化、产物归档统一化、多人协作
