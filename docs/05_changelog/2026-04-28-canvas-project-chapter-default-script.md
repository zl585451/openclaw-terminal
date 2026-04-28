# 2026-04-28 Canvas 项目章节默认剧本模式与全目录切换

## 问题

首次从当前项目把章节加载到 Canvas 时，原流程有两层明显阻力：

- 默认创建的是 `document` 文档，用户进入后先看到普通阅读模式
- 若要做分段细改，还得再手动切到 `Script` 模式并打开编辑面板
- 当前正文只加载单章时，侧边目录只能看到这一章，无法直接感知“这本书的完整章节结构”

这会让首次使用者误以为 Canvas 只支持单章阅读，不容易发现“剧本细改”才是主操作路径。

## 修复

调整 Canvas 对“从当前项目加载章节”的默认行为：

- [src/components/workbench/WorkbenchPanel.tsx](/E:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchPanel.tsx:1) 现在默认以 `script` 视图创建项目章节文档
- 为 Workbench 文档增加 `projectBookId` / `projectChapterIndex` 元数据，记录它和当前项目书库章节的绑定关系
- 新增 [src/workbench/useProjectChapterLink.ts](/E:/windows-window/OpenClaw-Terminal/src/workbench/useProjectChapterLink.ts:1)，统一处理“项目章节文档”的切章
- [src/workbench/plugins/scriptPlugin.tsx](/E:/windows-window/OpenClaw-Terminal/src/workbench/plugins/scriptPlugin.tsx:1) 的侧边目录在检测到项目绑定后，会显示当前项目的完整章节目录，并支持直接切章
- [src/workbench/plugins/markdownPlugin.tsx](/E:/windows-window/OpenClaw-Terminal/src/workbench/plugins/markdownPlugin.tsx:1) 同样支持项目级章节目录与切章，避免文档模式里仍只看到单章

## 结果

- 首次加载章节进入 Canvas 时，默认就落在可细改的 `Script` 工作流
- 即使当前正文只载入一章，用户也能在 Canvas 内看到并切换整本书的章节目录
- “看正文 -> 找章节 -> 切模式 -> 开编辑面板”的链路缩短为“进来就能改，目录里也能直接切章”
