## 向量召回配置入口

- 在设置面板“记忆系统”中新增“向量召回配置”入口。
- 提供百炼、火山和自定义 OpenAI 兼容供应商选项；百炼北京区默认填入 `text-embedding-v4` 和 1024 维。
- 配置保存到用户 `config.json` 的 `memory.vectorRecall`，保存后自动重启 Gateway。
