# OCT 工具规范化方案 v1（oct-gateway）

本文描述 **网关工具层**（`oct-gateway/tools/`）在第一轮规范化中的约定，便于分类、排障与后续扩展。v1 仅约束元数据与推荐返回形状，**不要求**一次性改写所有工具。

---

## 1. 为什么要做工具规范化

- **分类清晰**：按 `category` 区分项目内读写、网络、记忆、任务等，日志与文档可读性更好。
- **风险可见**：`riskLevel` 标明工具的安全边界，便于审计与后续 UI/策略（例如高危确认）。
- **返回一致**：统一 `success` / `data` / `error` / `hint` 后，模型与排障更容易解析；同时通过顶层兼容字段保留旧行为。
- **渐进落地**：旧工具可无元数据、可保持历史返回字段；ToolLoader 对缺字段使用默认值，**不得**因缺元数据报错。

---

## 2. 工具可选元数据（v1）

每个工具模块可在 `module.exports` 上导出以下**可选**字段（与 `name` / `definition` / `execute` 并列）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | 字符串 | 见下表枚举；非法或缺失时由 ToolLoader 视为 `misc` |
| `riskLevel` | 字符串 | 见下表枚举；非法或缺失时视为 `safe` |
| `displayName` | 字符串 | 中文展示名，供日志/UI；缺失时为 `name` |

### 2.1 `category` 取值

| 值 | 含义 |
|----|------|
| `project` | 项目内文件、目录、代码检索等 |
| `web` | 网络请求、搜索、抓取 |
| `memory` | 长期记忆、检索、写入记忆服务 |
| `task` | 任务板、队列、异步任务 |
| `system` | 系统/环境/进程级能力（v1 尽量少用） |
| `misc` | 未分类或其它 |

### 2.2 `riskLevel` 取值

| 值 | 含义 |
|----|------|
| `safe` | 只读或影响范围明确、默认不易造成数据丢失 |
| `guarded` | 写文件、外网访问等需用户或模型谨慎使用 |
| `dangerous` | 可能执行任意命令、删改关键数据等（v1 不新增此类系统工具） |

### 2.3 ToolLoader 行为

- 加载时读取上述字段；缺失则用默认值：`category: 'misc'`、`riskLevel: 'safe'`、`displayName: tool.name`。
- 日志示例：`[ToolLoader] 已加载工具: read_file (project/safe)`。
- 以下文件**不**作为工具加载：`shared.js`、`ai_library.js`、`command_converter.js`。

---

## 3. 统一返回结构（推荐）

高频工具推荐采用以下形状；**失败时** `data` 应为 `null`。

**成功：**

```json
{
  "success": true,
  "data": { },
  "error": null,
  "hint": null
}
```

**失败：**

```json
{
  "success": false,
  "data": null,
  "error": "错误信息",
  "hint": "给模型/用户的下一步提示"
}
```

说明：

- 核心业务字段（如 `content`、`results`、`message`、`path`）应放入 `data`。
- 若历史调用方依赖**顶层**字段，可同时保留顶层同名字段，与 `data` 内字段一致，避免破坏兼容。

---

## 4. 兼容策略

1. **旧工具**：可无 `category` / `riskLevel` / `displayName`；ToolLoader 仅打默认日志，不抛错。
2. **旧返回格式**：若已有 `success` + 扁平字段，新增 `data` / `error` / `hint` 时，保留原顶层字段。
3. **软成功**：例如搜索无结果但 `success: true` 且需提示配置 API——历史上顶层可能有 `hint`；v1 允许在 `data` 内重复 `hint`，并保留顶层 `hint`（与「成功体 `hint: null`」理想形态折中，优先兼容）。
4. **抛出异常**：工具内部仍应避免未捕获异常；宜转为上述失败对象（`write_file`、`web_fetch` 等已包 try/catch）。

---

## 5. 本轮已对齐的工具清单

| 工具 | category | riskLevel | 返回结构 |
|------|----------|-----------|----------|
| `read_file` | `project` | `safe` | 已加 `data` + 顶层 `path`/`content` |
| `write_file` | `project` | `guarded` | 已加 `data` + 顶层 `message`/`path`；错误统一为对象 |
| `web_search` | `web` | `guarded` | 已加 `data` + 顶层 `engine`/`query`/`results` 等 |
| `web_fetch` | `web` | `guarded` | 已加 `data` + 顶层 `content`/`status`/`cached`/`url` |

其它工具可在后续迭代中按需补齐元数据与返回形状，无需与本轮同步。

### 5.1 返修与行为说明（人工验收后）

- **`web_search`**：`enrichResults` 已按**原始结果下标**做网页摘要增强，修复了先前 `filter`/`slice` 后再用原数组索引回写导致的 **excerpt/snippet 错位**问题。
- **`write_file`**：路径规则已与 **`read_file` 对齐**——默认仅允许写入项目根目录内；支持相对项目根的路径，禁止写到项目外；越界与空路径返回结构化错误（不抛异常）。
- **`web_fetch`**：URL 已限制为 **仅 `http:` / `https:`**；`file:`、`javascript:`、空串及非法格式等直接返回结构化错误。

---

## 6. 后续 v2 可做事情（建议）

- 抽象 `system_*` 命名空间或独立注册表，与「项目/用户工具」隔离。
- 在 orchestrator / HTTP `/tool` 层按 `riskLevel` 做策略（确认、限流、审计日志）。
- 为 MCP 动态工具补充元数据约定（或与静态工具对齐的默认映射）。
- 前端（非 v1 范围）按 `displayName` 展示工具卡片。

---

## 7. 相关代码

- `oct-gateway/tool_loader.js` — 元数据默认值与加载日志
- `oct-gateway/tools/*.js` — 各工具实现
