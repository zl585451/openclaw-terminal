# 2026-04-27 项目素材库删除确认框样式统一

## 这次做了什么

把项目素材库里删除书籍时使用的浏览器原生确认弹窗，替换成内容创作面板内的自定义确认框。

## 改动文件

- `src/modules/script-adapter/ui/Library/LibraryView.tsx`
  - 删除动作改为打开面板内确认框
- `src/modules/script-adapter/styles/scriptAdapter.module.css`
  - 新增删除确认框正文样式

## 结果

- 删除确认不再跳出系统默认弹窗
- 视觉风格与上传弹窗、章节详情抽屉保持一致
- 保留原有删除语义：删除书籍时会同时删除章节与正文；若该书是当前项目，也会同步取消当前项目绑定
