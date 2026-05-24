const path = require('path');
const { ensureWebFileShim, setupFetchProxyFromEnv } = require('./bootstrap/environment');

// 打包版通过 Electron 内嵌 Node 启动 Gateway 时，某些运行时（如 Node 18）
// 没有把 File 挂到 globalThis 上，但 undici 初始化会直接读取它。
// 这里在任何 require('undici') 之前补齐最小兼容层，避免 Gateway 启动即崩。
ensureWebFileShim();

const config = require('./config');

// Node 原生 fetch 默认不读 HTTP(S)_PROXY；V2rayN 等仅系统/TUN 生效时，网关仍可能直连 Google 导致 fetch failed。
// 若环境变量或项目 .env 已配置代理，则对全局 fetch 启用 undici ProxyAgent。
setupFetchProxyFromEnv();
const { streamChat, loadSystemPrompt } = require('./ai');
const session = require('./session');
const memory = require('./memory');
const memoryHistory = require('./memory_history');
const memorySearch = require('./memory_search');
const { sanitizeAssistantReply, sanitizeMemoryNodeContent, stripCotText, toUserVisibleAssistantText } = require('./cot_sanitize');
const memoryGovernor = require('./memory_governor');
const memoryManagementAgent = require('./memory_management_agent');
const reviewQueueMaintenance = require('./review_queue_maintenance');
const reviewQueueActions = require('./review_queue_actions');
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
const { startGatewayTransports } = require('./bootstrap/transports');
const { registerGatewayShutdown, registerTaskBoardBroadcast } = require('./bootstrap/lifecycle');
const { startGatewayMemoryJobs } = require('./bootstrap/memoryJobs');
const createHttpRequestHandler = require('./transport/httpRoutes');
const { sendCanvasTransportEvent } = require('./transport/helpers');
const ChatEngine = require('./runtime/chatEngine');
const StreamController = require('./runtime/streamController');
const ContextBuilder = require('./runtime/contextBuilder');
const ProviderRouter = require('./runtime/providerRouter');
const { createChatRequestHandler } = require('./runtime/chatRequestHandler');
const { createGatewayCapabilitiesProvider } = require('./runtime/gatewayCapabilities');
const { createOptionalCapabilitiesSnapshot } = require('./runtime/optionalCapabilities');
const { buildImageGenerationConfig } = require('./runtime/imageGenerationConfig');
const { createStreamSmoother } = require('./runtime/streamUtils');
const { normalizeAssistantMarkdown } = require('./services/markdownNormalizer');
const {
  extractMemorySearchTerms,
  hasRecallIntent,
  isProjectAnalysisRequest,
} = require('./runtime/contextHelpers');
const tools = require('./tools');
const toolLoader = require('./tool_loader');
// const selfEval = require('./self_eval');  // 自评估系统已停用 2026-03-22
const hypothesis = require('./hypothesis');
const clarificationMemory = require('./clarification_memory');
const memoryTaskQueue = require('./memory_task_queue');
const { createLazyAiLibrary } = require('./runtime/lazyAiLibrary');
const orchestrator = require('./orchestrator');
const contextManager = require('./context_manager');
const taskQueue = require('./task_queue');
const { handleImageGenerate } = require('./image_gen');
const {
  createLazyScriptAdapterMessageHandler,
  createLazyScriptAdapterRuntime,
} = require('./script_adapter/lazyMessageHandler');
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

const imageService = new ImageService({
  getImageAnalyzer: () => require('./image_analyzer'),
  logger: log,
});
const aiLibrary = createLazyAiLibrary({
  loadModule: () => require('./tools/ai_library'),
});
const providerRouter = new ProviderRouter({ config });
const postProcessor = new PostProcessor({
  memoryModule: memory,
  sessionModule: session,
  streamChat,
  memoryGovernor,
  memoryHistory,
  clarificationMemory,
  memoryTaskQueue,
  logger: log,
});
const slashHandler = new SlashHandler({
  session,
  memory,
  config,
  aiLibrary,
  tools: toolLoader,
  systemPromptReady,
  providerRouter,
  logger: log,
});
const chatEngine = new ChatEngine({
  streamChat,
  session,
  postProcessor,
  sanitizeAssistantReply,
  normalizeAssistantMarkdown,
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
const getScriptAdapterRuntime = createLazyScriptAdapterRuntime({
  logger: log,
  loadRuntime: () => {
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
    const { createScriptAdapterMessageHandler } = require('./script_adapter/messageHandler');

    return {
      persistence,
      connectionRegistry,
      handleMessage: createScriptAdapterMessageHandler({
        startIntake: startScriptAdapterIntake,
        startAnalysis: startScriptAdapterAnalysis,
        startProductionHandoff: startScriptAdapterProductionHandoff,
        startChapterPipelineRun,
        cancelChapterPipelineRun,
        listChapterPipelineRuns,
        startBatch: startScriptAdapterBatch,
        getBatchStatus: getScriptAdapterBatchStatus,
        listBatches: listScriptAdapterBatches,
        cancelBatch: cancelScriptAdapterBatch,
        approveGate: approveScriptAdapterBatchGate,
        rejectGate: rejectScriptAdapterBatchGate,
        rerunChapter: rerunScriptAdapterBatchChapter,
        deleteBatch: deleteScriptAdapterBatch,
        connectionRegistry,
        logger: log,
      }),
    };
  },
});
const handleScriptAdapterMessage = createLazyScriptAdapterMessageHandler({
  getRuntime: getScriptAdapterRuntime,
  logger: log,
});
const handleChatRequest = createChatRequestHandler({
  orchestrator,
  contextBuilder,
  chatEngine,
  systemPromptReady,
  session,
  normalizeAssistantText: normalizeFinalAssistantText,
  sendCanvasTransportEvent,
  logger: log,
});
const messageRouter = new MessageRouter({
  slashHandler,
  sessionManager: session,
  chatHandler: handleChatRequest,
});

const PORT = config.PORT;
let SYSTEM_PROMPT = '';


const mcpManager = require('./mcp/manager');
// MCP 初始化（非致命，失败不阻断 Gateway 启动）
mcpManager.init().catch(e => log.warn('MCP 初始化失败（非致命）', { error: e.message }));

const getGatewayCapabilities = createGatewayCapabilitiesProvider({
  config,
  providerRouter,
  mcpManager,
  optionalCapabilitiesProvider: createOptionalCapabilitiesSnapshot({
    config,
    toolLoader,
    mcpManager,
  }),
  logger: log,
});

function normalizeFinalAssistantText(raw) {
  const visible = sanitizeAssistantReply(toUserVisibleAssistantText(raw));
  return typeof visible === 'string' ? visible.trim() : '';
}

const handleTransportHttpRequest = createHttpRequestHandler({
  memory,
  memoryManagementAgent,
  reviewQueueActions,
  toolLoader,
  mcpManager,
  mobileHtmlPath: path.join(__dirname, 'mobile.html'),
});

async function handleTransportMessage(msg, connection) {
  const scriptAdapterHandled = await handleScriptAdapterMessage(msg, connection);
  if (scriptAdapterHandled) return true;

  if (msg?.type === 'req' && msg?.method === 'image.generate') {
    const imageConfig = buildImageGenerationConfig(config);
    await handleImageGenerate(msg.params || {}, imageConfig, (responseMsg) => {
      if (!connection?.isOpen?.()) return;
      connection.send(responseMsg);
    });
    return true;
  }
  await messageRouter.handleRequest(msg, connection);
}

function subscribeConnectionToRunningBatches(connection) {
  if (!getScriptAdapterRuntime.isLoaded()) {
    return;
  }
  const { persistence, connectionRegistry } = getScriptAdapterRuntime();
  for (const batch of persistence.listRunningBatches()) {
    connectionRegistry.subscribe(batch.id, connection);
  }
}

startGatewayMemoryJobs({
  memory,
  memoryTaskQueue,
  memoryManagementAgent,
  reviewQueueMaintenance,
  startMemoryMonitor,
  startScheduler,
  scheduleMemoryHealthCheck,
  scheduleMemoryHeartbeat,
  scheduleReviewQueueMaintenance,
  scheduleMemoryGovernanceReport,
  logger: log,
  memoryLogger: memLog,
  memoryRoot: config.memory?.root,
});

const gatewayTransports = startGatewayTransports({
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
  onHttpRequest: handleTransportHttpRequest,
});

registerTaskBoardBroadcast({ tools, transports: gatewayTransports });

registerGatewayShutdown({
  logger: log,
  stopScheduler,
  transports: gatewayTransports,
});
