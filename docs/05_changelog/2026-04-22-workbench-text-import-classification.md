# 2026-04-22 Workbench 文本导入类型判定修复

## 背景

Workbench 里的 `📄 剧本` 上传入口此前会把所有 `.txt / .docx` 一律按 `artifactType === 'script'` 打开。

这对广播剧脚本是对的，但对“按章节组织的长篇正文 / 小说稿”不适配：

- 入口名字叫“上传剧本”，但用户实际也会导入普通文本
- 正文类文本会被强行送进剧本渲染器
- 结果往往表现为“章节目录有了，但正文显示不正常 / 观感不对”

## 本次修改

### 轻量结构判定

在 `src/utils/scriptParser.ts` 新增：

- `analyzeScriptStructure(rawText)`
- `inferImportedTextArtifactType(rawText)`

判定思路：

- 若文本同时具备较强的“角色对白 / 场景指令 / 旁白”结构信号，则判为 `script`
- 若文本以章节标题 + 连续正文段落为主，则判为 `document`
- 边界情况走保守兜底，避免把长篇正文误判成剧本

### 上传入口行为调整

`src/components/workbench/WorkbenchPanel.tsx` 的上传按钮现在会：

1. 先读取 `.txt / .docx` 纯文本
2. 再根据结构自动决定打开为 `script` 或 `document`
3. 仅当判为 `script` 时保留 `draftCachePath`

同时，按钮文案从“上传剧本 / 剧本”调整为“上传文本 / 文本”，更贴近真实使用方式。

## 影响

- 真正的剧本文件仍然进入 Script Workbench
- 长篇章节正文会回退到普通文档阅读模式
- 修复“上传正文类 TXT 后正文显示不正常”的主路径问题
