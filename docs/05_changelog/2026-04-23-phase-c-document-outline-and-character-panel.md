# 2026-04-23 Phase C：Document 模式接入章节目录与角色侧栏

## 背景

在完成解析层 Phase B 后，公共能力已经具备：

- 章节解析
- 角色登记
- 行级对白检测

下一步需要把这些能力真正接入 `document` 模式，让长篇正文不再只有“纯显示”，而是开始具备小说 / 有声书工作台的基础结构。

## 本次改动

### Document 视图新组件

- `src/workbench/plugins/document/styles.ts`
- `src/workbench/plugins/document/DocumentChapterSidebar.tsx`
- `src/workbench/plugins/document/DocumentCharacterPanel.tsx`

### Markdown Plugin 接线

`src/workbench/plugins/markdownPlugin.tsx` 从“单块 Markdown 渲染”升级为 `DocumentViewer`：

- 左侧章节目录
- 中间章节化正文
- 右侧角色侧栏

并使用公共解析层：

- `chapterParser`：切出章节 section
- `characterExtractor`：提取角色候选与颜色

### 角色提取增强

`src/utils/characterExtractor.ts` 新增：

- `extractDocumentCharacterMentions(rawText)`

当前策略为保守启发式：

- 显式对白 / 旁白角色高权重计入
- 对小说正文做基础中文姓名候选提取
- 过滤明显非人名的常见地点/机构/泛词

## 用户可见结果

在 `artifactType === 'document'` 的 Workbench 文档中：

1. 左侧出现章节目录
2. 点击章节可滚动跳转
3. 右侧出现角色侧栏
4. 点击角色会跳到该角色首次出现章节
5. 每章底部附带该章角色出现芯片

## 说明

这仍然是 `Phase C`，不是最终版人物识别：

- 当前角色侧栏已对小说正文可用，但仍是启发式，不是完整 NER
- 下一阶段可继续补“角色高亮 / 章节内角色筛选 / 更稳的人名归并”
