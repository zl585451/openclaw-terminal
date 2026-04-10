const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { streamChat, loadSystemPrompt } = require('./ai');
const session = require('./session');
const memory = require('./memory');
const memoryHistory = require('./memory_history');
const memoryFeedback = require('./memory_feedback');
const memorySearch = require('./memory_search');
const imageAnalyzer = require('./image_analyzer');
const tools = require('./tools');
const toolLoader = require('./tool_loader');
const crypto = require('crypto');
// const selfEval = require('./self_eval');  // 自评估系统已停用 2026-03-22
const hypothesis = require('./hypothesis');
const clarificationMemory = require('./clarification_memory');
const nocturneQueue = require('./nocturne_task_queue');
const aiLibrary = require('./tools/ai_library');
const orchestrator = require('./orchestrator');
const taskQueue = require('./task_queue');
const { generateClaudeBrief } = require('./claude_brief');
const { createLogger } = require('./logger');
const log = createLogger('gateway');
const memLog = createLogger('mem');

const PORT = config.PORT;
let SYSTEM_PROMPT = '';

/** 模型上下文上限（tokens），用于 CTX 使用率分母 */
const MODEL_CONTEXT_LIMITS = {
  'qwen-plus': 128000,
  'qwen3.5-plus': 128000,
  'qwen3-max-2026-01-23': 128000,
  'qwen-vl-max': 32768,
  'qwen2-vl-7b': 32768,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
};
function getModelContextLimit(modelId) {
  if (!modelId || typeof modelId !== 'string') return 128000;
  const id = modelId.toLowerCase().replace(/\s/g, '');
  return MODEL_CONTEXT_LIMITS[id] || MODEL_CONTEXT_LIMITS[modelId.split('/').pop()] || 128000;
}

const systemPromptReady = (async () => {
  SYSTEM_PROMPT = await loadSystemPrompt(config.PROMPTS_DIR);
  log.info('System prompt loaded', { len: SYSTEM_PROMPT.length });
  taskQueue.checkTimeouts();
  taskQueue.cleanup();
  memoryHistory.cleanupOldHistory().catch(() => {});
  memorySearch.warmGlossaryCache().catch(() => {});
  return SYSTEM_PROMPT;
})();

const mcpManager = require('./mcp/manager');
// MCP 初始化（非致命，失败不阻断 Gateway 启动）
mcpManager.init().catch(e => log.warn('MCP 初始化失败（非致命）', { error: e.message }));

// 记忆健康检查
async function checkMemoryHealth() {
  try {
    const alive = await memory.isAlive();
    if (!alive) {
      log.warn('Nocturne offline, memory disabled');
      return;
    }

    const CORE_URIS = [
      'core://agent/identity',
      'core://my_user/profile',
      'core://agent/rules/output_format',
      'core://my_user/preferences',
      'core://my_user/communication',
      'core://project/oct/status',
      'core://project/oct/decisions',
    ];

    const missing = [];
    for (const uri of CORE_URIS) {
      const r = await memory.readMemory(uri, { treat404AsDebug: true });
      const content = r.data?.node?.content || r.data?.content || '';
      if (!r.ok || !content) missing.push(uri);
    }

    if (missing.length === 0) {
      log.info('Core memory health ok', { total: CORE_URIS.length });
    } else {
      log.warn('Core memory missing', { missing });
    }
  } catch (e) {
    log.warn('Memory health check failed', { error: e?.message || String(e) });
  }
}

// 启动 3 秒后运行健康检查（等 Nocturne 完全就绪）
setTimeout(checkMemoryHealth, 3000);

// ═══════════════════════════════════════════════════════════════
// Nocturne 心跳检查（可配置，默认 5 分钟）
// ═══════════════════════════════════════════════════════════════
const heartbeatIntervalMs = (config.nocturne?.heartbeat_interval_seconds ?? 300) * 1000;
setInterval(async () => {
  try {
    const alive = await memory.isAlive();
    if (alive) {
      nocturneQueue.invalidateHealthCache();
      log.info('Nocturne 心跳正常');
    } else {
      log.warn('Nocturne 心跳检查：离线，记忆操作降级');
    }
  } catch (e) {
    log.warn('Nocturne 心跳检查失败', { error: e?.message || String(e) });
  }
}, heartbeatIntervalMs);

// ═══════════════════════════════════════════════════════════════
// 流平滑器：让打字机输出更丝滑
// 参考 Vercel AI SDK smoothStream + Intl.Segmenter 词边界分词
// ═══════════════════════════════════════════════════════════════
/**
 * 按目标打字速度（pacingMs/字符）均匀释放流式内容的 smoother。
 * 去掉 catchup，完全由 setInterval 按固定节奏放行，匹配用户设置的打字速度。
 *
 * @param {function} onChunk - 每当有字符可释放时调用
 * @param {number} pacingMs - 每次释放的间隔（毫秒），默认 28ms ≈ 中速 35字/秒
 */
function createStreamSmoother(onChunk, pacingMs = 28) {
  const buffer = [];
  let timer = null;
  let isEnding = false;
  let endCallback = null;

  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

  function getNextUnit() {
    if (buffer.length === 0) return null;
    const bufferStr = buffer.join('');
    const segments = [...segmenter.segment(bufferStr)];
    if (segments.length === 0) return null;

    const first = segments[0];
    // 空 segment：移除一个原始字符避免死循环
    if (!first.segment || !first.segment.length) {
      buffer.splice(0, 1);
      return null;
    }

    // 非词单元（标点、空白）：直接发送
    if (!first.isWordLike) {
      buffer.splice(0, first.segment.length);
      return first.segment;
    }

    // 词单元：发送整个词
    buffer.splice(0, first.segment.length);
    return first.segment;
  }

  function tick() {
    if (buffer.length === 0) {
      if (isEnding) {
        if (timer) { clearInterval(timer); timer = null; }
        if (endCallback) { const cb = endCallback; endCallback = null; cb(); }
      }
      return;
    }

    const unit = getNextUnit();
    if (unit) {
      onChunk(unit);
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, pacingMs);
  }

  function feed(text) {
    if (!text) return;
    for (const char of text) {
      buffer.push(char);
    }
    start();
  }

  function end(callback) {
    isEnding = true;
    endCallback = callback;
    if (buffer.length === 0) {
      if (timer) { clearInterval(timer); timer = null; }
      if (endCallback) { const cb = endCallback; endCallback = null; cb(); }
    }
  }

  function flush() {
    if (buffer.length > 0) {
      onChunk(buffer.join(''));
      buffer.length = 0;
    }
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { feed, end, flush };
}

/** 流式合并：微批量发送，保持打字机流畅度的同时减少 WebSocket 帧数 */
function createStreamMergeDelta(cfg, onChunk) {
  const maxChars = (cfg?.max_chars ?? 15);
  const idleMs = (cfg?.idle_ms ?? 25);
  let buf = '';
  let idleTimer = null;

  function flush() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (buf.length > 0) { onChunk(buf); buf = ''; }
  }

  return {
    onDelta: (delta) => {
      if (!delta) return;
      buf += delta;
      // 超过上限立即发送
      if (buf.length >= maxChars) { flush(); return; }
      // 否则用短定时器做微批处理（25ms 内的连续 delta 合并为一帧）
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, idleMs);
    },
    flush,
  };
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

// ═══════════════════════════════════════════════════════════════
// 全局内存监控（每 5 分钟打印一次）
// ═══════════════════════════════════════════════════════════════
const MEM_MON_INTERVAL_MS = Number(process.env.OCT_MEM_MON_INTERVAL_MS || 5 * 60 * 1000);
const MEM_WARN_RSS_MB = Number(process.env.OCT_MEM_WARN_RSS_MB || 500);
setInterval(() => {
  const usage = process.memoryUsage();
  const rss = (usage.rss / 1024 / 1024).toFixed(1);
  const heap = (usage.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotal = (usage.heapTotal / 1024 / 1024).toFixed(1);

  memLog.info(`RSS=${rss}MB | Heap=${heap}/${heapTotal}MB`, {
    rssMb: Number(rss),
    heapUsedMb: Number(heap),
    heapTotalMb: Number(heapTotal),
    externalMb: Number((usage.external / 1024 / 1024).toFixed(1)),
    arrayBuffersMb: Number(((usage.arrayBuffers || 0) / 1024 / 1024).toFixed(1)),
    uptimeSec: Math.round(process.uptime()),
  });

  // 超过阈值时告警（默认 500MB，可通过环境变量覆盖）
  if (usage.rss > MEM_WARN_RSS_MB * 1024 * 1024) {
    memLog.warn(`Memory over ${MEM_WARN_RSS_MB}MB`, { rssMb: Number(rss) });
  }
}, MEM_MON_INTERVAL_MS);
wss.on('error', (err) => {
  log.error('Server error', { error: err?.message || String(err), code: err?.code || '' });
  if (err.code === 'EADDRINUSE') {
    log.error('Port in use', { port: PORT });
  }
  process.exit(1);
});
log.info('WebSocket listening', { url: 'ws://0.0.0.0:' + PORT });

// 任务看板工具执行成功后，广播刷新事件给所有连接的前端
if (tools.setOnTaskBoardUpdate) {
  tools.setOnTaskBoardUpdate(() => {
    const msg = JSON.stringify({ type: 'event', event: 'task-board-update' });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  });
}

// HTTP 服务：提供手机端 mobile.html
const HTTP_PORT = PORT + 1;
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'oct-vault' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/tool') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { tool, args } = JSON.parse(body || '{}');
        const result = await toolLoader.executeTool(tool, args || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
      }
    });
    return;
  }

  // MCP 管理路由
  if (req.method === 'GET' && req.url === '/mcp/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mcpManager.getStatus()));
    return;
  }

  if (req.method === 'POST' && req.url === '/mcp/server') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const name = parsed.name;
        let command;
        let args;
        let env;
        if (parsed.config && typeof parsed.config === 'object') {
          ({ command, args, env } = parsed.config);
        } else {
          ({ command, args, env } = parsed);
        }
        const config = { command, args, env: env || {} };
        const status = await mcpManager.addServer(name, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'DELETE' && req.url?.startsWith('/mcp/server/')) {
    const name = req.url.replace('/mcp/server/', '');
    mcpManager.removeServer(name);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.url === '/' || req.url === '/mobile') {
    const htmlPath = path.join(__dirname, 'mobile.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('mobile.html not found: ' + e.message);
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  log.info('Mobile HTTP listening', { url: 'http://0.0.0.0:' + HTTP_PORT });
  log.info('Mobile HTTP local', { url: 'http://localhost:' + HTTP_PORT });
  console.log('[Gateway] HTTP 工具端口已启动:', HTTP_PORT);
});

httpServer.on('error', (err) => {
  log.error('Mobile HTTP start failed', { error: err?.message || String(err) });
});

const authenticatedClients = new Set();

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  log.info('client connected', { clientId });

  // 每个 ws 连接独立维护一个取消令牌，用于中止上一个流
  let currentAbort = null;
  let thinkingPulseInterval = null;
  let thinkingSeconds = 0;

  try {
    const nonce = crypto.randomBytes(16).toString('hex');
    ws._nonce = nonce;
    ws._clientId = clientId;

    ws.send(JSON.stringify({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce },
    }));
  } catch (e) {
    log.error('send challenge failed', { clientId, error: e?.message || String(e) });
    try { ws.close(1011, 'Server error'); } catch (_) {}
    return;
  }

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { type, id, method, params } = msg;

    if (type === 'req' && method === 'connect') {
      const token = params?.auth?.token ?? params?.token ?? '';
      const configToken = process.env.OCT_GATEWAY_TOKEN || '';
      if (configToken && token !== configToken) {
        ws.send(JSON.stringify({ type: 'res', id, ok: false, error: { message: 'Invalid token' } }));
        return;
      }
      authenticatedClients.add(ws);
      ws.send(JSON.stringify({
        type: 'res',
        id,
        ok: true,
        payload: {
          type: 'hello-ok',
          model: config.DASHSCOPE_MODEL,
          agent: { model: config.DASHSCOPE_MODEL },
        },
      }));
      log.info('client authenticated', { clientId });
      return;
    }

    if (!authenticatedClients.has(ws)) {
      ws.send(JSON.stringify({ type: 'res', id, ok: false, error: { message: 'Not authenticated' } }));
      return;
    }

    if (type === 'req' && method === 'chat.send') {
      const sessionKey = params?.sessionKey || 'main';
      const userMessage = params?.message || '';
      const attachments = params?.attachments || [];
      const canvasContext = params?.canvasContext || null;

      // 工具事件回调：Worker 执行后台任务时向前端推送工具调用卡片
      const sendToolEvent = (evt) => {
        if (ws.readyState !== ws.OPEN) return;
        if (evt?.type === 'canvas' && evt.action) {
          ws.send(JSON.stringify({ type: 'event', event: 'canvas', action: evt.action, payload: evt.payload || {} }));
          return;
        }
        ws.send(JSON.stringify({ type: 'event', event: 'tool', payload: evt }));
        if (evt.type === 'tool_call') {
          ws.send(JSON.stringify({ type: 'event', event: 'agent-phase', phase: 'tool_executing', tool: evt.tool }));
        }
        if (evt.type === 'tool_result') {
          ws.send(JSON.stringify({ type: 'event', event: 'agent-phase', phase: 'thinking' }));
        }
      };
      const orchResult = await orchestrator.dispatch(userMessage, sessionKey, sendToolEvent);
      // orchResult 包含 intent/agent/shouldDelegate 信息，日志已在 orchestrator 内打印
      // 现阶段不改变后续流程，预留为未来 Agent 路由扩展点

      if (userMessage.startsWith('/')) {
        await handleSlashCommand(ws, id, userMessage.trim(), sessionKey);
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // AMY 指令：生成 Claude 问题简报（本地生成，不调用模型）
      // 触发短语：包含“生成简报”或“发给Claude”
      // ─────────────────────────────────────────────────────────────
      const msgTrim = (userMessage || '').trim();
      const briefTriggered = msgTrim.includes('生成简报')
        || msgTrim.includes('发给Claude')
        || msgTrim.includes('发给 Claude');
      if (briefTriggered) {
        try {
          // 使用触发前的历史作为上下文（不把触发词当成症状）
          const history = session.getHistory(sessionKey) || [];
          const projectRoot = path.join(__dirname, '..');
          const { briefPath, brief } = generateClaudeBrief({
            projectRoot,
            sessionHistory: history,
          });

          // 记录到会话（保持对话连续）
          session.addMessage(sessionKey, 'user', msgTrim);
          const reply = '简报已生成，请复制 docs/claude-brief.md 的内容发给 Claude';
          session.addMessage(sessionKey, 'assistant', reply);

          // 直接在 OCT 界面展示简报内容，方便复制
          const combined = `${reply}\n\n---\n\n（以下为 ${briefPath} 内容）\n\n${brief}`;
          ws.send(JSON.stringify({
            type: 'event',
            event: 'chat',
            payload: { text: combined, state: 'done', done: true },
          }));
        } catch (e) {
          const errMsg = e?.message || String(e);
          ws.send(JSON.stringify({
            type: 'event',
            event: 'chat',
            payload: { text: `❌ 生成简报失败：${errMsg}`, state: 'done', done: true },
          }));
        }
        return;
      }

      const imageAttachments = (params?.attachments || []).filter(a => a.type === 'image');
      let messageContent;

      if (imageAttachments.length > 0) {
        // 构建多模态消息内容
        const contentParts = [];

        // 先加文字
        const textPart = userMessage || '请分析这张图片';
        if (textPart) {
          contentParts.push({ type: 'text', text: textPart });
        }

        // 直接把图片传给模型，不经过 imageAnalyzer 预分析
        imageAttachments.forEach(a => {
          const imageUrl = a.content?.startsWith('data:')
            ? a.content
            : `data:${a.mimeType};base64,${a.content}`;
          contentParts.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        });

        // 如果有图片，用数组格式；否则用纯文字
        messageContent = contentParts.length > 1 ? contentParts : textPart;
      } else {
        messageContent = userMessage;
      }

      // 在 streamChat 调用前，构建上下文记忆注入（Nocturne 超时/离线不阻塞，继续对话）
      let contextMemory = '';
      try {
        const nocturneAlive = await nocturneQueue.isNocturneHealthy();
        if (nocturneAlive && userMessage.length > 1) {

          // 1. 提取用户消息里的实体词（中文词组、英文词、技术词）
          const entityWords = [];
          // 英文单词/技术词（3字符以上）
          const enWords = userMessage.match(/[a-zA-Z][a-zA-Z0-9_\-\.]{2,}/g) || [];
          entityWords.push(...enWords.slice(0, 3));
          // 中文词组（2-6字）
          const zhWords = userMessage.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
          entityWords.push(...zhWords.slice(0, 3));

          // 2. 去重搜索，最多搜 3 个词
          const searchWords = [...new Set(entityWords)].slice(0, 3);
          const memContents = [];
          const seenUris = new Set();

          for (const word of searchWords) {
            const r = await memorySearch.searchMemory(word, {
              domain: 'core',
              limit: 2,
              include_content: true,
            });
            if (!r.ok || !r.data) continue;
            for (const item of r.data) {
              if (seenUris.has(item.uri)) continue;
              // 跳过历史记录节点（太多会撑爆上下文）
              if (item.uri.includes('/history/')) continue;
              seenUris.add(item.uri);
              const content = (item.content || '').slice(0, 200);
              if (content) memContents.push(`[${item.uri}] ${content}`);
            }
          }

          // 3. 加载最近 3 条对话历史摘要（404 静默返回空）
          try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const historyResult = await memory.readMemory(
              `core://my_user/history/${todayStr}`,
              { treat404AsDebug: true }
            );
            if (historyResult.ok && historyResult.data) {
              const children = historyResult.data?.node?.children
                || historyResult.data?.children || [];
              // 取最后 3 条（时间戳最新的）
              const recent = children.slice(-3);
              for (const child of recent) {
                const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
                if (!childPath) continue;
                const r = await memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
                if (!r.ok) continue;
                const content = r.data?.node?.content || r.data?.content || '';
                if (!content) continue;
                try {
                  const parsed = JSON.parse(content);
                  if (parsed.user && parsed.amy) {
                    memContents.push(
                      `[近期对话] 用户说：${parsed.user.slice(0, 50)} → AI：${parsed.amy.slice(0, 80)}`
                    );
                  }
                } catch {}
              }
            }
          } catch {}

          if (memContents.length > 0) {
            contextMemory = '\n\n[相关记忆]\n' + memContents.join('\n');
          }
        }
      } catch (e) {
        log.debug('contextMemory 加载失败，继续对话', { error: e?.message || String(e) });
      }

      // 后台任务已派发时，提示 AMY 简短回复，不要在主对话中再次调用工具
      let backgroundTaskNotice = '';
      if (orchResult?.hasBackgroundTask) {
        backgroundTaskNotice = '\n\n[系统] 用户这条消息已派发后台任务执行（如查邮件），请简短回复「好的，我已经派出去查了，我们继续聊」之类，不要在主对话中调用 email_reader 等工具。';
      }

      const lastUserMsg = typeof messageContent === 'string'
        ? messageContent + contextMemory + backgroundTaskNotice
        : [
            ...messageContent,
            ...(contextMemory ? [{ type: 'text', text: contextMemory }] : []),
            ...(backgroundTaskNotice ? [{ type: 'text', text: backgroundTaskNotice }] : []),
          ];

      session.addMessage(sessionKey, 'user',
        typeof messageContent === 'string' ? messageContent : userMessage
      );

      const systemPrompt = await systemPromptReady;
      let history = session.getHistory(sessionKey);

      // 对话历史限制：最多保留最近 20 条消息
      const MAX_HISTORY_MESSAGES = 20;
      if (history.length > MAX_HISTORY_MESSAGES) {
        history = [
          history[0],
          ...history.slice(-(MAX_HISTORY_MESSAGES - 1)),
        ];
        log.info('[Gateway] 历史消息已截断', { original: session.getHistory(sessionKey).length, kept: history.length });
      }

      // 假设验证（异步，不阻塞主流程）
      let hypothesisResult = null;
      // 只对非斜杠命令、消息长度合适的情况触发
      if (!userMessage.startsWith('/') && userMessage.length > 15) {
        hypothesisResult = await hypothesis.selectBestApproach(
          userMessage,
          systemPrompt,
          history.slice(-6)
        ).catch(() => null);
      }

      // 如果假设验证建议质疑，注入到系统提示
      let finalSystemPrompt = systemPrompt;
      if (hypothesisResult?.should_challenge
          && hypothesisResult?.challenge_point) {
        finalSystemPrompt = systemPrompt + `\n\n[内部指令] 用户这条消息有值得质疑的地方：${hypothesisResult.challenge_point}。请在回复中适当提出，不要一味认同。`;
      }

      // 根据思考模式注入相应的引导指令
      const thinkMode = session.getThinkMode(sessionKey);
      if (thinkMode && thinkMode !== 'off') {
        const thinkPrompts = {
          'low': '\n\n[思考模式：LOW] 回复时先用 [cot] 标签简要列出你的思路要点（2-3 步），然后 [/cot] 结束，最后给出正式回复。格式示例：\n[cot]\n1. 分析问题核心\n2. 确定方案\n[/cot]\n\n正式回复内容...',
          'medium': '\n\n[思考模式：MEDIUM] 回复时先用 [cot] 标签结构化分析问题（1.核心目标 2.关键约束 3.可行方案 4.建议行动），然后 [/cot] 结束，最后给出正式回复。格式示例：\n[cot]\n1. 核心目标：...\n2. 关键约束：...\n3. 可行方案：...\n4. 建议行动：...\n[/cot]\n\n正式回复内容...',
          'high': '\n\n[思考模式：HIGH] 回复时先用 [cot] 标签做深度推理，分析问题本质，列举多种思路，评估优劣，然后 [/cot] 结束，最后给出详细正式回复。格式示例：\n[cot]\n## 问题分析\n...\n## 可能方案\n### 方案A：...\n### 方案B：...\n## 评估\n...\n## 结论\n...\n[/cot]\n\n正式回复内容...',
        };
        finalSystemPrompt = finalSystemPrompt + thinkPrompts[thinkMode];
      }

      // 注入当前时间（柳州 UTC+8）
      const now = new Date();
      // 使用 Intl.DateTimeFormat 获取准确的时区时间，不依赖服务器时区
      const liuzhouFormatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = liuzhouFormatter.formatToParts(now);
      const timeMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const timeStr = `${timeMap.year}-${timeMap.month}-${timeMap.day} ${timeMap.hour}:${timeMap.minute}:${timeMap.second}`;
      const timeContext = `\n\n[当前时间] ${timeStr} (UTC+8 柳州)`;
      const modelContext = `[当前运行模型] 你当前运行的底层大模型是：\`${config.DASHSCOPE_MODEL}\`。当用户问「你是什么大模型」「基于什么模型」时，必须如实回答当前模型名称，严禁说自己是 DeepSeek、GPT、Claude 或其他任何模型。\n\n`;

      // AI.library 知识检索（未启动时静默跳过，不影响对话）
      let knowledgeContext = '';
      try {
        const knowledge = await aiLibrary.searchKnowledge(userMessage);
        knowledgeContext = aiLibrary.formatKnowledgeForPrompt(knowledge);
      } catch (e) {
        log.debug('AI.library 检索失败，跳过', { error: e?.message || String(e) });
      }

      const messages = [
        { role: 'system', content: modelContext + finalSystemPrompt + timeContext + knowledgeContext },
        ...history.slice(0, -1).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: lastUserMsg },
      ];

      const taskContext = orchestrator.getCompletedTasksContext(sessionKey);
      if (taskContext) {
        const lastIdx = messages.length - 1;
        if (messages[lastIdx]?.role === 'user') {
          const content = messages[lastIdx].content;
          messages[lastIdx] = {
            ...messages[lastIdx],
            content: typeof content === 'string'
              ? content + taskContext
              : [...(Array.isArray(content) ? content : []), { type: 'text', text: taskContext }]
          };
          log.info('已注入后台任务结果到上下文');
        }
      }

      ws.send(JSON.stringify({ type: 'event', event: 'agent-phase', phase: 'thinking' }));

      // 思考心跳：每 8 秒向前端发送 thinking 事件，防止假断开
      thinkingSeconds = 0;
      thinkingPulseInterval = setInterval(() => {
        thinkingSeconds += 8;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'event',
            event: 'agent-phase',
            phase: 'thinking',
            elapsed: thinkingSeconds,
          }));
        }
      }, 8000);

      // 中止上一个流（如果有）
      if (currentAbort) currentAbort();
      let cancelled = false;
      currentAbort = () => { cancelled = true; };

      let fullReply = '';
      // pacingMs：每个字符/词之间的发送间隔（毫秒）
      // 28ms ≈ 中速 35字/秒；18ms ≈ 快速 55字/秒；45ms ≈ 慢速 22字/秒
      // 前端通过 params.pacingMs 传入，暂默认 28ms
      const pacingMs = typeof params?.pacingMs === 'number' ? params.pacingMs : 28;
      const smoother = createStreamSmoother((chunk) => {
        if (cancelled) return;
        fullReply += chunk;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'event',
            event: 'chat',
            payload: { delta: chunk, state: 'delta', done: false },
          }));
        }
      });

      await streamChat({
        messages,
        onDelta: smoother.feed,
        onToolEvent: (evt) => {
          if (cancelled || ws.readyState !== ws.OPEN) return;
          ws.send(JSON.stringify({ type: 'event', event: 'tool', payload: evt }));
          if (evt.type === 'tool_call') {
            ws.send(JSON.stringify({ type: 'event', event: 'agent-phase', phase: 'tool_executing', tool: evt.tool }));
          }
          if (evt.type === 'tool_result') {
            ws.send(JSON.stringify({ type: 'event', event: 'agent-phase', phase: 'thinking' }));
          }
        },
        onDone: (_text, usage, responseModel) => {
          if (cancelled) return;
          currentAbort = null;
          if (thinkingPulseInterval) { clearInterval(thinkingPulseInterval); thinkingPulseInterval = null; }
          smoother.flush();
          if (fullReply) {
            session.addMessage(sessionKey, 'assistant', fullReply);

            // 后台队列串行执行，限流避免压垮 Nocturne；失败记录日志不阻塞
            nocturneQueue.enqueue(
              () => memoryFeedback.detectAndSaveFeedback(userMessage, fullReply),
              'memoryFeedback'
            );
            nocturneQueue.enqueue(
              () => detectAndSaveParking(userMessage, sessionKey),
              'detectAndSaveParking'
            );
            nocturneQueue.enqueue(
              () => memoryHistory.saveHistorySummary(userMessage, fullReply),
              'memoryHistory'
            );
            nocturneQueue.enqueue(
              () => extractAndSaveMemory(userMessage, fullReply),
              'extractAndSaveMemory'
            );
            const history = session.getHistory(sessionKey) || [];
            const prevAssistantMsgs = history
              .filter(m => m.role === 'assistant')
              .slice(-2);
            const prevAssistantReply = prevAssistantMsgs.length >= 2
              ? prevAssistantMsgs[prevAssistantMsgs.length - 2]?.content || ''
              : '';
            nocturneQueue.enqueue(
              () => clarificationMemory.detectAndSaveClarification(
                userMessage, fullReply, prevAssistantReply
              ),
              'clarificationMemory'
            );
            // 自评估系统已停用 2026-03-22
            // nocturneQueue.enqueue(
            //   () => selfEval.evaluateReply(userMessage, fullReply)
            //     .then(() => selfEval.maybeDistill()),
            //   'selfEval+maybeDistill'
            // );
          }

          if (ws.readyState === ws.OPEN) {
            const donePayload = { text: fullReply, state: 'done', done: true };
            if (usage) donePayload.usage = usage;
            if (responseModel) donePayload.model = responseModel;
            ws.send(JSON.stringify({ type: 'event', event: 'chat', payload: donePayload }));
            ws.send(JSON.stringify({
              type: 'event', event: 'agent-phase', phase: 'idle'
            }));
          }
          log.info('stream done', { len: fullReply.length });
        },
        onError: (err) => {
          if (cancelled) return;
          currentAbort = null;
          if (thinkingPulseInterval) { clearInterval(thinkingPulseInterval); thinkingPulseInterval = null; }
          log.error('AI error', { error: err?.message || String(err) });
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'event',
              event: 'chat',
              payload: {
                text: `❌ AI 调用失败：${err.message}`,
                state: 'done', done: true,
              },
            }));
            ws.send(JSON.stringify({
              type: 'event', event: 'agent-phase', phase: 'idle'
            }));
          }
        },        
      });
      return;
    }

    if (type === 'req' && method === 'sessions.list') {
      ws.send(JSON.stringify({
        type: 'res', id, ok: true,
        payload: { sessions: session.listSessions() },
      }));
      return;
    }

    ws.send(JSON.stringify({ type: 'res', id, ok: false, error: { message: `Unknown method: ${method}` } }));
  });

  ws.on('close', () => {
    if (currentAbort) currentAbort();
    currentAbort = null;
    if (thinkingPulseInterval) { clearInterval(thinkingPulseInterval); thinkingPulseInterval = null; }
    authenticatedClients.delete(ws);
    log.info('client disconnected', { clientId });
  });

  ws.on('error', (err) => {
    log.error('client connection error', { clientId, error: err?.message || String(err) });
  });
});

function slashReply(ws, text) {
  ws.send(JSON.stringify({
    type: 'event', event: 'chat',
    payload: { text, state: 'done', done: true, isSystemReply: true },
  }));
}

async function detectAndSaveParking(userMsg, sessionKey) {
  const msg = (userMsg || '').trim();

  // 检测停车信号
  const parkingTriggers = [
    '停车', '先记下来', '稍后处理', '先放着',
    '待会处理', '暂时记录', '先不管', '记一下',
    '回头再说', '先搁置',
  ];

  const isParking = parkingTriggers.some(t => msg.includes(t));
  if (!isParking) return;

  // 提取停车内容（去掉触发词）
  let content = msg;
  for (const t of parkingTriggers) {
    content = content.replace(t, '').replace(/[：:]/g, '').trim();
  }
  if (!content || content.length < 2) return;

  // 写入 Nocturne
  const alive = await memory.isAlive();
  if (!alive) return;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
  const uri = `core://my_user/daily/${dateStr}/parking_lot/${timeStr}`;

  await memory.writeMemory(uri, JSON.stringify({
    item: content,
    time: now.toTimeString().slice(0, 5),
    done: false,
    session: sessionKey,
  }), 1, '停车场待办，下次会话开始时检查');

  log.info('parking saved', { content });
}

async function extractAndSaveMemory(userMsg, assistantReply) {
  try {
    const nocturneAlive = await memory.isAlive();
    if (!nocturneAlive) return;

    const triggers = [
      '记住', '记一下', '我喜欢', '我不喜欢', '以后', '永远',
      '我的', '我们的', '项目', '决定', '完成了', '发布了',
    ];
    const hasSignal = triggers.some(t =>
      userMsg.includes(t) || assistantReply.includes(t)
    );
    if (!hasSignal) return;

    await streamChat({
      messages: [
        {
          role: 'system',
          content: '你是记忆提炼助手。从对话中提炼值得长期记忆的关键信息。输出格式：\nURI: core://xxx/xxx\nContent: 简洁的记忆内容（50字内）\nPriority: 1或2\nDisclosure: 触发条件\n\n如果没有值得记忆的内容，只输出：SKIP',
        },
        {
          role: 'user',
          content: `用户说：${userMsg.slice(0, 200)}\nAI回复：${assistantReply.slice(0, 200)}`,
        },
      ],
      onDelta: () => {},
      onDone: async (text) => {
        if (!text || text.includes('SKIP')) return;
        const uriMatch = text.match(/URI:\s*(\S+)/);
        const contentMatch = text.match(/Content:\s*(.+?)(?=\n|$)/s);
        const priorityMatch = text.match(/Priority:\s*(\d)/);
        const disclosureMatch = text.match(/Disclosure:\s*(.+?)(?=\n|$)/s);
        if (uriMatch && contentMatch) {
          const uri = uriMatch[1].trim();
          const content = contentMatch[1].trim();
          const priority = parseInt(priorityMatch?.[1] || '2', 10);
          const disclosure = (disclosureMatch?.[1] || '').trim();
          // 过滤掉任务看板相关路径，这些由专用工具处理
          const blockedPaths = ['taskboard', 'tasks', 'parking', 'parking_lot'];
          const isBlocked = blockedPaths.some(p => uri.toLowerCase().includes(p));
          if (isBlocked) {
            log.debug('memory extract skip blocked path', { uri });
            return;
          }
          await memory.writeMemory(uri, content, priority, disclosure);
          log.info('memory extracted write ok', { uri, contentLen: content.length, priority });
        }
      },
      onError: () => {},
    });
  } catch {
    // 静默失败
  }
}

async function handleSlashCommand(ws, id, cmd, sessionKey) {
  const parts = cmd.split(/\s+/);
  const base = parts[0].toLowerCase();

  if (base === '/new' || base === '/reset') {
    session.clearSession(sessionKey);
    session.clearThinkMode(sessionKey);
    slashReply(ws, '✅ 会话已重置，记忆已清空。');
    return;
  }

  if (base === '/status') {
    const sp = await systemPromptReady;
    const sessions = session.listSessions();
    const mem = require('./memory');
    const nocturneAlive = await mem.isAlive();
    const aiLibEnabled = (config.ai_library || {}).enabled !== false;
    const aiLibraryAlive = aiLibEnabled ? await aiLibrary.checkHealth().catch(() => false) : false;
    const currentHistory = session.getHistory(sessionKey);
    const historyChars = currentHistory.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const estimatedTokens = Math.round(historyChars / 2);
    const systemPromptTokens = Math.round(sp.length / 2);
    const totalEstimated = estimatedTokens + systemPromptTokens;
    ws.send(JSON.stringify({
      type: 'event',
      event: 'chat',
      payload: {
        text: [
          '🦞 **OCT Gateway**',
          '',
          `📡 Model: \`${config.DASHSCOPE_MODEL}\``,
          `🧠 Nocturne: ${nocturneAlive ? '✅ 在线' : '❌ 离线'}`,
          `📚 AI.library：${aiLibraryAlive ? '✅ 在线' : '⚫ 未启动'}`,
          `💬 当前会话：${currentHistory.length} 条消息`,
          `📊 上下文估算：~${totalEstimated.toLocaleString()} tokens（含 system prompt ~${systemPromptTokens.toLocaleString()}）`,
          `🗂️ 所有会话：${sessions.length > 0 ? sessions.join(', ') : 'none'}`,
          `⏱️ Uptime：${Math.round(process.uptime())}s`,
          '',
          '**口令**：`/status` `/model` `/provider` `/memory boot|read|search|status` `/new` `/help`',
        ].join('\n'),
        state: 'done',
        done: true,
      },
    }));
    return;
  }

  if (base === '/model') {
    const modelName = parts.slice(1).join(' ').trim();
    const provider = config.getProviderConfig();

    if (!modelName) {
      const modelList = provider.models
        .map(m => {
          const cur = m.id === config.DASHSCOPE_MODEL ? ' ◀ 当前' : '';
          const toolTag = m.tools ? '🔧' : '  ';
          const thinkTag = m.thinking ? '🧠' : '  ';
          return `  ${toolTag}${thinkTag} \`${m.id}\`${cur}\n       ${m.label}`;
        })
        .join('\n');
      const legend = '\n\n🔧 = 支持工具调用  🧠 = 支持深度思考';
      ws.send(JSON.stringify({
        type: 'event', event: 'chat',
        payload: {
          text: `当前服务商：${provider.name}\n当前模型：\`${config.DASHSCOPE_MODEL}\`\n\n可用模型：\n${modelList || '  （无预设模型，可直接输入 /model 模型名）'}${legend}\n\n切换：\`/model 模型名\``,
          state: 'done', done: true,
        },
      }));
    } else {
      config.DASHSCOPE_MODEL = modelName;
      const modelDef = provider.models.find(m => m.id === modelName);
      const caps = modelDef ? { supportsTools: modelDef.tools, supportsThinking: modelDef.thinking, label: modelDef.label }
        : config.getModelCaps(modelName);
      const warnings = [];
      if (!caps.supportsTools) {
        warnings.push('⚠️ 该模型不支持工具调用（天气/搜索/文件操作等功能将暂时不可用）');
      }
      if (caps.supportsThinking) {
        warnings.push('💡 该模型支持深度思考（reasoning），回复可能较慢但质量更高');
      }
      const warningText = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';
      ws.send(JSON.stringify({
        type: 'event', event: 'chat',
        payload: {
          text: `✅ 已切换为：\`${modelName}\`（${caps.label || modelName}）${warningText}`,
          state: 'done', done: true,
        },
      }));
    }
    return;
  }

  if (base === '/provider') {
    const providerId = parts.slice(1).join(' ').trim().toLowerCase();
    const providers = config.PROVIDERS;
    if (!providerId) {
      const list = Object.entries(providers)
        .map(([id, p]) => {
          const cur = id === config.currentProvider ? ' ◀ 当前' : '';
          return `  ■ \`${id}\` — ${p.name}${cur}`;
        })
        .join('\n');
      ws.send(JSON.stringify({
        type: 'event', event: 'chat',
        payload: {
          text: `当前服务商：\`${config.currentProvider}\`（${(providers[config.currentProvider] || {}).name || '未知'}）\n\n可用服务商：\n${list}\n\n切换：\`/provider 服务商id\`（如 /provider deepseek）\n\n💡 切换后需在设置中填入对应 API Key，并重启 Gateway 生效`,
          state: 'done', done: true,
        },
      }));
      return;
    }
    if (providers[providerId]) {
      config.currentProvider = providerId;
      const p = providers[providerId];
      config.DASHSCOPE_MODEL = p.defaultModel || config.DASHSCOPE_MODEL;
      ws.send(JSON.stringify({
        type: 'event', event: 'chat',
        payload: {
          text: `✅ 已切换为：\`${providerId}\`（${p.name}）\n\n当前模型：\`${config.DASHSCOPE_MODEL}\`\n\n⚠️ 请在设置中填入 ${p.name} 的 API Key，并重启 Gateway 使配置生效`,
          state: 'done', done: true,
        },
      }));
    } else {
      slashReply(ws, `未知服务商 \`${providerId}\`，请输入 \`/provider\` 查看可用列表`);
    }
    return;
  }

  if (base === '/memory') {
    const subCmd = (parts[1] || '').toLowerCase();
    const mem = require('./memory');

    if (subCmd === 'boot') {
      const alive = await mem.isAlive();
      if (!alive) {
        slashReply(ws, '❌ Nocturne 后端不可用，请检查是否已启动');
        return;
      }
      const coreUris = ['core://agent/identity', 'core://my_user/profile', 'core://agent/my_user'];
      const bootContent = await mem.loadBootMemory(coreUris);
      const bootText = bootContent
        ? `✅ 核心记忆已重载\n\n${bootContent.slice(0, 800)}`
        : '⚠️ 未找到核心记忆';
      ws.send(JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { text: bootText, state: 'done', done: true, isSystemReply: true },
      }));
      return;
    }

    if (subCmd === 'search') {
      const query = parts.slice(2).join(' ').trim();
      if (!query) { slashReply(ws, '用法：/memory search <关键词>'); return; }
      const result = await mem.searchMemory(query);
      if (!result.ok || !result.data?.length) {
        slashReply(ws, `🔍 未找到匹配「${query}」的记忆`);
      } else {
        const list = result.data.map(m => `  ${m.uri}`).join('\n');
        slashReply(ws, `🔍 找到 ${result.data.length} 条记忆：\n${list}`);
      }
      return;
    }

    if (subCmd === 'read') {
      const memArg = parts.slice(2).join(' ').trim();
      if (!memArg) {
        slashReply(ws, '用法：/memory read <uri>');
        return;
      }
      const r = await mem.readMemory(memArg, { treat404AsDebug: true });
      const nodeData = r.ok ? r.data : null;
      const content = nodeData?.node?.content || nodeData?.content || '';
      const priority = nodeData?.node?.priority ?? nodeData?.priority ?? '--';
      const disclosure = nodeData?.node?.disclosure || nodeData?.disclosure || '--';

      const text = r.ok
        ? `📖 ${memArg}\n\nPriority: ${priority}\nDisclosure: ${disclosure}\n\n${content || '（空）'}`
        : `❌ ${r.error}`;

      ws.send(JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { text, state: 'done', done: true, isSystemReply: true },
      }));
      return;
    }

    if (subCmd === 'write') {
      const memArg = parts.slice(2).join(' ').trim();
      const firstSpace = memArg.indexOf(' ');
      const uri = firstSpace >= 0 ? memArg.slice(0, firstSpace).trim() : memArg;
      const content = firstSpace >= 0 ? memArg.slice(firstSpace + 1).trim() : '';
      if (!uri || !content) {
        ws.send(JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: {
            text: '[text]用法：/memory write core://xxx 内容[/text]',
            state: 'done',
            done: true,
          },
        }));
        return;
      }
      const r = await mem.writeMemory(uri, content, 2, '');
      ws.send(JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: {
          text: r.ok ? `✅ 已写入 ${uri}` : `❌ ${r.error}`,
          state: 'done',
          done: true,
        },
      }));
      return;
    }

    if (subCmd === 'status') {
      const alive = await mem.isAlive();
      slashReply(ws, alive ? '✅ Nocturne Memory 在线' : '❌ Nocturne Memory 离线');
      return;
    }

    // /memory today — 显示今天的对话摘要（404 静默返回空）
    if (subCmd === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const r = await mem.readMemory(`core://my_user/history/${todayStr}`, { treat404AsDebug: true });
      if (!r.ok || !r.data) {
        slashReply(ws, `今天（${todayStr}）暂无对话记录`);
        return;
      }
      const children = r.data?.node?.children || r.data?.children || [];
      if (children.length === 0) {
        slashReply(ws, `今天（${todayStr}）暂无对话记录`);
        return;
      }
      // 读取最近 5 条
      const recent = children.slice(-5);
      const lines = [`📅 今天的对话摘要（${todayStr}，共 ${children.length} 条）\n`];
      for (const child of recent) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;
        const cr = await mem.readMemory(`core://${childPath}`, { treat404AsDebug: true });
        if (!cr.ok) continue;
        const content = cr.data?.node?.content || cr.data?.content || '';
        try {
          const parsed = JSON.parse(content);
          const time = (parsed.timestamp || '').slice(11, 16);
          lines.push(`[${time}] 用户：${(parsed.user || '').slice(0, 40)}…\n      AI：${(parsed.amy || '').slice(0, 60)}…`);
        } catch {
          lines.push(content.slice(0, 80));
        }
      }
      slashReply(ws, lines.join('\n'));
      return;
    }

    // /memory feedback — 显示最近反馈记录
    if (subCmd === 'feedback') {
      const feedbackText = await memoryFeedback.loadFeedbackForBoot();
      if (!feedbackText || feedbackText.trim().length < 10) {
        slashReply(ws, '暂无反馈记录');
        return;
      }
      slashReply(ws, feedbackText.replace('## 📌 反馈与纠正（启动时加载）\n\n', '📌 最近反馈记录\n\n'));
      return;
    }

    // /memory stats — 显示记忆统计
    if (subCmd === 'stats') {
      const alive = await mem.isAlive();
      if (!alive) {
        slashReply(ws, '❌ Nocturne 离线');
        return;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      const historyToday = await mem.readMemory(`core://my_user/history/${todayStr}`, { treat404AsDebug: true });
      const todayCount = (historyToday.data?.node?.children || historyToday.data?.children || []).length;
      const historyRoot = await mem.readMemory('core://my_user/history', { treat404AsDebug: true });
      const totalDays = (historyRoot.data?.node?.children || historyRoot.data?.children || []).length;
      slashReply(ws, [
        '📊 记忆系统统计',
        '',
        `今日对话：${todayCount} 条`,
        `历史天数：${totalDays} 天`,
        `Nocturne：✅ 在线`,
        '',
        '口令：/memory boot|read|search|status|today|feedback|stats',
      ].join('\n'));
      return;
    }

    slashReply(ws, [
      '可用记忆口令：',
      '/memory boot — 重载核心记忆',
      '/memory today — 今天的对话摘要',
      '/memory feedback — 最近反馈记录',
      '/memory stats — 记忆统计',
      '/memory read core://xxx — 读取节点',
      '/memory search 关键词 — 搜索',
      '/memory status — 检查状态',
    ].join('\n'));
    return;
  }

  if (base === '/export') {
    const subCmd = parts[1] || '';

    if (subCmd === 'training-data') {
      slashReply(ws, '⏳ 正在导出训练数据，请稍候...');

      try {
        const outputDir = path.join(
          config.PROMPTS_DIR, '..', '..', 'training-data'
        );
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        const outputPath = path.join(
          outputDir, `amy-training-${dateStr}.jsonl`
        );

        // 从 Nocturne 拉取历史对话
        log.info('export training-data: read history root');
        const testAlive = await memory.isAlive();
        log.info('export training-data: nocturne alive', { alive: !!testAlive });

        const historyRoot = await memory.readMemory(
          'core://my_user/daily',
          { treat404AsDebug: true }
        );
        log.debug('export training-data: history root result', { preview: JSON.stringify(historyRoot).slice(0, 300) });

        if (!historyRoot.ok) {
          // 检查是否是路径不存在
          if (historyRoot.error && (historyRoot.error.includes('not found') || historyRoot.error.includes('404'))) {
            slashReply(ws, [
              '⚠️ 暂无历史记录',
              '',
              'core://my_user/daily 路径不存在，',
              '说明对话历史还没有开始写入。',
              '',
              '可能原因：',
              '1. memory_history.js 的 auto_save_history 未开启',
              '2. 历史记录还没有触发写入',
              '',
              '先发几条消息，再试 /export training-data',
            ].join('\n'));
          } else {
            slashReply(ws, `❌ 无法读取历史记录：${historyRoot.error}`);
          }
          return;
        }

        const dateDirs = historyRoot.data?.node?.children
          || historyRoot.data?.children || [];

        const lines = [];
        let total = 0;
        let exported = 0;

        // 读取自我评估分数
        const evalScores = new Map();
        try {
          const evalRoot = await memory.readMemory(
            'core://agent/self_eval',
            { treat404AsDebug: true }
          );
          if (evalRoot.ok) {
            const evalDates = evalRoot.data?.node?.children
              || evalRoot.data?.children || [];
            for (const ed of evalDates.slice(-30)) {
              const edPath = ed.path
                || ed.uri?.replace(/^[^:]+:\/\//, '') || '';
              if (!edPath) continue;
              const edr = await memory.readMemory(`core://${edPath}`, { treat404AsDebug: true });
              if (!edr.ok) continue;
              const evalTimes = edr.data?.node?.children
                || edr.data?.children || [];
              for (const et of evalTimes) {
                const etPath = et.path
                  || et.uri?.replace(/^[^:]+:\/\//, '') || '';
                if (!etPath) continue;
                const etr = await memory.readMemory(`core://${etPath}`, { treat404AsDebug: true });
                if (!etr.ok) continue;
                const evalContent = etr.data?.node?.content
                  || etr.data?.content || '';
                try {
                  const evalData = JSON.parse(evalContent);
                  // 用时间戳作为 key 匹配
                  if (evalData.timestamp) {
                    evalScores.set(
                      evalData.timestamp.slice(0, 16),
                      evalData.score || 3
                    );
                  }
                } catch {}
              }
            }
          }
        } catch {}

        // 遍历所有日期目录
        for (const dateDir of dateDirs) {
          const datePath = dateDir.path
            || dateDir.uri?.replace(/^[^:]+:\/\//, '') || '';
          if (!datePath) continue;

          // 读取每个日期目录下的子节点
          const dr = await memory.readMemory(`core://${datePath}`, { treat404AsDebug: true });
          if (!dr.ok) continue;

          const dayChildren = dr.data?.node?.children
            || dr.data?.children || [];

          // 跳过非历史节点（tasks/parking_lot/summary/cursor_summary/intention）
          const NON_HISTORY_NODES = [
            'tasks', 'parking_lot', 'summary',
            'cursor_summary', 'intention',
          ];
          const historyEntries = dayChildren.filter(child => {
            const name = child.name
              || child.path?.split('/').pop() || '';
            return !NON_HISTORY_NODES.includes(name);
          });

          for (const entry of historyEntries) {
            const entryPath = entry.path
              || entry.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!entryPath) continue;

            const er = await memory.readMemory(`core://${entryPath}`, { treat404AsDebug: true });
            if (!er.ok) continue;

            const content = er.data?.node?.content
              || er.data?.content || '';

            try {
              const data = JSON.parse(content);
              total++;

              // 检查评分（没有评分默认3分，只导出2分以上）
              const timeKey = (data.timestamp || '').slice(0, 16);
              const score = evalScores.get(timeKey) || 3;
              if (score < 2) continue;

              // 跳过太短的对话
              if (!data.user || !data.amy) continue;
              if (data.user.length < 5 || data.amy.length < 10) continue;

              // 百炼 SFT 格式
              const trainingItem = {
                messages: [
                  {
                    role: 'system',
                    content: '你是 AI，用户的私人助手和朋友。用中文回复，简洁有温度，称呼用户为"用户"。',
                  },
                  {
                    role: 'user',
                    content: data.user,
                  },
                  {
                    role: 'assistant',
                    content: data.amy,
                  },
                ],
              };
              lines.push(JSON.stringify(trainingItem));
              exported++;
            } catch {}
          }
        }

        if (lines.length === 0) {
          slashReply(ws, '⚠️ 暂无可导出的数据，继续积累对话后再试');
          return;
        }

        // 写入文件
        fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

        // 同时生成一个统计报告
        const reportPath = path.join(
          outputDir, `amy-training-${dateStr}-report.txt`
        );
        const report = [
          `导出时间：${new Date().toLocaleString('zh-CN')}`,
          `总对话数：${total} 条`,
          `导出数量：${exported} 条（3分以上）`,
          `过滤数量：${total - exported} 条（低分或太短）`,
          `文件路径：${outputPath}`,
          '',
          '下一步：',
          '1. 打开 https://bailian.console.aliyun.com',
          '2. 进入「模型调优」→「数据集管理」',
          '3. 上传 ' + path.basename(outputPath),
          '4. 选择 qwen-turbo 或 qwen-plus 作为基础模型',
          '5. 开始 SFT 微调训练',
          '',
          `当前进度：${exported} / 1000 条`,
          `距离可微调还需：${Math.max(0, 1000 - exported)} 条`,
        ].join('\n');

        fs.writeFileSync(reportPath, report, 'utf-8');

        slashReply(ws, [
          `✅ 训练数据导出完成！`,
          ``,
          `📊 统计：`,
          `总对话：${total} 条`,
          `导出：${exported} 条（3分以上）`,
          `过滤：${total - exported} 条`,
          ``,
          `📁 文件：`,
          `training-data/amy-training-${dateStr}.jsonl`,
          ``,
          `📈 微调进度：${exported}/1000 条`,
          exported >= 1000
            ? `🎉 数据量已达标，可以开始微调了！`
            : `还需积累 ${1000 - exported} 条高分对话`,
          ``,
          `口令：/export training-data`,
        ].join('\n'));

      } catch (e) {
        slashReply(ws, `❌ 导出失败：${e.message}`);
      }
      return;
    }

    // /export 无参数时显示帮助
    slashReply(ws, [
      '📦 导出功能：',
      '/export training-data — 导出微调训练数据（JSONL格式）',
    ].join('\n'));
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // /think 思考模式命令（/cot 兼容别名）
  // ═══════════════════════════════════════════════════════════════
  if (base === '/think' || base === '/cot') {
    const level = (parts[1] || '').toLowerCase();
    const validLevels = ['off', 'low', 'medium', 'high'];

    if (!level || !validLevels.includes(level)) {
      const currentLevel = session.getThinkMode(sessionKey) || 'off';
      slashReply(ws, [
        '🧠 思考模式',
        '',
        `当前状态：${currentLevel.toUpperCase()}`,
        '',
        '可用级别：',
        '  /cot off    — 关闭思考模式',
        '  /cot low    — 低强度思考引导',
        '  /cot medium — 中等强度思考引导',
        '  /cot high   — 高强度思考引导',
      ].join('\n'));
      return;
    }

    session.setThinkMode(sessionKey, level);

    const levelDesc = {
      'off': '已关闭思考模式',
      'low': '已开启低强度思考引导（轻量级提示）',
      'medium': '已开启中等强度思考引导（结构化分析）',
      'high': '已开启高强度思考引导（深度推理）',
    };

    slashReply(ws, `🧠 ${levelDesc[level]}\n\n下次对话将应用此设置。`);
    return;
  }

  if (base === '/help') {
    slashReply(ws, [
      '📋 OCT Gateway 命令：',
      '  /status   — 查看 Gateway 状态',
      '  /model [名称] — 查看/切换模型',
      '  /provider [id] — 查看/切换 AI 服务商',
      '  /memory   — 记忆系统管理',
      '  /think [off/low/medium/high] — 思考模式',
      '  /task add [内容] [p0/p1/p2] — 添加任务',
      '  /task done [序号] — 标记任务完成',
      '  /task list — 列出今日任务',
      '  /task clear — 清空已完成任务',
      '  /new      — 重置当前会话',
      '  /help     — 显示此帮助',
    ].join('\n'));
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // /task 任务管理命令（改用本地存储，脱离 Nocturne）
  // ═══════════════════════════════════════════════════════════════
  if (base === '/task') {
    const subCmd = (parts[1] || '').toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);

    // /task add [内容] [p0/p1/p2]
    if (subCmd === 'add') {
      const args = parts.slice(2);
      if (args.length === 0) {
        slashReply(ws, '用法：/task add 任务内容 [p0/p1/p2]\n示例：/task add 修复登录Bug p1');
        return;
      }

      let priority = 'p2';
      let content = args.join(' ');
      const lastArg = args[args.length - 1]?.toLowerCase();
      if (lastArg === 'p0' || lastArg === 'p1' || lastArg === 'p2') {
        priority = lastArg;
        content = args.slice(0, -1).join(' ');
      }

      if (!content.trim()) {
        slashReply(ws, '❌ 任务内容不能为空');
        return;
      }

      // 使用本地存储
      const result = await tools.executeTool('tasks_add', {
        content: content.trim(),
        priority,
      });

      if (result.success) {
        const priorityIcon = priority === 'p0' ? '🔴' : priority === 'p1' ? '🟡' : '🟢';
        slashReply(ws, `✅ 任务已添加\n${priorityIcon} [${priority.toUpperCase()}] ${content.trim()}`);
      } else {
        slashReply(ws, `❌ 添加任务失败: ${result.error}`);
      }
      return;
    }

    // /task done [序号]
    if (subCmd === 'done') {
      const index = parseInt(parts[2] || '', 10);
      if (isNaN(index) || index < 1) {
        slashReply(ws, '用法：/task done <序号>\n先用 /task list 查看任务序号');
        return;
      }

      const dataResult = await tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        slashReply(ws, '❌ 无法读取任务列表');
        return;
      }

      const pendingTasks = (dataResult.data.tasks || []).filter(t => !t.done);

      if (index > pendingTasks.length) {
        slashReply(ws, `❌ 序号 ${index} 超出范围，当前有 ${pendingTasks.length} 个待办任务`);
        return;
      }

      const task = pendingTasks[index - 1];
      if (!task) {
        slashReply(ws, '❌ 找不到该任务');
        return;
      }

      const updateResult = await tools.executeTool('tasks_update', {
        taskId: task.id,
        done: true,
      });

      if (updateResult.success) {
        slashReply(ws, `✅ 任务已完成\n~~${task.content}~~`);
      } else {
        slashReply(ws, `❌ 更新失败: ${updateResult.error}`);
      }
      return;
    }

    // /task list
    if (subCmd === 'list') {
      const dataResult = await tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        slashReply(ws, '❌ 无法读取任务列表');
        return;
      }

      const tasks = dataResult.data.tasks || [];
      const intention = dataResult.data.intention || '';

      if (tasks.length === 0) {
        slashReply(ws, `📅 今日任务 (${todayStr})\n\n暂无任务\n\n用 /task add 添加任务`);
        return;
      }

      const pending = tasks.filter(t => !t.done);
      const completed = tasks.filter(t => t.done);

      const lines = [`📅 今日任务 (${todayStr})`];
      if (intention) {
        lines.push(`\n🎯 今日意图：${intention}`);
      }

      lines.push(`\n📋 待办 (${pending.length})`);
      pending.forEach((t, i) => {
        const icon = t.priority === 'p0' ? '🔴' : t.priority === 'p1' ? '🟡' : '🟢';
        const source = t.source === 'amy' ? 'AI' : '用户';
        lines.push(`  ${i + 1}. ${icon} ${t.content} [${source}]`);
      });

      if (completed.length > 0) {
        lines.push(`\n✅ 已完成 (${completed.length})`);
        completed.forEach(t => {
          lines.push(`  ~~${t.content}~~`);
        });
      }

      lines.push('\n口令：/task done <序号> | /task add | /task clear');
      slashReply(ws, lines.join('\n'));
      return;
    }

    // /task clear — 清空已完成任务
    if (subCmd === 'clear') {
      const dataResult = await tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        slashReply(ws, '❌ 无法读取任务列表');
        return;
      }

      const completedCount = (dataResult.data.tasks || []).filter(t => t.done).length;
      if (completedCount === 0) {
        slashReply(ws, '✅ 没有任务需要清理');
        return;
      }

      // 直接操作文件
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tasksPath = path.join(os.homedir(), '.openclaw', 'tasks.json');

      try {
        const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
        data.tasks = data.tasks.filter(t => !t.done);
        data.updatedAt = new Date().toISOString();
        fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2), 'utf-8');
        slashReply(ws, `✅ 已清理 ${completedCount} 条已完成任务\n刷新任务看板即可生效`);
      } catch (e) {
        slashReply(ws, `❌ 清理失败: ${e.message}`);
      }
      return;
    }

    // /task migrate — 从 Nocturne 迁移数据到本地
    if (subCmd === 'migrate') {
      const alive = await memory.isAlive();
      if (!alive) {
        slashReply(ws, '❌ Nocturne 离线，无法迁移');
        return;
      }

      slashReply(ws, '🔄 正在从 Nocturne 迁移任务数据...');

      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tasksPath = path.join(os.homedir(), '.openclaw', 'tasks.json');

      let localData = { tasks: [], parking: [], intention: '', updatedAt: '' };
      try {
        if (fs.existsSync(tasksPath)) {
          localData = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
        }
      } catch {}

      let migratedTasks = 0;
      let migratedParking = 0;

      try {
        // 迁移任务
        const tasksResult = await memory.readMemory(`core://my_user/daily/${todayStr}/tasks`, { treat404AsDebug: true });
        if (tasksResult.ok && tasksResult.data) {
          const children = tasksResult.data?.node?.children || tasksResult.data?.children || [];
          for (const child of children) {
            const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!childPath) continue;
            const taskResult = await memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
            if (!taskResult.ok) continue;
            const content = taskResult.data?.node?.content || taskResult.data?.content || '';
            try {
              const parsed = JSON.parse(content);
              if (parsed.archived) continue;
              const existingId = childPath.split('/').pop();
              if (!localData.tasks.find(t => t.id === existingId)) {
                localData.tasks.push({
                  id: existingId,
                  content: parsed.label || parsed.content || '未命名任务',
                  priority: parsed.priority || 'p2',
                  done: parsed.done || false,
                  source: parsed.source || 'amy',
                  createdAt: parsed.created || parsed.createdAt || '',
                });
                migratedTasks++;
              }
            } catch {}
          }
        }

        // 迁移停车场
        const parkingResult = await memory.readMemory(`core://my_user/daily/${todayStr}/parking_lot`, { treat404AsDebug: true });
        if (parkingResult.ok && parkingResult.data) {
          const children = parkingResult.data?.node?.children || parkingResult.data?.children || [];
          for (const child of children) {
            const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!childPath) continue;
            const itemResult = await memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
            if (!itemResult.ok) continue;
            const content = itemResult.data?.node?.content || itemResult.data?.content || '';
            try {
              const parsed = JSON.parse(content);
              const existingId = childPath.split('/').pop();
              if (!localData.parking.find(p => p.id === existingId)) {
                localData.parking.push({
                  id: existingId,
                  content: parsed.item || content.slice(0, 50),
                  priority: 'p2',
                  done: false,
                  source: 'amy',
                  createdAt: parsed.time || '',
                });
                migratedParking++;
              }
            } catch {
              if (content && content !== '[DELETED]') {
                const existingId = childPath.split('/').pop();
                if (!localData.parking.find(p => p.id === existingId)) {
                  localData.parking.push({
                    id: existingId,
                    content: content.slice(0, 50),
                    priority: 'p2',
                    done: false,
                    source: 'amy',
                    createdAt: '',
                  });
                  migratedParking++;
                }
              }
            }
          }
        }

        // 保存
        localData.updatedAt = new Date().toISOString();
        const dir = path.dirname(tasksPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(tasksPath, JSON.stringify(localData, null, 2), 'utf-8');

        slashReply(ws, `✅ 迁移完成\n已从 Nocturne 迁移 ${migratedTasks} 条任务和 ${migratedParking} 条停车场项目\n\n原始数据保留在 Nocturne 中作为备份`);
      } catch (e) {
        slashReply(ws, `❌ 迁移失败: ${e.message}`);
      }
      return;
    }

    // /task 无参数时显示帮助
    slashReply(ws, [
      '📋 任务管理命令：',
      '/task add <内容> [p0/p1/p2] — 添加任务',
      '/task done <序号> — 标记完成',
      '/task list — 列出今日任务',
      '/task clear — 清空已完成任务',
      '/task migrate — 从 Nocturne 迁移数据',
    ].join('\n'));
    return;
  }

  slashReply(ws, `未知命令：${cmd}\n输入 /help 查看可用命令`);
}

wss.on('error', (err) => {
  log.error('WebSocket server error', { error: err?.message || String(err) });
});

process.on('SIGINT', () => {
  log.info('shutting down');
  httpServer.close();
  wss.close(() => process.exit(0));
});
