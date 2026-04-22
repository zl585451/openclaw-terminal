# 2026-04-23 解析层 Phase B 完成说明

截至当前，解析层基础三件套已完成：

## 已完成模块

1. `chapterParser`
文件：
- `src/utils/chapterParser.ts`

能力：
- 章节标题识别
- 章节起点定位
- 章节行范围计算

2. `characterExtractor`
文件：
- `src/utils/characterExtractor.ts`

能力：
- 角色注册
- 默认颜色分配
- 自定义颜色合并

3. `dialogueDetector`
文件：
- `src/utils/dialogueDetector.ts`

能力：
- 旁白识别
- 场景/备注识别
- 对白识别

## 当前架构状态

`script` 面板已不再把“章节 / 角色 / 行级对白识别”全部硬编码在一个插件文件里，而是开始复用公共解析层。

这意味着后续可以开始进入下一阶段：

- `document` 模式接章节目录
- `document` 模式接角色侧栏
- 演播视图接对白高亮

## 结论

Phase B 已完成。  
下一阶段建议进入 `Phase C`：把公共解析层能力接到 `document` 模式，优先落地章节目录。
