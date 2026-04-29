# Text Rewriter 行协议解析与合并规范

状态：阶段 2 已实现

## 输入格式

Text Rewriter 的模型输出按行协议解析：

```text
旁白|旁白文本内容
角色名|角色说出的对白内容
内心:角色名|角色的内心独白内容
```

解析器按每行第一个 `|` 分隔，右侧正文中继续出现的 `|` 保留为文本内容。

## 映射规则

| 行协议左侧 | type | speaker |
|---|---|---|
| `旁白` | `narration` | `undefined` |
| `角色名` | `dialogue` | `角色名.trim()` |
| `内心:角色名` | `inner_monologue` | `角色名.trim()` |

空行跳过。无 `|`、左侧为空、右侧为空、`内心:` 后无角色名的行会进入 warnings，不抛异常，不产生 segment。

## 输出结构

解析结果对齐冻结的 `AdaptedScriptPayload`：

- `chapterTitle`：调用方传入，缺省为 `未命名片段`
- `totalCharCount`：所有 `segments[].text.length` 之和，由程序计算
- `segments`：按有效行顺序生成，`segmentId` 从 `seg-001` 连续递增

MVP 主链路不把 warnings 写入 payload；warnings 用于测试、验证和后续质检。

## Chunk 合并

长文本分 chunk 改写后，Text Rewriter 会把每个成功 chunk 的 segments 按全局顺序重新编号。

如果部分 chunk 失败：

- 失败 chunk 写入一个 `narration` 占位 segment
- 后续 chunk 继续合并
- 至少一个 chunk 成功时返回合并结果
- 全部 chunk 失败时抛出 `TEXT_REWRITER_CHUNK_FAILED`

## 验证基线

阶段 2 使用阶段 1 round9 的三份真实行协议输出验证：

- `ch-test-01-output.txt`：84/84 行解析成功
- `ch-test-02-output.txt`：53/53 行解析成功
- `ch-test-03-output.txt`：82/82 行解析成功
