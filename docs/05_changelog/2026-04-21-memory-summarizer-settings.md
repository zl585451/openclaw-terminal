# 2026-04-21 记忆摘要模型设置入口

- 在设置面板的「记忆系统」页新增「摘要模型配置」入口。
- 支持保存摘要系统启用开关、Base URL、API Key、模型名到 Electron userData `config.json` 的 `memory.summarizer`。
- 保存后会重启 Gateway，使 `oct-gateway/config.js` 中的 `config.memory.summarizer` 读取到新配置。
