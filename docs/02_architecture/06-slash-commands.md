# 第六层：Slash 命令

| 命令 | 做什么 | 文件 |
|------|--------|------|
| `/new` `/reset` | 清空当前会话 | index.js |
| `/status` | 显示 Gateway/模型/Memory v2/**AI.library**/会话状态 | index.js |
| `/model` | 查看/切换 AI 模型（展示当前 provider 的模型列表，🔧 工具 🧠 思考） | index.js |
| `/provider` | 查看/切换 AI 服务商 | index.js |
| `/memory boot` | 重载核心记忆 | index.js |
| `/memory today` | 今天的对话摘要 | index.js |
| `/memory stats` | 记忆统计 | index.js |
| `/memory read URI` | 读取指定记忆节点 | index.js → memory.js |
| `/memory search 关键词` | 搜索记忆 | index.js → memory_search.js |
| `/memory status` | 检查 Memory v2 状态 | index.js → memory.js |
| `/export training-data` | 导出训练数据 JSONL | index.js |
