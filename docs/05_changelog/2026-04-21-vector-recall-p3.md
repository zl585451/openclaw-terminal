## P3 向量召回

- 新增 `memory.vectorRecall` 配置、Embedding 客户端、sqlite-vec 向量库、异步写入器、回填工具和召回器。
- 原始 L3 日志写入成功后，在向量召回启用时异步生成 embedding，不阻塞主对话。
- 新增 `/recall test|status|query|backfill` 命令；命令入口适配当前 `gateway/slash.js`。
- 主对话上下文构建阶段会在本轮请求内注入相关历史回忆；该注入不写入 session 历史。
- 向量库默认写入 `~/.openclaw/vector_recall/vectors.db`；如自定义到仓库内，`.gitignore` 已覆盖常见 db 路径。
