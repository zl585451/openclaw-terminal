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