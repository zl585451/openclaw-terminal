# 2026-04-23 Document 阅读视图聚焦修复：仅渲染当前章节 + 侧栏可折叠

## 问题

长篇正文接入章节目录与角色侧栏后，出现两个直接影响可用性的 P0：

1. 阅读区被左右两块侧栏挤压，Canvas 本就半屏，正文进一步变窄，长时间阅读不舒适
2. 虽然章节被识别出来，但正文仍然一次性渲染全书，导致：
   - 渲染资源占用过大
   - 超长文本在后半段可能出现无法完整渲染

## 本次修复

### 1. 改为仅渲染当前章节

`src/workbench/plugins/markdownPlugin.tsx`

- `DocumentViewer` 不再一次性渲染所有章节 section
- 只渲染当前激活章节 `activeSection`
- 切换章节时重置正文滚动到顶部

### 2. 阅读优先布局

`src/workbench/plugins/document/styles.ts`

`DocumentChapterSidebar.tsx`

`DocumentCharacterPanel.tsx`

- 章节目录支持收起 / 展开
- 角色侧栏支持收起 / 展开
- 角色侧栏默认收起
- 顶部增加轻量阅读控制条

## 用户可见效果

- 正文默认可获得更宽的阅读区域
- 点击章节时只展示该章节正文
- 超长文本不再因为整本同时渲染而把后面章节拖垮
- 需要结构辅助时再展开目录或角色栏
