# FEATURE_MAP.md — OCT 项目功能活地图

> **维护规则**：每次新增/修改功能后，必须更新此文件。  
> **最后更新**：2026-03-21（AI.library 集成 P0+P1+P2）  
> **详细说明**：查看 `docs/feature-map/` 文件夹中的分模块文档

---

## 快速导航

| 层级 | 模块 | 文件 |
|------|------|------|
| 第一层 | 基础设施 | [`01_infrastructure.md`](./feature-map/01_infrastructure.md) |
| 第二层 | 对话后自动处理管线 | [`02_auto_pipeline.md`](./feature-map/02_auto_pipeline.md) |
| 第三层 | 前置思考管线 | [`03_hypothesis.md`](./feature-map/03_hypothesis.md) |
| 第四层 | 记忆搜索与启动加载 | [`04_memory_search.md`](./feature-map/04_memory_search.md) |
| 第五层 | 图片处理 | [`05_image.md`](./feature-map/05_image.md) |
| 第六层 | Slash 命令 | [`06_commands.md`](./feature-map/06_commands.md) |
| 第七层 | Electron 桌面应用 | [`07_electron.md`](./feature-map/07_electron.md) |
| 第八层 | 提示词系统 | [`08_prompts.md`](./feature-map/08_prompts.md) |
| 第九层 | 工具系统 | [`09_tools.md`](./feature-map/09_tools.md) |
| 附录 | AI.library 集成 | [`AI_LIBRARY_OCT.md`](./AI_LIBRARY_OCT.md) |
| 附录 | Provider 系统 | [`provider-system.md`](./feature-map/provider-system.md) |
| 附录 | 已知问题 | [`99_known_issues.md`](./feature-map/99_known_issues.md) |
| 附录 | 数据流向 | [`98_data_flow.md`](./feature-map/98_data_flow.md) |

---

## 核心架构一览

### 基础设施（第一层）
- **Gateway WebSocket**：前端 ↔ AI 的桥梁
- **AI 对话引擎**：Provider 抽象，支持百炼/DeepSeek/硅基/Groq/OpenAI/Ollama 等
- **Provider 系统**：服务商预设、按模型能力动态组装、Settings 服务商选择器
- **System Prompt**：从 Nocturne + 本地 MD 文件动态加载
- **Nocturne 记忆后端**：Python FastAPI + SQLite

### 自动处理管线（第二层）
所有功能在 `onDone` 回调中异步触发，不阻塞对话：
- ✅ 对话历史保存
- 🔇 自我评估评分（已停用 2026-03-20，评分不准确）
- 🔇 模式提炼（已停用，依赖自评）
- ✅ 用户反馈检测（`memory_feedback.js:422`，2026-03-20 修复：已在 onDone 调用）
- ✅ 停车场待办检测（`index.js:424`）
- ✅ 自动记忆提炼（`index.js:431`）
- 🚧 追问偏好学习（待实现）

**文档清理**：2026-03-20 删除 4 个重复的独立文件（`feedback-detect.md` 等），合并到 `02_auto_pipeline.md`

### 关键数据流
```
用户消息 → Gateway → AI 流式回复 → onDone 回调
                                     │
                                     ├─→ 保存历史
                                     ├─→ 检测反馈
                                     ├─→ 检测待办
                                     └─→ 提炼记忆
```

---

## 状态图例

| 符号 | 含义 |
|------|------|
| ✅ | 正常运行 |
| 🔇 | 已停用 |
| ⚠️ | 有问题但可用 |
| ❌ | 失效 |
| 🚧 | 未实现/进行中 |

---

## 最近修复

### 2026-03-21 AI.library 集成（P0+P1+P2）
- **P0**：search_knowledge 工具、KnowledgeBaseAPI.search 方法、OCT 返回格式
- **P1**：config.json ai_library 配置节、从 config 读取 url/timeout/default_top_k、/status 显示 AI.library 状态
- **P2**：搜索结果 UI 美化（PDF 图标、百分比、截断）、错误提示优化、内存缓存（10 次/5 分钟）
- **文档**：更新 `AI_LIBRARY_OCT.md`、09-tools、config-system、06_commands

### 2026-03-20 停用自评系统，强化用户反馈
- **目标**：减少 API 消耗，稳定 AMY 风格
- **修改**：`index.js` 注释 selfEval 调用；`SOUL.md` 删除自动学习规则段落
- **保留**：用户反馈检测 (`memoryFeedback.detectAndSaveFeedback`) 正常运行，作为替代方案
- **验证**：发「好的」后终端应出现 `[Feedback]` 或 `[Memory] 反馈已写入`

### 2026-03-20 Provider 系统 Phase 1+2
- **目标**：市场化改造，用户选服务商 → 填 Key → 选模型 → 开聊
- **Phase 1**：providers.js 注册表、getProviderConfig、按模型能力动态组装、`/model`/`/provider` 命令
- **Phase 2**：Settings 服务商选择器、模型下拉、测试连接、保存后重启 Gateway
- **文档**：新增 `provider-system.md`，更新 ai-engine、config-system、06_commands、07_electron

### 2026-03-20 文档清理
- **问题**：自动管线 4 个模块有重复的独立文档，状态标记错误（❌ 失效）
- **修复**：删除 `feedback-detect.md`、`parking-detect.md`、`memory-extract.md`、`pattern-distill.md`，内容合并到 `02_auto_pipeline.md`
- **结果**：所有 6 个模块状态统一为 ✅，调用位置清晰记录

### 2026-03-20 BUG3 修复
- **问题**：反馈检测未在 onDone 中调用
- **修复**：在 `index.js` 的 `onDone` 回调中添加调用
- **验证**：发送「好的」后终端看到 `[Memory] 反馈已写入:`

### 2026-03-20 模式提炼修复
- **问题**：计数未持久化，重启后归零
- **修复**：计数写入文件 + 路径 fallback 逻辑

---

**📖 详细文档**：进入 [`docs/feature-map/`](./feature-map/) 查看各模块完整说明
