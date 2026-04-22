# 2026-04-23 解析层 Phase 3：抽离公共对白检测层

## 背景

在前两个阶段完成章节解析与角色登记之后，`scriptParser` 里仍然保留着一大块“行级结构识别”逻辑：

- 旁白识别
- 场景指令识别
- 导演备注识别
- 角色对白识别

如果后续要兼容小说正文与有声书演播视图，这部分能力也必须从剧本解析器内部抽离出来。

## 本次改动

新增公共对白检测模块：

- `src/utils/dialogueDetector.ts`

当前提供：

- `detectDialogueLikeLine(trimmedLine)`

可识别：

- `narrator`
- `direction`
- `dialogue`

并统一返回结构化检测结果。

## 接入范围

### `scriptParser`

`src/utils/scriptParser.ts` 不再自己维护旁白 / 指令 / 对白的正则匹配流程，而是改为复用 `detectDialogueLikeLine()`：

- 命中 `narrator` -> 生成 `ScriptLine(type: 'narrator')`
- 命中 `direction` -> 生成 `ScriptLine(type: 'direction')`
- 命中 `dialogue` -> 生成 `ScriptLine(type: 'dialogue')`
- 未命中 -> 回退为 `text`

## 收益

- 解析层第三块公共能力已经抽出
- 后续 `document` / 演播视图都可以站在同一套行级检测规则上继续扩展
- `scriptParser` 进一步瘦身，职责更聚焦于“章节容器 + 结果归档”
