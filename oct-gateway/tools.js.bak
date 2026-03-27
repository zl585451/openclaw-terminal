const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const memory = require('./memory');
const memoryHistory = require('./memory_history');
const memorySearch = require('./memory_search');
const os = require('os');
const { createLogger } = require('./logger');
const log = createLogger('tools');
const aiLibrary = require('./tools/ai_library');
const config = require('./config');

// ============================================================
// 本地任务存储路径（与 Electron userData 保持一致）
// OPENCLAW_TASKS_PATH 由 Electron 传入，确保 Gateway 与渲染进程读写同一文件
// ============================================================
function getTasksFilePath() {
  const tasksFilePath = process.env.OPENCLAW_TASKS_PATH ||
    (process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'openclaw-terminal', 'tasks.json')
      : path.join(os.homedir(), '.config', 'openclaw-terminal', 'tasks.json'));
  return tasksFilePath;
}
const TASKS_FILE_PATH = getTasksFilePath();
log.info('TASKS_FILE_PATH', { path: TASKS_FILE_PATH });

let onTaskBoardUpdate = null;
function setOnTaskBoardUpdate(fn) {
  onTaskBoardUpdate = fn;
}

function loadTasksData() {
  try {
    if (fs.existsSync(TASKS_FILE_PATH)) {
      const content = fs.readFileSync(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);
      return {
        tasks: data.tasks || [],
        parking: data.parking || [],
        intention: data.intention || '',
        updatedAt: data.updatedAt || '',
      };
    }
  } catch (e) {
    log.error('tasks load failed', { error: e?.message || String(e) });
  }
  return { tasks: [], parking: [], intention: '', updatedAt: '' };
}

function saveTasksData(data) {
  try {
    data.updatedAt = new Date().toISOString();
    const dir = path.dirname(TASKS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log.error('tasks save failed', { error: e?.message || String(e) });
    return false;
  }
}

// ============================================================
// memory_write 队列机制 & 超时保护
// ============================================================
const WRITE_QUEUE = [];
let isProcessingQueue = false;
const WRITE_TIMEOUT_MS = 5000;
const WRITE_DELAY_MS = 200;

/**
 * 带超时的写入操作
 * @param {string} uri
 * @param {string} content
 * @param {number} priority
 * @param {string} disclosure
 * @returns {Promise<{ok: boolean, data?: any, error?: string, created?: boolean, updated?: boolean}>}
 */
async function writeWithTimeout(uri, content, priority, disclosure) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log.error('memory_write timeout', { uri, timeoutMs: WRITE_TIMEOUT_MS });
      resolve({ ok: false, error: `写入超时 (${WRITE_TIMEOUT_MS}ms)` });
    }, WRITE_TIMEOUT_MS);

    (async () => {
      try {
        const m = uri.match(/^([^:]+):\/\/(.+)$/);
        if (!m) {
          clearTimeout(timer);
          resolve({ ok: false, error: `无效 URI: ${uri}` });
          return;
        }
        const [, domain, pathPart] = m;

        // 检查是否存在
        const exists = await memory.readMemory(uri, { treat404AsDebug: true });
        if (exists.ok && exists.data) {
          const r = await memory.writeMemory(uri, content, priority, disclosure);
          clearTimeout(timer);
          resolve({ ...r, updated: r.ok });
        } else {
          await memoryHistory.ensurePathExists(domain, pathPart);
          const r = await memory.createMemory(uri, content, priority, disclosure);
          clearTimeout(timer);
          resolve({ ...r, created: r.ok });
        }
      } catch (e) {
        clearTimeout(timer);
        log.error('memory_write exception', { uri, error: e?.message || String(e) });
        resolve({ ok: false, error: e?.message || String(e) });
      }
    })();
  });
}

/**
 * 处理队列中的写入任务
 */
async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (WRITE_QUEUE.length > 0) {
    const task = WRITE_QUEUE.shift();
    log.debug('memory_write process', { uri: task.uri, remaining: WRITE_QUEUE.length });

    try {
      const result = await writeWithTimeout(task.uri, task.content, task.priority, task.disclosure);
      if (result.ok) {
        memorySearch.invalidateGlossaryCache();
        task.resolve({ success: true, created: result.created, updated: result.updated });
      } else {
        log.error('memory_write failed', { uri: task.uri, error: result.error });
        task.resolve({ success: false, error: result.error });
      }
    } catch (e) {
      log.error('memory_write task exception', { uri: task.uri, error: e?.message || String(e) });
      task.resolve({ success: false, error: e?.message || String(e) });
    }

    // 每条写入完成后等待 200ms
    if (WRITE_QUEUE.length > 0) {
      await new Promise(r => setTimeout(r, WRITE_DELAY_MS));
    }
  }

  isProcessingQueue = false;
}

/**
 * 将 memory_write 任务加入队列
 * @param {string} uri
 * @param {string} content
 * @param {number} priority
 * @param {string} disclosure
 * @returns {Promise<{success: boolean, created?: boolean, updated?: boolean, error?: string}>}
 */
function enqueueWrite(uri, content, priority, disclosure) {
  return new Promise((resolve) => {
    WRITE_QUEUE.push({ uri, content, priority, disclosure, resolve });
    log.debug('memory_write enqueue', { uri, queueLen: WRITE_QUEUE.length });
    processQueue();
  });
}

// Node.js native fetch 不走系统代理，需要手动配置
let proxyDispatcher = null;
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
  try {
    const { ProxyAgent } = require('undici');
    proxyDispatcher = new ProxyAgent(proxyUrl);
    log.info('proxy enabled', { proxyUrl });
  } catch (e) {
    log.warn('ProxyAgent not available, proxy disabled', { error: e?.message || String(e) });
  }
}

function proxyFetch(url, options = {}) {
  if (proxyDispatcher && !options.dispatcher) {
    return fetch(url, { ...options, dispatcher: proxyDispatcher });
  }
  return fetch(url, options);
}

// web_fetch 结果缓存（5 分钟 TTL，最多 100 条）
const fetchCache = new Map();
const FETCH_CACHE_TTL = Number(process.env.OCT_FETCH_CACHE_TTL_MS || 5 * 60 * 1000);
const FETCH_CACHE_MAX = Number(process.env.OCT_FETCH_CACHE_MAX || 100);
const MAX_CACHED_CONTENT_SIZE = Number(process.env.OCT_FETCH_CACHE_MAX_CHARS || 4000); // 从 8000 降到 4000，减少内存占用

// ═══════════════════════════════════════════════════════════════
// fetch 缓存主动清理优化
// ═══════════════════════════════════════════════════════════════
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = Number(process.env.OCT_FETCH_CACHE_CLEANUP_INTERVAL_MS || 60_000); // 每分钟清理一次

function cleanupFetchCache() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  let cleaned = 0;
  for (const [key, val] of fetchCache) {
    if (now - val.timestamp > FETCH_CACHE_TTL) {
      fetchCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug('fetch cache cleaned', { cleaned });
  }
}

// 兜底：即使短期没有 web_fetch 也会按间隔清理一次
setInterval(() => cleanupFetchCache(), Math.max(5_000, CLEANUP_INTERVAL)).unref?.();

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
          content: { type: 'string', description: '写入内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exec_command',
      description: '执行 shell 命令，返回输出结果',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录（可选）' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网内容，返回相关结果摘要。优先使用此工具获取最新信息。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          engine: { type: 'string', description: '搜索引擎：auto/brave/duckduckgo/tavily，默认 auto（自动降级）', enum: ['auto', 'brave', 'duckduckgo', 'tavily'] },
          count: { type: 'number', description: '返回结果数量，默认 5' },
          freshness: { type: 'string', description: '时间范围（仅 Brave）：pd(过去一天)/pw(过去一周)/pm(过去一月)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取指定 URL 的网页内容，适合已知链接的详细阅读',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要获取的完整 URL' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: '读取 Nocturne 记忆节点，支持 core://xxx/yyy 或 system://boot',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '记忆 URI，如 core://agent/identity' },
        },
        required: ['uri'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'time_inject',
      description: '注入当前时间信息到指定记忆节点或任务中',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '目标 URI 或任务标题' },
          format: { type: 'string', description: '时间格式，默认 ISO', enum: ['iso', 'locale', 'unix', 'custom'] },
          customFormat: { type: 'string', description: '自定义格式（当 format 为 custom 时使用）' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: '写入或更新 Nocturne 记忆节点',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '记忆 URI' },
          content: { type: 'string', description: '记忆内容' },
          priority: { type: 'number', description: '优先级 0-2，0 最高' },
          disclosure: { type: 'string', description: '触发条件描述' },
        },
        required: ['uri', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description: '按关键词搜索 Nocturne 记忆（支持模糊匹配，用户提到邮箱/项目/钱包等时可自动调用）',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          domain: { type: 'string', description: '限定域，如 core（可选）' },
          limit: { type: 'number', description: '返回条数，默认 10' },
        },
        required: ['query'],
      },
    },
  },
  // ── 本地任务存储工具（脱离 Nocturne）──
  {
    type: 'function',
    function: {
      name: 'tasks_read',
      description: '读取本地任务看板数据（tasks + parking + intention），AI 通过此工具查看当前任务列表',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tasks_add',
      description: '添加新任务到任务看板',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '任务内容' },
          priority: { type: 'string', description: '优先级: p0(紧急), p1(重要), p2(普通)', enum: ['p0', 'p1', 'p2'] },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tasks_update',
      description: '更新任务状态（完成/未完成/内容/优先级）',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
          done: { type: 'boolean', description: '是否完成' },
          content: { type: 'string', description: '新内容（可选）' },
          priority: { type: 'string', description: '新优先级（可选）', enum: ['p0', 'p1', 'p2'] },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tasks_delete',
      description: '删除指定任务',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'parking_add',
      description: '添加项目到停车场（待后续处理的备忘事项）',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '备忘内容' },
        },
        required: ['content'],
      },
    },
  },
  // ── AI 任务看板工具（按 title 操作，直接读写 userData/tasks.json）──
  {
    type: 'function',
    function: {
      name: 'task_add',
      description: '添加任务到任务看板',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          priority: { type: 'string', description: '优先级', enum: ['P0', 'P1', 'P2', ''] },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_done',
      description: '将指定任务标记为完成（按标题匹配）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_delete',
      description: '删除指定任务（按标题匹配）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_list',
      description: '列出所有任务和停车场内容',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ── AI.library 知识库检索工具 ──
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '搜索音频专业知识库（AI.library），返回相关文档片段。当用户询问音频/声音/混音/母带/录音/声学等专业问题时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题' },
          top_k: { type: 'number', description: '返回结果数量，默认 3' },
        },
        required: ['query'],
      },
    },
  },
];

async function executeTool(name, args) {
  try {
    switch (name) {
      case 'read_file': {
        const content = fs.readFileSync(args.path, 'utf-8');
        return { success: true, content: content.slice(0, 10000) };
      }
      case 'write_file': {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(args.path, args.content, 'utf-8');
        return { success: true, message: `已写入 ${args.path}` };
      }
      case 'exec_command': {
        // 在 Windows 上，先设置控制台编码为 UTF-8，解决中文路径问题
        const isWindows = process.platform === 'win32';
        const command = isWindows
          ? `chcp 65001 >nul && ${args.command}`
          : args.command;
        const output = execSync(command, {
          cwd: args.cwd || process.cwd(),
          encoding: 'utf-8',
          timeout: 30000,
          windowsHide: true,
          shell: true,
        });
        return { success: true, output: output.slice(0, 5000) };
      }
      case 'web_search': {
        const query = args.query;
        const engine = args.engine || 'auto';
        const count = args.count || 5;
        const freshness = args.freshness;
        // 从 config 读取搜索引擎 Key（config.json 优先，与主进程保存一致）
        const braveKey = config.BRAVE_SEARCH_API_KEY || '';
        const tavilyKey = config.TAVILY_API_KEY || '';

        // 辅助函数：执行 DuckDuckGo 搜索
        const doDuckDuckGo = async (q, cnt) => {
          const res = await proxyFetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) throw new Error(`DDG API ${res.status}`);
          const data = await res.json();
          const results = [];
          if (data.AbstractText) {
            results.push({ title: data.Heading || q, url: data.AbstractURL || '', snippet: data.AbstractText });
          }
          for (const t of (data.RelatedTopics || []).slice(0, cnt - 1)) {
            if (t.Text && t.FirstURL) {
              results.push({ title: t.Text.slice(0, 60), url: t.FirstURL, snippet: t.Text });
            }
          }
          return results;
        };

        // auto 优先级：Brave (首选) → Tavily → DuckDuckGo (降级)
        const useEngine = engine === 'auto'
          ? (braveKey ? 'brave' : (tavilyKey ? 'tavily' : 'duckduckgo'))
          : engine;

        // 显式指定引擎但没有 Key 时，直接报错
        if (useEngine === 'brave' && !braveKey) {
          return { success: false, error: 'BRAVE_SEARCH_API_KEY 未配置，请在 .env 中填入' };
        }
        if (useEngine === 'tavily' && !tavilyKey) {
          return { success: false, error: 'TAVILY_API_KEY 未配置，请在 .env 中填入' };
        }

        if (useEngine === 'brave') {
          try {
            const params = new URLSearchParams({ q: query, count: String(count) });
            if (freshness) params.set('freshness', freshness);
            const res = await proxyFetch(
              `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
              {
                headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey },
                signal: AbortSignal.timeout(10000),
              }
            );
            if (!res.ok) throw new Error(`Brave API ${res.status}`);
            const data = await res.json();
            const results = (data.web?.results || []).slice(0, count).map(r => ({
              title: r.title, url: r.url, snippet: r.description || '',
            }));
            return { success: true, engine: 'brave', query, results };
          } catch (braveErr) {
            // 自动降级到 DuckDuckGo
            if (engine === 'auto') {
              log.warn('Brave search failed, falling back to DuckDuckGo', { query, error: braveErr?.message });
              try {
                const results = await doDuckDuckGo(query, count);
                if (results.length === 0) {
                  return { success: true, engine: 'duckduckgo', query, results: [], fallback: true, hint: 'DuckDuckGo 无即时结果（国内可能无法访问），建议配置 Brave 或 Tavily' };
                }
                return { success: true, engine: 'duckduckgo', query, results, fallback: true };
              } catch (ddgErr) {
                return { success: false, error: `Brave 失败: ${braveErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}` };
              }
            }
            throw braveErr;
          }

        } else if (useEngine === 'tavily') {
          try {
            const res = await proxyFetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key: tavilyKey, query, max_results: count,
                search_depth: 'basic', include_answer: true,
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) throw new Error(`Tavily API ${res.status}`);
            const data = await res.json();
            const results = (data.results || []).slice(0, count).map(r => ({
              title: r.title, url: r.url, snippet: r.content || '',
            }));
            return { success: true, engine: 'tavily', query, answer: data.answer || '', results };
          } catch (tavilyErr) {
            // 自动降级到 DuckDuckGo
            if (engine === 'auto') {
              log.warn('Tavily search failed, falling back to DuckDuckGo', { query, error: tavilyErr?.message });
              try {
                const results = await doDuckDuckGo(query, count);
                if (results.length === 0) {
                  return { success: true, engine: 'duckduckgo', query, results: [], fallback: true, hint: 'DuckDuckGo 无即时结果（国内可能无法访问）' };
                }
                return { success: true, engine: 'duckduckgo', query, results, fallback: true };
              } catch (ddgErr) {
                return { success: false, error: `Tavily 失败: ${tavilyErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}` };
              }
            }
            throw tavilyErr;
          }

        } else {
          const results = await doDuckDuckGo(query, count);
          if (results.length === 0) {
            return { success: true, engine: 'duckduckgo', query, results: [], hint: 'DuckDuckGo 无即时结果（国内可能无法访问），建议用 Brave 或 Tavily' };
          }
          return { success: true, engine: 'duckduckgo', query, results };
        }
      }
      case 'web_fetch': {
        cleanupFetchCache(); // 每次调用时顺便清理
        const url = args.url;
        log.debug('web_fetch start', { url });
        const cached = fetchCache.get(url);
        if (cached && Date.now() - cached.timestamp < FETCH_CACHE_TTL) {
          log.debug('web_fetch cache hit', { url, status: cached.status });
          return { success: true, content: cached.content, status: cached.status, cached: true };
        }
        const res = await proxyFetch(url, { signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').slice(0, MAX_CACHED_CONTENT_SIZE);
        fetchCache.set(url, { content: stripped, status: res.status, timestamp: Date.now() });
        if (fetchCache.size > FETCH_CACHE_MAX) {
          const firstKey = fetchCache.keys().next().value;
          if (firstKey !== undefined) fetchCache.delete(firstKey);
        }
        log.info('web_fetch done', { url, status: res.status, bytes: stripped.length });
        return { success: true, content: stripped, status: res.status, cached: false };
      }
      case 'memory_read': {
        const uri = args.uri;
        log.debug('memory_read', { uri });
        const r = await memory.readMemory(uri, { treat404AsDebug: true });
        return r.ok ? { success: true, data: r.data } : { success: false, error: r.error };
      }
      case 'memory_write': {
        const uri = args.uri || '';
        const content = args.content ?? '';
        const priority = args.priority ?? 2;
        const disclosure = args.disclosure ?? '';
        const m = uri.match(/^([^:]+):\/\/(.+)$/);
        if (!m) return { success: false, error: `无效 URI: ${uri}` };
        // 使用队列机制执行写入
        log.info('memory_write enqueue', { uri, contentLen: String(content || '').length, priority });
        const result = await enqueueWrite(uri, content, priority, disclosure);
        if (!result?.success) log.error('memory_write failed', { uri, error: result?.error || 'unknown' });
        return result;
      }
      case 'memory_search': {
        log.debug('memory_search', { query: args.query, domain: args.domain || 'core', limit: args.limit || 10 });
        const r = await memorySearch.searchMemory(args.query, {
          domain: args.domain || 'core',
          limit: args.limit || 10,
          include_content: true,
        });
        if (!r.ok) return { success: false, error: r.error };
        log.info('memory_search done', { query: args.query, results: (r.data || []).length });
        return { success: true, results: r.data || [] };
      }
      // ── 本地任务存储工具 ──
      case 'tasks_read': {
        const data = loadTasksData();
        return { success: true, data };
      }
      case 'tasks_add': {
        const data = loadTasksData();
        const newTask = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          content: (args.content || '').trim(),
          priority: args.priority || 'p2',
          done: false,
          source: 'amy',
          createdAt: new Date().toISOString(),
        };
        data.tasks.push(newTask);
        if (saveTasksData(data)) {
          const icon = newTask.priority === 'p0' ? '🔴' : newTask.priority === 'p1' ? '🟡' : '🟢';
          log.info('tasks_add', { icon, taskId: newTask.id, content: newTask.content });
          return { success: true, taskId: newTask.id, message: `任务已添加: ${icon} ${newTask.content}` };
        }
        return { success: false, error: '保存失败' };
      }
      case 'tasks_update': {
        const data = loadTasksData();
        const idx = data.tasks.findIndex(t => t.id === args.taskId);
        if (idx === -1) return { success: false, error: '任务不存在' };
        
        const updates = {};
        if (args.done !== undefined) updates.done = args.done;
        if (args.content) updates.content = args.content.trim();
        if (args.priority) updates.priority = args.priority;
        
        data.tasks[idx] = { ...data.tasks[idx], ...updates };
        if (saveTasksData(data)) {
          log.info('tasks_update', { taskId: args.taskId, updates });
          return { success: true, message: '任务已更新' };
        }
        return { success: false, error: '保存失败' };
      }
      case 'tasks_delete': {
        const data = loadTasksData();
        const originalLen = data.tasks.length;
        data.tasks = data.tasks.filter(t => t.id !== args.taskId);
        if (data.tasks.length === originalLen) {
          return { success: false, error: '任务不存在' };
        }
        if (saveTasksData(data)) {
          log.info('tasks_delete', { taskId: args.taskId });
          return { success: true, message: '任务已删除' };
        }
        return { success: false, error: '保存失败' };
      }
      case 'parking_add': {
        const data = loadTasksData();
        const newItem = {
          id: `${Date.now()}`,
          content: (args.content || '').trim(),
          createdAt: new Date().toISOString(),
        };
        data.parking.push(newItem);
        if (saveTasksData(data)) {
          log.info('parking_add', { itemId: newItem.id, content: newItem.content });
          log.debug('parking_add saved counts', { tasks: data.tasks?.length || 0, parking: data.parking?.length || 0 });
          if (onTaskBoardUpdate) onTaskBoardUpdate();
          return { success: true, itemId: newItem.id, message: `已添加到停车场: ${newItem.content}` };
        }
        return { success: false, error: '保存失败' };
      }
      case 'task_add': {
        const title = (args.title || '').trim();
        if (!title) return { success: false, error: '任务标题不能为空' };
        let pr = (args.priority || '').toUpperCase();
        if (pr !== 'P0' && pr !== 'P1' && pr !== 'P2') pr = 'P2';
        const data = loadTasksData();
        const newTask = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          content: title,
          priority: pr.toLowerCase(),
          done: false,
          source: 'amy',
          createdAt: new Date().toISOString(),
        };
        data.tasks.push(newTask);
        if (saveTasksData(data)) {
          log.debug('task_add saved counts', { tasks: data.tasks?.length || 0, parking: data.parking?.length || 0 });
          if (onTaskBoardUpdate) onTaskBoardUpdate();
          return { success: true, taskId: newTask.id, message: `任务已添加: ${title}` };
        }
        return { success: false, error: '保存失败' };
      }
      case 'task_done': {
        const title = (args.title || '').trim();
        if (!title) return { success: false, error: '任务标题不能为空' };
        const data = loadTasksData();
        const idx = data.tasks.findIndex(t => (t.content || '').trim() === title);
        if (idx === -1) return { success: false, error: `未找到任务: ${title}` };
        data.tasks[idx].done = true;
        if (saveTasksData(data)) {
          return { success: true, message: `任务已完成: ${title}` };
        }
        return { success: false, error: '保存失败' };
      }
      case 'task_delete': {
        const title = (args.title || '').trim();
        if (!title) return { success: false, error: '任务标题不能为空' };
        const data = loadTasksData();
        const before = data.tasks.length;
        data.tasks = data.tasks.filter(t => (t.content || '').trim() !== title);
        if (data.tasks.length === before) return { success: false, error: `未找到任务: ${title}` };
        if (saveTasksData(data)) {
          return { success: true, message: `任务已删除: ${title}` };
        }
        return { success: false, error: '保存失败' };
      }
      case 'task_list': {
        const data = loadTasksData();
        return { success: true, data };
      }
      case 'time_inject': {
        const target = (args.target || '').trim();
        if (!target) return { success: false, error: '目标不能为空' };
        
        const format = args.format || 'iso';
        let timeStr;
        
        const now = new Date();
        switch (format) {
          case 'iso':
            timeStr = now.toISOString();
            break;
          case 'locale':
            timeStr = now.toLocaleString('zh-CN');
            break;
          case 'unix':
            timeStr = String(Math.floor(now.getTime() / 1000));
            break;
          case 'custom':
            const customFmt = args.customFormat || 'YYYY-MM-DD HH:mm:ss';
            timeStr = customFmt
              .replace('YYYY', now.getFullYear())
              .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
              .replace('DD', String(now.getDate()).padStart(2, '0'))
              .replace('HH', String(now.getHours()).padStart(2, '0'))
              .replace('mm', String(now.getMinutes()).padStart(2, '0'))
              .replace('ss', String(now.getSeconds()).padStart(2, '0'));
            break;
          default:
            timeStr = now.toISOString();
        }
        
        // 判断是 URI 还是任务标题
        if (target.includes('://')) {
          // 记忆节点
          const result = await enqueueWrite(target, timeStr, 0, '时间注入');
          return { success: result.success, time: timeStr, target };
        } else {
          // 任务标题 - 在任务内容后追加时间
          const data = loadTasksData();
          const idx = data.tasks.findIndex(t => (t.content || '').trim() === target);
          if (idx === -1) return { success: false, error: '未找到任务: ' + target };
          
          data.tasks[idx].content += ' [时间注入: ' + timeStr + ']';
          if (saveTasksData(data)) {
            if (onTaskBoardUpdate) onTaskBoardUpdate();
            return { success: true, time: timeStr, target };
          }
          return { success: false, error: '保存失败' };
        }
      }
      case 'search_knowledge': {
        const query = (args.query || '').trim();
        if (!query) return { success: false, error: '搜索关键词不能为空' };
        const topK = args.top_k || 3;
        log.info('search_knowledge', { query, topK });
        const ret = await aiLibrary.searchKnowledge(query, topK);
        const results = ret.results || [];
        const errorMsg = ret.error;
        const formatted = errorMsg || aiLibrary.formatKnowledgeForPrompt(results);
        return { success: true, results, formatted, hint: errorMsg || undefined };
      }
      default:
        return { success: false, error: `未知工具: ${name}` };
    }
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool, setOnTaskBoardUpdate };
 
