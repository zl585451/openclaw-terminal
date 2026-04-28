# 第九层：工具系统

---

## 9.1 内置工具

|| 项目 | 内容 |
||------|------|
|| 做什么 | web_search、web_fetch、read_file、write_file、exec_command、**search_knowledge**（AI.library 知识检索） |
|| 文件 | `oct-gateway/tools.js`、`oct-gateway/tools/ai_library.js`、`src/gateway/search.ts`（TypeScript 封装） |
|| 调用链 | AI 返回 tool_calls → ai.js executeTool() → tools.js 执行 → 结果返回 AI 继续生成 |
|| 状态 | ✅ 正常 |

### web_search（多引擎搜索）

|| 项目 | 内容 |
||------|------|
|| 触发 | AI 需要获取最新信息时自动调用 |
|| 参数 | `query`（必填）、`engine`（auto/brave/duckduckgo/tavily）、`count`、`freshness`（仅 Brave） |
|| 返回 | `{ success, engine, query, results: [{title, url, snippet}], answer?, fallback?, hint? }` |
|| 特性 | **自动降级**：Brave/Tavily 失败时自动切换 DuckDuckGo |

#### 搜索引擎优先级

| 引擎 | 优先级 | API Key 环境变量 | 特点 |
|------|--------|------------------|------|
| **Brave** | 首选 | `BRAVE_SEARCH_API_KEY` / `BRAVE_API_KEY` | 高质量结果，支持 freshness 参数 |
| **Tavily** | 次选 | `TAVILY_API_KEY` | 返回直接答案 answer 字段 |
| **DuckDuckGo** | 降级 | 无需 Key | 即时答案 API，国内可能无法访问 |

#### 返回格式

```typescript
interface SearchResponse {
  success: boolean;
  engine: 'brave' | 'tavily' | 'duckduckgo';
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  answer?: string;    // Tavily 返回的直接答案
  fallback?: boolean; // 是否使用了降级引擎
  hint?: string;      // 提示信息
}
```

#### TypeScript 封装

```typescript
import { web_search, createSearch, getSearchConfigFromEnv } from '@/gateway/search';

// 使用环境变量配置
const config = getSearchConfigFromEnv();
const result = await web_search({ query: '搜索关键词' }, config);

// 或创建预配置实例
const searcher = createSearch({ braveApiKey: 'xxx' });
const result = await searcher.search({ query: '关键词' });
```

---

### search_knowledge（AI.library）

> 2026-04-28: The default client now ships the project library core as a native Electron service. Professional audio RAG search is disabled by default and is no longer part of the default packaged client.

|| 项目 | 内容 |
||------|------|
|| 触发 | 用户询问音频/混音/母带/录音/声学等专业问题时，模型自动调用 |
|| 参数 | `query`（必填）、`top_k`（可选，默认 3） |
|| 返回 | `{ success, results, formatted, hint? }`，含 PDF 图标、相似度百分比、截断预览 |
|| 缓存 | 内存缓存 10 次查询，5 分钟 TTL |

---

## 9.2 权限检查

|| 项目 | 内容 |
||------|------|
|| 做什么 | 检测危险命令（rm -rf、格式化、注册表修改等） |
|| 文件 | `src/utils/permissionCheck.ts` |
|| 状态 | ✅ 正常 |

### Agent 硬权限（2026-04-19）

- 新增网关侧强制权限拦截：`oct-gateway/tool_loader.js` 在每次 `executeTool` 前执行 `enforceAgentPermission`。
- 权限来源：`config.json` 的 `AGENT_PERMISSIONS`（由设置面板“高级 → Agent 权限”写入）。
- 布尔归一化：`oct-gateway/config.js` 的 `normalizeAgentPermissions` 为唯一实现；`oct-gateway/security/agent_permissions_policy.js` 与 Electron `get/save-agent-permissions` IPC 复用该实现，避免多处漂移。
- 作用范围：内置工具与 MCP 动态工具统一生效（不再仅是前端文本层提示）。
- `exec_command` 额外做命令级判定：安装类、系统配置类、网络访问类、文件写入类分别受对应开关控制。
- 新增“未知 MCP 工具严格拒绝”策略（默认开启）：当任一权限开关为关闭状态时，无法识别风险能力的 MCP 工具默认拒绝，防止改名/伪装工具绕过。

### 工具超时策略（2026-04-17）

- `tool_loader` 支持每个工具声明 `timeoutMs` 元数据。
- `toolLoop` 执行时优先读取工具级超时；未声明时默认 30 秒。
- 已示例配置：`web_search` / `web_fetch`（45s）、`exec_command`（60s）。
- 目的：避免“大仓库检索/慢网络请求”被固定 30s 误判失败。

---

## 9.3 MCP 外部工具（file_ops）

|| 项目 | 内容 |
||------|------|
|| 服务名 | `file_ops` |
|| 配置位置 | `oct-gateway/config.json` → `mcpServers.file_ops` |
|| 进程入口 | `oct-gateway/mcp-servers/oct-file-ops/src/index.js` |
|| 工具前缀 | `mcp_file_ops_*` |
|| 已暴露工具 | `mcp_file_ops_file_list`、`mcp_file_ops_file_move`、`mcp_file_ops_file_rename`、`mcp_file_ops_file_delete` |
|| 说明 | 该工具组由独立 MCP 进程提供，通过 `mcp/manager.js` 动态注册到 `tool_loader`，不占用 `tools/*.js` 内置工具目录 |
|| 权限开关 | `mcpServers.file_ops.env.OCT_FILE_OPS_UNSAFE_ALLOW_ALL`：`0` 白名单模式（默认），`1` 全盘访问（高风险） |
