# 2026-04-28 Memory Vector Search Tool

## 变更摘要

- 新增 Gateway 工具 `memory_vector_search`，允许 AMY 主动语义检索向量记忆库中的历史对话内容。
- 更新 AI 记忆工具使用提示：当用户要查“以前关于某主题聊过哪些内容”时，优先使用语义检索，而不是只靠关键词搜索。
- 同步补充伪工具调用识别名单，避免严格模型输出明文工具调用时漏识别。
- 为 `/recall` 增加 `recent` 浏览命令，并在 `status` 中增加 embedding 模型分布，方便排查“库里有很多条但命不中”的情况。

## 背景

之前 AMY 只有：

- `memory_search`：按关键词查 Nocturne 结构化记忆
- `memory_read`：读取指定节点
- `memory_recall`：按日期回忆原始对话

但缺少一个“直接查向量库内容”的显式工具，导致 AMY 无法主动查看语义相关的历史对话片段，只能被动依赖自动注入或人工 `/recall query`。

## 影响范围

- `oct-gateway/tools/memory_vector_search.js`
- `oct-gateway/ai.js`

## 验证建议

- 开启向量召回并确保向量库中已有数据
- 让 AMY 执行“帮我查一下之前关于 AI.library 内置模块聊过什么”
- 观察工具调用是否命中 `memory_vector_search`
