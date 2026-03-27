# OpenClaw Terminal - Feature Map

> 最后更新：2026-03-22 by AMY  
> 版本：v0.3.3

---

## 📊 功能状态总览

|| 模块 | 功能 | 状态 | 备注 |
||------|------|------|------|
|| **AMemory** | 记忆写入 | ✅ 完成 | 三层 fallback 保护 |
|| **AMemory** | 记忆读取 | ✅ 完成 | readMemoryWithFallback 覆盖 |
|| **AMemory** | 记忆搜索 | ✅ 完成 | 支持模糊匹配 |
|| **AMemory** | 记忆历史 | ✅ 完成 | 保留最近 10 条 |
|| **AMemory** | 反馈记录 | ✅ 完成 | 用户反馈持久化 |
|| **TaskBoard** | 任务添加 | ✅ 完成 | 支持 P0/P1/P2 优先级 |
|| **TaskBoard** | 任务更新 | ✅ 完成 | 状态/内容/优先级 |
|| **TaskBoard** | 任务删除 | ✅ 完成 | 按标题/ID 匹配 |
|| **TaskBoard** | 任务列表 | ✅ 完成 | 含停车场内容 |
|| **Parking** | 备忘添加 | ✅ 完成 | 待处理事项 |
|| **Search** | 多引擎搜索 | ✅ 完成 | Brave/Tavily/DuckDuckGo 自动降级 |
|| **ClawX** | 备份推送 | ⏳ 待开发 | 优先级 P2 |
|| **UI** | Markdown 渲染 | ⏳ 修复中 | BUG4 表格错乱 |
|| **UI** | 图片分析 | ✅ 完成 | 本地 + 云端双模式 |
|| **Session** | 会话管理 | ✅ 完成 | 上下文保持 |
|| **Logger** | 日志分级 | ✅ 完成 | info/warn/error |
|| **AutoPipeline** | 模式提炼 | ✅ 已调用 | self_eval.js:429 maybeDistill() |
|| **AutoPipeline** | 反馈检测 | ✅ 已调用 | memory_feedback.js:422 |
|| **AutoPipeline** | 停车场检测 | ✅ 已调用 | index.js:424 detectAndSaveParking() |
|| **AutoPipeline** | 记忆提炼 | ✅ 已调用 | index.js:431 extractAndSaveMemory() |

---

## 🔧 核心模块详情

### 1. AMemory (记忆系统)

#### BUG3 修复记录 - 三层 fallback 机制
```
writeMemory() 
  → createMemory() [Layer 1: 首选写入]
  → writeMemory() [Layer 2: fallback 重试]
  → logger.warn() [Layer 3: 保底日志记录]
```

#### 读取链路 (已修复 BUG3)
```
readMemoryWithFallback()
  → readMemory() [Layer 1: 正常读取]
  → logger.info() [Layer 2: 404 静默处理]
  → 返回 null/默认值 [Layer 3: 安全返回值]
```

#### 覆盖范围
- `clarification_memory.js`: 3 处调用
- `memory_search.js`: 5 处调用
- `self_eval.js`: 2 处调用
- `session.js`: 3 处调用
- `tools.js`: 2 处调用
- **总计**: 15+ 调用点全部覆盖

#### 最新优化 (v0.3.2)
- 2026-03-20: 确认自动管线 4 个模块全部正常调用，更新文档反映真实情况。

---

### 2. TaskBoard (任务看板)

#### 数据结构
```json
{
  "tasks": [
    { "id": "xxx", "title": "...", "priority": "P0", "done": false }
  ],
  "parking": [
    { "content": "...", "created_at": "..." }
  ],
  "intention": "..."
}
```

#### API
- `tasks_read()`: 读取全部
- `tasks_add(content, priority)`: 添加任务
- `tasks_update(taskId, done/content/priority)`: 更新
- `tasks_delete(taskId)`: 删除
- `parking_add(content)`: 添加备忘

---

### 3. Search (多引擎搜索) - ✅ 新增

#### 支持的搜索引擎

| 引擎 | 优先级 | API Key 环境变量 | 特点 |
|------|--------|------------------|------|
| **Brave** | 首选 | `BRAVE_SEARCH_API_KEY` / `BRAVE_API_KEY` | 高质量结果，支持 freshness 参数 |
| **Tavily** | 次选 | `TAVILY_API_KEY` | 返回直接答案 answer 字段 |
| **DuckDuckGo** | 降级 | 无需 Key | 即时答案 API，国内可能无法访问 |

#### 自动降级机制
```
web_search(engine='auto')
  → Brave (首选)
  → 失败时自动降级 DuckDuckGo
  → 返回 fallback: true 标识
```

#### TypeScript 封装
- 文件: `src/gateway/search.ts`
- 导出: `web_search`, `braveSearch`, `tavilySearch`, `duckduckgoSearch`, `createSearch`, `getSearchConfigFromEnv`

---

### 4. AutoPipeline (自动管线) - ✅ 全部工作

#### 调用位置确认

|| 模块 | 文件位置 | 调用行号 | 函数名 |
||------|---------|---------|--------|
|| 反馈检测 | oct-gateway/memory_feedback.js | 422 | detectAndSaveFeedback() |
|| 停车场检测 | oct-gateway/index.js | 424 | detectAndSaveParking() |
|| 记忆提炼 | oct-gateway/index.js | 431 | extractAndSaveMemory() |
|| 模式提炼 | oct-gateway/self_eval.js | 429 | maybeDistill() |

#### 工作流程
```
每轮对话结束
  → detectAndSaveFeedback() [检测用户反馈]
  → detectAndSaveParking() [检测停车场事项]
  → extractAndSaveMemory() [提炼记忆]
  → maybeDistill() [提炼模式]
```

**状态**: 4 个模块全部正常工作，无需修复！✅

---

### 5. Logger (日志系统)

#### 分级策略
|| 级别 | 触发条件 | 输出位置 |
||------|---------|---------|
|| **info** | 正常操作、404 静默 | 控制台 |
|| **warn** | 可恢复异常、fallback 触发 | 控制台 + 文件 |
|| **error** | 严重错误、系统崩溃 | 控制台 + 文件 + 告警 |

#### BUG3 修复后变化
- ❌ 之前：404 → `logger.warn()` (误报)
- ✅ 现在：404 → `logger.info()` (正常)
- ✅ 现在：真实异常 → `logger.warn()` (准确)

---

## 🐛 已知问题 (Bug List)

|| ID | 问题描述 | 优先级 | 状态 | 修复方案 |
||----|---------|--------|------|---------|
|| BUG1 | 系统启动时内存泄漏 | P0 | ⏳ 待修 | 检查初始化流程 |
|| BUG2 | 高并发下任务冲突 | P0 | ⏳ 待修 | 添加锁机制 |
|| BUG3 | AMemory 写入/读取 404 误报 | P0 | ✅ 已修复 | 三层 fallback + 日志分级 |
|| BUG4 | Markdown 表格渲染错乱 | P1 | ⏳ 待修 | 检查 markdown-it 配置 |
|| BUG5 | ClawX 备份推送未实现 | P2 | ⏳ 待开发 | 集成推送服务 |
|| BUG6 | 图片分析超时处理 | P1 | ⏳ 待修 | 添加超时机制 |
|| BUG7 | 记忆搜索性能瓶颈 | P2 | ⏳ 待优化 | 优化算法 |
|| BUG8 | 会话恢复数据丢失 | P1 | ⏳ 待修 | 加强持久化 |
|| BUG9 | 自评估模块不准确 | P2 | ⏳ 待优化 | 调整评估标准 |

**已知问题总计：9 个** (1-2 致命，3-8 中等，9 低)

---

## 📋 待办事项 (TODO)

### P0 - 紧急
- [ ] BUG1: 修复系统启动内存泄漏
- [ ] BUG2: 解决高并发任务冲突
- [x] 强制检查点：更新 FEATURE_MAP.md (✅ 已完成)
- [x] 确认自动管线 4 模块调用状态 (✅ 已确认)

### P1 - 重要
- [ ] BUG4: 修复 Markdown 表格渲染
- [ ] BUG6: 添加图片分析超时处理
- [ ] BUG8: 修复会话恢复数据丢失
- [ ] 完善自评估模块 (self_eval.js)

### P2 - 普通
- [ ] BUG5: 实现 ClawX 备份推送
- [ ] BUG7: 优化记忆搜索算法
- [ ] BUG9: 优化自评估模块准确性
- [ ] 添加单元测试覆盖

---

## 📈 版本历史

|| 版本 | 日期 | 主要变更 |
||------|------|---------|
|| v0.3.3 | 2026-03-22 | 新增多引擎搜索封装，支持 Brave/Tavily/DuckDuckGo 自动降级 |
|| v0.3.2 | 2026-03-20 | 确认自动管线 4 模块全部正常调用，更新文档 |
|| v0.3.1 | 2026-03-20 | 记忆模块文件优化，缓存清理机制验证 |
|| v0.3.0 | 2026-03-19 | BUG3 修复完成，三层 fallback 上线 |
|| v0.2.0 | 2025-01-05 | 任务看板 + 停车场功能 |
|| v0.1.0 | 2025-01-01 | 初始版本，基础记忆系统 |

---

## 🔗 相关文档

- [README.md](./README.md) - 项目介绍
- [task-board.md](./task-board.md) - 任务看板使用说明
- [TODO_clarification_memory.md](./TODO_clarification_memory.md) - 澄清记忆待办

---

> **维护者**: OpenClaw Team  
> **联系**: 通过终端直接反馈