const path = require('path');

// 打包版通过 Electron 内嵌 Node 启动 Gateway 时，某些运行时（如 Node 18）
// 没有把 File 挂到 globalThis 上，但 undici 初始化会直接读取它。
// 这里在任何 require('undici') 之前补齐最小兼容层，避免 Gateway 启动即崩。
(function ensureWebFileShim() {
  if (typeof globalThis.File === 'function') return;
  try {
    const bufferModule = require('node:buffer');
    if (typeof bufferModule.File === 'function') {
      globalThis.File = bufferModule.File;
      return;
    }
  } catch {}

  if (typeof globalThis.Blob !== 'function') return;

  class FileShim extends Blob {
    constructor(bits = [], name = '', options = {}) {
      super(bits, options);
      this.name = String(name);
      this.lastModified = Number.isFinite(options.lastModified) ? options.lastModified : Date.now();
      this.webkitRelativePath = '';
    }

    get [Symbol.toStringTag]() {
      return 'File';
    }
  }

  globalThis.File = FileShim;
})();

const config = require('./config');

// Node 原生 fetch 默认不读 HTTP(S)_PROXY；V2rayN 等仅系统/TUN 生效时，网关仍可能直连 Google 导致 fetch failed。
// 若环境变量或项目 .env 已配置代理，则对全局 fetch 启用 undici ProxyAgent。
(function setupFetchProxyFromEnv() {
  try {
    const raw = (
      process.env.HTTPS_PROXY
      || process.env.https_proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || ''
    ).trim();
    if (!raw) return;
    // 与 undici ProxyAgent 叠用时，部分 Node 的 NODE_USE_ENV_PROXY 会让出站请求携带重复鉴权，
    // generativelanguage 返回 400「Multiple authentication credentials」。
    delete process.env.NODE_USE_ENV_PROXY;
    delete process.env.node_use_env_proxy;
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(raw));
    const safeLog = raw.includes('@') ? raw.replace(/:\/\/[^@]+@/, '://*****@') : raw;
    console.log('[OCT] [gateway] undici fetch proxy enabled:', safeLog);
  } catch (e) {
    console.warn('[OCT] [gateway] undici fetch proxy skipped:', String(e && e.message ? e.message : e));
  }
})();
const { streamChat, loadSystemPrompt } = require('./ai');
const session = require('./session');
const memory = require('./memory');
const memoryHistory = require('./memory_history');
const memoryFeedback = require('./memory_feedback');
const memorySearch = require('./memory_search');
const { sanitizeAssistantReply, sanitizeMemoryNodeContent, stripCotText } = require('./cot_sanitize');
const memoryGovernor = require('./memory_governor');
const memoryManagementAgent = require('./memory_management_agent');
const reviewQueueMaintenance = require('./review_queue_maintenance');
const reviewQueueActions = require('./review_queue_actions');
const imageAnalyzer = require('./image_analyzer');
const ImageService = require('./services/imageService');
const PostProcessor = require('./services/postProcessor');
const {
  scheduleMemoryHeartbeat,
  scheduleReviewQueueMaintenance,
  scheduleMemoryGovernanceReport,
  startMemoryMonitor,
} = require('./services/opsScheduler');
const MessageRouter = require('./gateway/router');
const SlashHandler = require('./gateway/slash');
const WsTransport = require('./transport/ws');
const HttpTransport = require('./transport/http');
const createHttpRequestHandler = require('./transport/httpRoutes');
const { sendCanvasTransportEvent } = require('./transport/helpers');
const ChatEngine = require('./runtime/chatEngine');
const StreamController = require('./runtime/streamController');
const ContextBuilder = require('./runtime/contextBuilder');
const ProviderRouter = require('./runtime/providerRouter');
const { createStreamSmoother } = require('./runtime/streamUtils');
const {
  extractMemorySearchTerms,
  hasRecallIntent,
  isProjectAnalysisRequest,
} = require('./runtime/contextHelpers');

const toolLoader = require('./tool_loader');

const hypothesis = require('./hypothesis');
const clarificationMemory = require('./clarification_memory');
const memoryTaskQueue = require('./memory_task_queue');
const aiLibrary = require('./tools/ai_library');
const orchestrator = require('./orchestrator');
const contextManager = require('./context_manager');
const taskQueue = require('./task_queue');
const { handleImageGenerate } = require('./image_gen');
const {
  startChapterPipelineRun,
  cancelChapterPipelineRun,
  listChapterPipelineRuns,
} = require('./script_adapter/chapterPipeline');
const persistence = require('./script_adapter/persistence');
const connectionRegistry = require('./script_adapter/connectionRegistry');
const {
  startBatch: startScriptAdapterBatch,
  getBatchStatus: getScriptAdapterBatchStatus,
  listBatches: listScriptAdapterBatches,
  cancelBatch: cancelScriptAdapterBatch,
  approveGate: approveScriptAdapterBatchGate,
  rejectGate: rejectScriptAdapterBatchGate,
  rerunChapter: rerunScriptAdapterBatchChapter,
  deleteBatch: deleteScriptAdapterBatch,
} = require('./script_adapter/batchOrchestrator');
const {
  startIntake: startScriptAdapterIntake,
} = require('./script_adapter/intakeOrchestrator');
const {
  startAnalysis: startScriptAdapterAnalysis,
} = require('./script_adapter/businessAnalysisOrchestrator');
const {
  startProductionHandoff: startScriptAdapterProductionHandoff,
} = require('./script_adapter/productionHandoffOrchestrator');
const { createLogger } = require('./logger');
const { scheduleMemoryHealthCheck } = require('./services/startupHealth');
const { startScheduler, stopScheduler } = require('./summarizer/scheduler');
const log = createLogger('gateway');
const memLog = createLogger('mem');

const systemPromptReady = (async () => {
  SYSTEM_PROMPT = await loadSystemPrompt(config.PROMPTS_DIR);
  log.info('System prompt loaded', { len: SYSTEM_PROMPT.length });
  taskQueue.checkTimeouts();
  taskQueue.cleanup();
  memoryHistory.cleanupOldHistory().catch((e) => {
    log.warn('cleanupOldHistory failed (non-fatal)', { error: e?.message || String(e) });
  });
  memorySearch.warmGlossaryCache().catch((e) => {
    log.warn('warmGlossaryCache failed (non-fatal)', { error: e?.message || String(e) });
  });
  return SYSTEM_PROMPT;
})();

const imageService = new ImageService({ imageAnalyzer, logger: log });
const postProcessor = new PostProcessor({
  memoryModule: memory,
  sessionModule: session,
  streamChat,
  memoryGovernor,
  memoryFeedback,
  memoryHistory,
  clarificationMemory,
  memoryTaskQueue,
  logger: log,
});
const slashHandler = new SlashHandler({
  session,
  memory,
  memoryFeedback,
  config,
  aiLibrary,
  tools: toolLoader,
  systemPromptReady,
  logger: log,
});
const messageRouter = new MessageRouter({
  slashHandler,
  sessionManager: session,
  chatHandler: handleChatRequest,
});
const chatEngine = new ChatEngine({
  streamChat,
  session,
  postProcessor,
  sanitizeAssistantReply,
  streamControllerFactory: (emitter, pacingMs) => new StreamController({
    emitter,
    pacingMs,
    smootherFactory: createStreamSmoother,
  }),
  logger: log,
});
const contextBuilder = new ContextBuilder({
  session,
  memory,
  memorySearch,
  memoryGovernor,
  contextManager,
  aiLibrary,
  hypothesis,
  imageService,
  config,
  logger: log,
  helpers: {
    hasRecallIntent,
    isProjectAnalysisRequest,
    extractMemorySearchTerms,
    stripCotText,
    sanitizeMemoryNodeContent,
    getCompletedTasksContext: (sessionKey) => orchestrator.getCompletedTasksContext(sessionKey),
  },
});
const providerRouter = new ProviderRouter({ config });

const PORT = config.PORT;
let SYSTEM_PROMPT = '';


const mcpManager = require('./mcp/manager');
// MCP 初始化（非致命，失败不阻断 Gateway 启动）
mcpManager.init().catch(e => log.warn('MCP 初始化失败（非致命）', { error: e.message }));

function getGatewayCapabilities(modelId = config.DASHSCOPE_MODEL) {
  let caps = {
    supportsTools: false,
    supportsStreamOptions: false,
  };
  try {
    caps = providerRouter.resolve(modelId).caps || caps;
  } catch (e) {
    log.warn('resolve model caps failed, using defaults', { modelId, error: e?.message || String(e) });
  }

  let mcpStatus = {};
  try {
    mcpStatus = mcpManager.getStatus() || {};
  } catch (e) {
    log.warn('read mcp status failed, using empty status', { error: e?.message || String(e) });
  }
  const mcpServers = Object.keys(mcpStatus).length;
  const mcpConnectedServers = Object.values(mcpStatus).filter((item) => item?.status === 'connected').length;

  return {
    model: modelId,
    toolsSupport: caps.toolsSupport || (caps.supportsTools ? 'supported' : 'unknown'),
    capabilitySource: caps.capabilitySource || 'unknown',
    supportsTools: !!caps.supportsTools,
    supportsStreamOptions: !!caps.supportsStreamOptions,
    mcpReady: mcpConnectedServers > 0,
    mcpServers,
    mcpConnectedServers,
  };
}

scheduleMemoryHealthCheck({
  memory,
  logger: log,
});

scheduleMemoryHeartbeat({
  memoryTaskQueue,
  logger: log,
});

scheduleReviewQueueMaintenance({
  memoryTaskQueue,
  reviewQueueMaintenance,
  logger: log,
});

scheduleMemoryGovernanceReport({
  memoryTaskQueue,
  memoryManagementAgent,
  logger: log,
});

log.info('Memory v2 file backend enabled', { root: config.memory?.root });

const handleTransportHttpRequest = createHttpRequestHandler({
  memory,
  memoryManagementAgent,
  reviewQueueActions,
  toolLoader,
  mcpManager,
  mobileHtmlPath: path.join(__dirname, 'mobile.html'),
});

async function handleChatRequest(request, connection) {
  const params = request?.params || {};
  const turnId = request?.id || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionKey = params?.sessionKey || 'main';
  const userMessage = params?.message || '';
  const attachments = params?.attachments || [];
  const workbenchContext = params?.workbenchContext || params?.canvasContext || null;
  const projectContext = params?.projectContext || null;
  let keepalivePhase = 'waiting_first_token';
  let keepaliveToolName = null;
  const keepaliveStartTime = Date.now();
  let keepaliveTimer = null;
  const stopKeepalive = () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  };

  const sendToolEvent = (evt) => {
    if (evt?.type === 'tool_call') {
      keepalivePhase = 'tool_running';
      keepaliveToolName = evt.tool || null;
    } else if (evt?.type === 'tool_result') {
      keepalivePhase = 'waiting_continuation';
      keepaliveToolName = null;
    }
    if (!connection.isOpen()) return;
    if ((evt?.type === 'workbench' || evt?.type === 'canvas') && evt.action) {
      sendCanvasTransportEvent(connection, evt.action, evt.payload || {}, evt.type === 'workbench' ? 'workbench' : 'canvas');
      return;
    }
    if (evt?.type === 'clarify_open' && evt?.payload?.spec) {
      connection.send({
        type: 'event',
        event: 'clarify',
        payload: { spec: evt.payload.spec },
      });
      return;
    }
    connection.send({ type: 'event', event: 'tool', payload: evt });
    if (evt.type === 'tool_call') {
      connection.send({ type: 'event', event: 'agent-phase', phase: 'tool_executing', tool: evt.tool });
    }
    if (evt.type === 'tool_result') {
      connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
    }
    // Agent 状态事件 → 单独推送 agent_status phase
    if (evt.type === 'agent_status') {
      connection.send({
        type: 'event',
        event: 'agent-phase',
        phase: evt.status === 'running' ? 'agent_running' : evt.status === 'done' ? 'thinking' : 'idle',
        agent: evt.agent,
      });
    }
  };

  const orchResult = await orchestrator.dispatch(userMessage, sessionKey, sendToolEvent);

  // ── Agent 短路：专职 Agent 执行完成，直接发结果给用户，跳过 AMY streamChat ──
  if (orchResult.agentResult && orchResult.agentResult.result) {
    const agentReply = orchResult.agentResult.result;
    const agentName = orchResult.agent || 'Agent';
    log.info('agent_result_shortcut', {
      agent: agentName,
      turnsUsed: orchResult.agentResult.turnsUsed,
      tokensUsed: orchResult.agentResult.tokensUsed,
      replyLen: agentReply.length,
    });

    // 把结果存入 session history（让后续对话能感知到）
    try { session.addMessage(sessionKey, 'user', userMessage); } catch {}
    try { session.addMessage(sessionKey, 'assistant', agentReply); } catch {}

    // 通知前端：agent 阶段结束
    connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
    // 推送 agent_status done 事件
    connection.send({
      type: 'event',
      event: 'tool',
      payload: { type: 'agent_status', agent: agentName, status: 'done', taskId: `orch_${turnId}` }
    });
    // 推送最终回复
    connection.send({
      type: 'event',
      event: 'chat',
      payload: {
        text: agentReply,
        state: 'done',
        done: true,
        turnId,
        agentName,
        tokensUsed: orchResult.agentResult.tokensUsed,
      },
    });

    stopKeepalive?.();
    return;
  }

  const systemPrompt = await systemPromptReady;
  const { messages, history } = await contextBuilder.build({
    sessionKey,
    userMessage,
    attachments,
    workbenchContext,
    orchestratorResult: orchResult,
    systemPrompt,
    projectContext,
  });

  connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
  connection.startThinkingPulse?.(8000);
  connection.abortCurrent?.();
  let cancelled = false;
  connection.setAbort?.(() => { cancelled = true; });

  const prevAssistantReplyForPost = history.filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';
  keepaliveTimer = setInterval(() => {
    if (!connection.isOpen()) return;
    const elapsed = Date.now() - keepaliveStartTime;
    try {
      connection.send({
        type: 'event',
        event: 'keepalive',
        payload: {
          phase: keepalivePhase,
          elapsedMs: elapsed,
          toolName: keepaliveToolName,
        },
      });
    } catch {
      // ignore keepalive failures
    }
  }, 2000);

  await chatEngine.execute({
    turnId,
    sessionKey,
    userMessage,
    messages,
    prevAssistantReply: prevAssistantReplyForPost,
    toolChoice: orchResult?.canvasIntent?.shouldUseCanvas ? { type: 'function', function: { name: 'canvas' } } : 'auto',
    options: {
      pacingMs: typeof params?.pacingMs === 'number' ? params.pacingMs : 4,
    },
  }, {
    onStart: (streamCtrl) => {
      connection.setAbort?.(() => {
        cancelled = true;
        streamCtrl.cancel();
      });
    },
    onDelta: (chunk) => {
      if (cancelled || !connection.isOpen()) return;
      if (keepalivePhase === 'waiting_first_token') keepalivePhase = 'streaming';
      connection.send({
        type: 'event',
        event: 'chat',
        payload: { delta: chunk, state: 'delta', done: false, turnId },
      });
    },
    onToolEvent: sendToolEvent,
    onBeforeDone: () => {
      connection.setAbort?.(null);
      connection.stopThinkingPulse?.();
    },
    onDone: ({ reply, usage, model: responseModel, turnId: doneTurnId }) => {
      stopKeepalive();
      if (cancelled || !connection.isOpen()) return;
      const donePayload = { text: reply, state: 'done', done: true, turnId: doneTurnId || turnId };
      if (usage) donePayload.usage = usage;
      if (responseModel) donePayload.model = responseModel;
      connection.send({ type: 'event', event: 'chat', payload: donePayload });
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
    },
    onError: (err) => {
      stopKeepalive();
      if (cancelled) return;
      connection.setAbort?.(null);
      connection.stopThinkingPulse?.();
      log.error('AI error', { error: err?.message || String(err), turnId });
      if (!connection.isOpen()) return;
      connection.send({
        type: 'event',
        event: 'chat',
        payload: { text: `❌ AI 调用失败：${err.message}`, state: 'done', done: true, turnId },
      });
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
    },
  });
}

async function handleTransportMessage(msg, connection) {
  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.intake.start') {
    const result = await startScriptAdapterIntake(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'intake failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.analysis.start') {
    const result = await startScriptAdapterAnalysis(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'analysis failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.production.handoff') {
    const result = await startScriptAdapterProductionHandoff(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'production handoff failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.run.start') {
    const run = startChapterPipelineRun(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: true,
      method: msg.method,
      payload: {
        type: 'script-adapter-run-started',
        ...run,
      },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.run.cancel') {
    const result = cancelChapterPipelineRun(msg.params?.taskId, msg.params?.reason);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: {
        type: 'script-adapter-run-cancelled',
        ...result,
      },
      error: result.success ? undefined : { message: result.error || 'cancel failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.run.list') {
    connection.send({
      type: 'res',
      id: msg.id,
      ok: true,
      method: msg.method,
      payload: {
        type: 'script-adapter-run-list',
        runs: listChapterPipelineRuns(),
      },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.start') {
    const result = await startScriptAdapterBatch(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'batch start failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.status') {
    const result = getScriptAdapterBatchStatus(msg.params?.batchId);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'batch not found' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.list') {
    const result = listScriptAdapterBatches(msg.params || {});
    connection.send({
      type: 'res',
      id: msg.id,
      ok: true,
      method: msg.method,
      payload: result,
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.cancel') {
    const result = cancelScriptAdapterBatch(msg.params?.batchId);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'batch cancel failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.rerunChapter') {
    const result = rerunScriptAdapterBatchChapter(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'rerun failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.delete') {
    const result = deleteScriptAdapterBatch(msg.params?.batchId);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'delete failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.subscribe') {
    const batchId = String(msg.params?.batchId || '').trim();
    if (batchId) {
      connectionRegistry.subscribe(batchId, connection);
    }
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(batchId),
      method: msg.method,
      payload: {
        subscribed: Boolean(batchId),
        batchId,
      },
      error: batchId ? undefined : { message: 'batchId required' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.approveGate') {
    const result = approveScriptAdapterBatchGate(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'approve gate failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.rejectGate') {
    const result = rejectScriptAdapterBatchGate(msg.params || {}, connection, log);
    connection.send({
      type: 'res',
      id: msg.id,
      ok: Boolean(result.success),
      method: msg.method,
      payload: result,
      error: result.success ? undefined : { message: result.error || 'reject gate failed' },
    });
    return true;
  }

  if (msg?.type === 'req' && msg?.method === 'image.generate') {
    const imgProvider = String(config.getEnvOrConfig('IMAGE_PROVIDER') || 'minimax').trim().toLowerCase();
    const imgBaseRaw = String(config.getEnvOrConfig('IMAGE_BASE_URL') || '').trim();
    let imageBaseUrl = imgBaseRaw;
    if (!imageBaseUrl) {
      if (imgProvider === 'openai') imageBaseUrl = 'https://api.openai.com';
      else if (imgProvider === 'siliconflow') imageBaseUrl = 'https://api.siliconflow.cn/v1';
      else imageBaseUrl = 'https://api.minimax.chat';
    }
    const imageConfig = {
      IMAGE_PROVIDER: imgProvider || 'minimax',
      IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: config.getEnvOrConfig('IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY') || 'false',
      IMAGE_API_KEY: config.getEnvOrConfig('IMAGE_API_KEY') || '',
      IMAGE_BASE_URL: imageBaseUrl,
      IMAGE_MODEL: config.getEnvOrConfig('IMAGE_MODEL') || (
        imgProvider === 'siliconflow' ? 'Kwai-Kolors/Kolors'
          : imgProvider === 'openai' ? 'dall-e-3'
            : 'image-01'
      ),
      IMAGE_MINIMAX_API_KEY: config.getEnvOrConfig('IMAGE_MINIMAX_API_KEY') || '',
      IMAGE_MINIMAX_BASE_URL: config.getEnvOrConfig('IMAGE_MINIMAX_BASE_URL') || '',
      IMAGE_MINIMAX_MODEL: config.getEnvOrConfig('IMAGE_MINIMAX_MODEL') || '',
      IMAGE_SILICONFLOW_API_KEY: config.getEnvOrConfig('IMAGE_SILICONFLOW_API_KEY') || '',
      IMAGE_SILICONFLOW_BASE_URL: config.getEnvOrConfig('IMAGE_SILICONFLOW_BASE_URL') || '',
      IMAGE_SILICONFLOW_MODEL: config.getEnvOrConfig('IMAGE_SILICONFLOW_MODEL') || '',
      IMAGE_OPENAI_API_KEY: config.getEnvOrConfig('IMAGE_OPENAI_API_KEY') || '',
      IMAGE_OPENAI_BASE_URL: config.getEnvOrConfig('IMAGE_OPENAI_BASE_URL') || '',
      IMAGE_OPENAI_MODEL: config.getEnvOrConfig('IMAGE_OPENAI_MODEL') || '',
      IMAGE_SIZE: config.getEnvOrConfig('IMAGE_SIZE') || '1024x1024',
      DASHSCOPE_API_KEY: config.getEnvOrConfig('DASHSCOPE_API_KEY') || '',
      DEEPSEEK_API_KEY: config.getEnvOrConfig('DEEPSEEK_API_KEY') || '',
      MINIMAX_API_KEY: config.getEnvOrConfig('MINIMAX_API_KEY') || '',
      CUSTOM_API_KEY: config.getEnvOrConfig('CUSTOM_API_KEY') || '',
    };
    await handleImageGenerate(msg.params || {}, imageConfig, (responseMsg) => {
      if (!connection?.isOpen?.()) return;
      connection.send(responseMsg);
    });
    return true;
  }
  await messageRouter.handleRequest(msg, connection);
}

const HTTP_PORT = PORT + 1;

function subscribeConnectionToRunningBatches(connection) {
  for (const batch of persistence.listRunningBatches()) {
    connectionRegistry.subscribe(batch.id, connection);
  }
}

startMemoryMonitor({ logger: memLog });
startScheduler();

const wsTransport = new WsTransport({
  port: PORT,
  logger: log,
  modelProvider: () => config.DASHSCOPE_MODEL,
  capabilityProvider: () => getGatewayCapabilities(config.DASHSCOPE_MODEL),
  authTokenProvider: () => process.env.OCT_GATEWAY_TOKEN || '',
  onAuthenticatedMessage: handleTransportMessage,
  onAuthenticatedConnection: subscribeConnectionToRunningBatches,
  onConnectionClose: (connection) => {
    connectionRegistry.onConnectionClose(connection);
  },
}).start();

const httpTransport = new HttpTransport({
  port: HTTP_PORT,
  logger: log,
  onRequest: handleTransportHttpRequest,
}).start();

if (toolLoader.setOnTaskBoardUpdate) {
  toolLoader.setOnTaskBoardUpdate(() => {
    wsTransport.broadcast({ type: 'event', event: 'task-board-update' });
  });
}


process.on('SIGINT', () => {
  log.info('shutting down');
  stopScheduler();
  httpTransport?.close();
  wsTransport?.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  log.info('shutting down');
  stopScheduler();
  httpTransport?.close();
  wsTransport?.close(() => process.exit(0));
});
