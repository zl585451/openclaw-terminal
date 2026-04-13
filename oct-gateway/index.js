const path = require('path');
const config = require('./config');
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
  scheduleNocturneHeartbeat,
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
const { createStreamSmoother } = require('./runtime/streamUtils');
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
const nocturneQueue = require('./nocturne_task_queue');
const mem0Client = require('./mem0_client');
const aiLibrary = require('./tools/ai_library');
const orchestrator = require('./orchestrator');
const contextManager = require('./context_manager');
const taskQueue = require('./task_queue');
const { handleImageGenerate } = require('./image_gen');
const { createLogger } = require('./logger');
const { scheduleMemoryHealthCheck } = require('./services/startupHealth');
const log = createLogger('gateway');
const memLog = createLogger('mem');

const systemPromptReady = (async () => {
  SYSTEM_PROMPT = await loadSystemPrompt(config.PROMPTS_DIR);
  log.info('System prompt loaded', { len: SYSTEM_PROMPT.length });
  taskQueue.checkTimeouts();
  taskQueue.cleanup();
  memoryHistory.cleanupOldHistory().catch(() => {});
  memorySearch.warmGlossaryCache().catch(() => {});
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
  nocturneQueue,
  mem0Client,
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
  nocturneQueue,
  memoryGovernor,
  contextManager,
  aiLibrary,
  hypothesis,
  imageService,
  config,
  mem0Client,
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

const PORT = config.PORT;
let SYSTEM_PROMPT = '';


const mcpManager = require('./mcp/manager');
// MCP 初始化（非致命，失败不阻断 Gateway 启动）
mcpManager.init().catch(e => log.warn('MCP 初始化失败（非致命）', { error: e.message }));

scheduleMemoryHealthCheck({
  memory,
  logger: log,
});

scheduleNocturneHeartbeat({
  config,
  memory,
  nocturneQueue,
  logger: log,
});

scheduleReviewQueueMaintenance({
  nocturneQueue,
  reviewQueueMaintenance,
  logger: log,
});

scheduleMemoryGovernanceReport({
  nocturneQueue,
  memoryManagementAgent,
  logger: log,
});

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
  const sessionKey = params?.sessionKey || 'main';
  const userMessage = params?.message || '';
  const attachments = params?.attachments || [];
  const workbenchContext = params?.workbenchContext || params?.canvasContext || null;

  const sendToolEvent = (evt) => {
    if (!connection.isOpen()) return;
    if ((evt?.type === 'workbench' || evt?.type === 'canvas') && evt.action) {
      sendCanvasTransportEvent(connection, evt.action, evt.payload || {}, evt.type === 'workbench' ? 'workbench' : 'canvas');
      return;
    }
    connection.send({ type: 'event', event: 'tool', payload: evt });
    if (evt.type === 'tool_call') {
      connection.send({ type: 'event', event: 'agent-phase', phase: 'tool_executing', tool: evt.tool });
    }
    if (evt.type === 'tool_result') {
      connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
    }
  };

  const orchResult = await orchestrator.dispatch(userMessage, sessionKey, sendToolEvent);

  const systemPrompt = await systemPromptReady;
  const { messages, history } = await contextBuilder.build({
    sessionKey,
    userMessage,
    attachments,
    workbenchContext,
    orchestratorResult: orchResult,
    systemPrompt,
  });

  connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
  connection.startThinkingPulse?.(8000);
  connection.abortCurrent?.();
  let cancelled = false;
  connection.setAbort?.(() => { cancelled = true; });

  const prevAssistantReplyForPost = history.filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';

  await chatEngine.execute({
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
      connection.send({
        type: 'event',
        event: 'chat',
        payload: { delta: chunk, state: 'delta', done: false },
      });
    },
    onToolEvent: sendToolEvent,
    onBeforeDone: () => {
      connection.setAbort?.(null);
      connection.stopThinkingPulse?.();
    },
    onDone: ({ reply, usage, model: responseModel }) => {
      if (cancelled || !connection.isOpen()) return;
      const donePayload = { text: reply, state: 'done', done: true };
      if (usage) donePayload.usage = usage;
      if (responseModel) donePayload.model = responseModel;
      connection.send({ type: 'event', event: 'chat', payload: donePayload });
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
    },
    onError: (err) => {
      if (cancelled) return;
      connection.setAbort?.(null);
      connection.stopThinkingPulse?.();
      log.error('AI error', { error: err?.message || String(err) });
      if (!connection.isOpen()) return;
      connection.send({
        type: 'event',
        event: 'chat',
        payload: { text: `❌ AI 调用失败：${err.message}`, state: 'done', done: true },
      });
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
    },
  });
}

async function handleTransportMessage(msg, connection) {
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
      IMAGE_API_KEY: config.getEnvOrConfig('IMAGE_API_KEY') || '',
      IMAGE_BASE_URL: imageBaseUrl,
      IMAGE_MODEL: config.getEnvOrConfig('IMAGE_MODEL') || (
        imgProvider === 'siliconflow' ? 'Kwai-Kolors/Kolors'
          : imgProvider === 'openai' ? 'dall-e-3'
            : 'image-01'
      ),
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

startMemoryMonitor({ logger: memLog });

const wsTransport = new WsTransport({
  port: PORT,
  logger: log,
  modelProvider: () => config.DASHSCOPE_MODEL,
  authTokenProvider: () => process.env.OCT_GATEWAY_TOKEN || '',
  onAuthenticatedMessage: handleTransportMessage,
}).start();

const httpTransport = new HttpTransport({
  port: HTTP_PORT,
  logger: log,
  onRequest: handleTransportHttpRequest,
}).start();

if (tools.setOnTaskBoardUpdate) {
  tools.setOnTaskBoardUpdate(() => {
    wsTransport.broadcast({ type: 'event', event: 'task-board-update' });
  });
}


process.on('SIGINT', () => {
  log.info('shutting down');
  httpTransport?.close();
  wsTransport?.close(() => process.exit(0));
});
