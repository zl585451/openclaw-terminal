# 2026-04-22 解析层 Phase 1：抽离公共章节解析

## 背景

在继续做小说 / 有声书兼容前，章节识别逻辑此前分散在两处：

- `src/utils/scriptParser.ts` 内部负责识别章节标题
- `src/workbench/plugins/scriptPlugin.tsx` 内部又各自实现了一套章节起止定位逻辑

这种状态会让后续 `document`、`script`、演播视图各写一套章节判断，越来越难维护。

## 本次改动

新增公共章节解析模块：

- `src/utils/chapterParser.ts`

提供的能力：

- `isChapterTitle(line)`
- `extractChapterBoundaries(lines)`
- `findChapterLineStarts(lines, chapterTitles)`
- `buildChapterLineRanges(lines, chapterTitles)`

## 接入范围

### `scriptParser`

`src/utils/scriptParser.ts` 不再自己维护章节标题正则，而是改为复用 `isChapterTitle()`。

### `scriptPlugin`

`src/workbench/plugins/scriptPlugin.tsx` 的“当前章节格式化”切片逻辑，改为通过 `buildChapterLineRanges()` 获取章节起止行。

## 收益

- 章节识别首次形成公共解析层
- 避免 UI 插件内重复维护章节切片算法
- 为后续 `document` 模式补章节目录打基础
