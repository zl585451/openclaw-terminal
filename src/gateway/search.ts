/**
 * 多引擎搜索封装 - 支持自动降级
 *
 * 支持的搜索引擎:
 * - Brave Search (首选，需要 API Key)
 * - Tavily (需要 API Key)
 * - DuckDuckGo (降级方案，无需 API Key)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

export type SearchEngine = 'auto' | 'brave' | 'duckduckgo' | 'tavily';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  success: boolean;
  engine: SearchEngine;
  query: string;
  results: SearchResult[];
  answer?: string; // Tavily 可能返回直接答案
  hint?: string;   // 提示信息
  error?: string;  // 错误信息
  fallback?: boolean; // 是否使用了降级引擎
}

export interface SearchOptions {
  query: string;
  engine?: SearchEngine;
  count?: number;
  freshness?: string; // Brave 专用: pd (过去一天), pw (过去一周), pm (过去一月)
}

export interface SearchConfig {
  braveApiKey?: string;
  tavilyApiKey?: string;
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_COUNT = 5;

// ─────────────────────────────────────────────────────────────────────────────
// 从环境变量获取配置 (Node.js 环境)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从环境变量获取搜索配置
 * 支持 BRAVE_SEARCH_API_KEY 和 BRAVE_API_KEY 两种环境变量名
 */
export function getSearchConfigFromEnv(): SearchConfig {
  // 检查是否在 Node.js 环境中
  const env = typeof process !== 'undefined' ? process.env : {};

  return {
    braveApiKey: env.BRAVE_SEARCH_API_KEY || env.BRAVE_API_KEY || '',
    tavilyApiKey: env.TAVILY_API_KEY || '',
    timeout: DEFAULT_TIMEOUT,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const prefix = `[search] ${message}`;
  if (level === 'error') {
    console.error(prefix, data || '');
  } else if (level === 'warn') {
    console.warn(prefix, data || '');
  } else {
    console.log(prefix, data || '');
  }
}

function hasValidKey(key: string | undefined): boolean {
  return !!key && key.length > 10 && !key.includes('_here') && !key.includes('your_');
}

// ─────────────────────────────────────────────────────────────────────────────
// Brave Search 实现
// ─────────────────────────────────────────────────────────────────────────────

export async function braveSearch(
  query: string,
  apiKey: string,
  options?: { count?: number; freshness?: string; timeout?: number }
): Promise<SearchResponse> {
  const count = options?.count || DEFAULT_COUNT;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  if (!hasValidKey(apiKey)) {
    return {
      success: false,
      engine: 'brave',
      query,
      results: [],
      error: 'BRAVE_SEARCH_API_KEY 未配置或无效',
    };
  }

  const params = new URLSearchParams({
    q: query,
    count: String(count),
  });

  if (options?.freshness) {
    params.set('freshness', options.freshness);
  }

  const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Brave API ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = (data.web?.results || [])
      .slice(0, count)
      .map((r: { title?: string; url?: string; description?: string }) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.description || '',
      }));

    return {
      success: true,
      engine: 'brave',
      query,
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'Brave search failed', { error: errorMessage, query });

    return {
      success: false,
      engine: 'brave',
      query,
      results: [],
      error: errorMessage,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tavily Search 实现
// ─────────────────────────────────────────────────────────────────────────────

export async function tavilySearch(
  query: string,
  apiKey: string,
  options?: { count?: number; timeout?: number }
): Promise<SearchResponse> {
  const count = options?.count || DEFAULT_COUNT;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  if (!hasValidKey(apiKey)) {
    return {
      success: false,
      engine: 'tavily',
      query,
      results: [],
      error: 'TAVILY_API_KEY 未配置或无效',
    };
  }

  const url = 'https://api.tavily.com/search';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: count,
        search_depth: 'basic',
        include_answer: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Tavily API ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = (data.results || [])
      .slice(0, count)
      .map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.content || '',
      }));

    return {
      success: true,
      engine: 'tavily',
      query,
      results,
      answer: data.answer || '',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'Tavily search failed', { error: errorMessage, query });

    return {
      success: false,
      engine: 'tavily',
      query,
      results: [],
      error: errorMessage,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DuckDuckGo Search 实现 (降级方案)
// ─────────────────────────────────────────────────────────────────────────────

export async function duckduckgoSearch(
  query: string,
  options?: { count?: number; timeout?: number }
): Promise<SearchResponse> {
  const count = options?.count || DEFAULT_COUNT;
  const timeout = options?.timeout || 8000;

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DuckDuckGo API ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = [];

    // DuckDuckGo Instant Answer
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
      });
    }

    // Related Topics
    for (const topic of (data.RelatedTopics || []).slice(0, count - results.length)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.slice(0, 60),
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        engine: 'duckduckgo',
        query,
        results: [],
        hint: 'DuckDuckGo 无即时结果（国内可能无法访问），建议使用 Brave 或 Tavily',
      };
    }

    return {
      success: true,
      engine: 'duckduckgo',
      query,
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'DuckDuckGo search failed', { error: errorMessage, query });

    return {
      success: false,
      engine: 'duckduckgo',
      query,
      results: [],
      error: errorMessage,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 统一入口 - 支持自动降级
// ─────────────────────────────────────────────────────────────────────────────

export async function web_search(
  options: SearchOptions,
  config?: SearchConfig
): Promise<SearchResponse> {
  const { query, engine = 'auto', count = DEFAULT_COUNT, freshness } = options;
  const braveKey = config?.braveApiKey || '';
  const tavilyKey = config?.tavilyApiKey || '';
  const timeout = config?.timeout || DEFAULT_TIMEOUT;

  // 确定使用的引擎
  let useEngine: SearchEngine = engine;

  if (engine === 'auto') {
    // auto 模式：按优先级选择可用引擎
    if (hasValidKey(braveKey)) {
      useEngine = 'brave';
    } else if (hasValidKey(tavilyKey)) {
      useEngine = 'tavily';
    } else {
      useEngine = 'duckduckgo';
    }
  }

  // 显式指定引擎但没有 Key
  if (useEngine === 'brave' && !hasValidKey(braveKey)) {
    return {
      success: false,
      engine: 'brave',
      query,
      results: [],
      error: 'BRAVE_SEARCH_API_KEY 未配置，请在 .env 中填入',
    };
  }

  if (useEngine === 'tavily' && !hasValidKey(tavilyKey)) {
    return {
      success: false,
      engine: 'tavily',
      query,
      results: [],
      error: 'TAVILY_API_KEY 未配置，请在 .env 中填入',
    };
  }

  // 执行搜索
  const searchOptions = { count, freshness, timeout };

  if (useEngine === 'brave') {
    const result = await braveSearch(query, braveKey, searchOptions);

    // Brave 失败时自动降级到 DuckDuckGo
    if (!result.success && engine === 'auto') {
      log('warn', 'Brave search failed, falling back to DuckDuckGo', { query });
      const fallbackResult = await duckduckgoSearch(query, searchOptions);
      return { ...fallbackResult, fallback: true };
    }

    return result;
  }

  if (useEngine === 'tavily') {
    const result = await tavilySearch(query, tavilyKey, searchOptions);

    // Tavily 失败时自动降级到 DuckDuckGo
    if (!result.success && engine === 'auto') {
      log('warn', 'Tavily search failed, falling back to DuckDuckGo', { query });
      const fallbackResult = await duckduckgoSearch(query, searchOptions);
      return { ...fallbackResult, fallback: true };
    }

    return result;
  }

  return duckduckgoSearch(query, searchOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// 便捷方法
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建预配置的搜索实例
 */
export function createSearch(config: SearchConfig) {
  return {
    search: (options: Omit<SearchOptions, 'engine'>) =>
      web_search({ ...options, engine: 'auto' }, config),

    braveSearch: (query: string, count?: number) =>
      braveSearch(query, config.braveApiKey || '', { count, timeout: config.timeout }),

    tavilySearch: (query: string, count?: number) =>
      tavilySearch(query, config.tavilyApiKey || '', { count, timeout: config.timeout }),

    duckduckgoSearch: (query: string, count?: number) =>
      duckduckgoSearch(query, { count, timeout: config.timeout }),
  };
}

// 默认导出
export default {
  web_search,
  braveSearch,
  tavilySearch,
  duckduckgoSearch,
  createSearch,
  getSearchConfigFromEnv,
};