# 2026-04-23 解析层 Phase 2：抽离公共角色登记层

## 背景

在 `scriptParser` 中，角色列表构建、颜色分配、颜色合并此前仍然是剧本解析内部实现。

如果后续要支持：

- `document` 模式的人物侧栏
- 小说 / 有声书的人名高亮
- 角色别名归并

这些基础能力不应该继续只活在剧本解析器里。

## 本次改动

新增公共角色登记模块：

- `src/utils/characterExtractor.ts`

提供能力：

- `DEFAULT_CHARACTER_COLORS`
- `mergeCharacterColors(baseColors, customColors)`
- `createCharacterRegistry()`

## 接入范围

### `scriptParser`

`src/utils/scriptParser.ts` 改为通过 `createCharacterRegistry()` 维护：

- 角色去重
- 首次出现顺序
- 默认颜色分配

不再在解析器内部直接维护颜色调色板与角色登记细节。

### Script Workbench

`src/workbench/plugins/scriptPlugin.tsx` 改为从公共角色模块读取 `mergeCharacterColors()`。

`src/workbench/plugins/script/ScriptCharacterBar.tsx` 改为复用 `DEFAULT_CHARACTER_COLORS`。

## 收益

- 角色登记能力首次从 `script` 语义中抽离
- 为后续小说正文的人物识别侧栏提供公共底座
- 后面继续做“角色别名 / 章节内人物统计 / 有声书角色标注”时，不需要重新造颜色与角色注册规则
