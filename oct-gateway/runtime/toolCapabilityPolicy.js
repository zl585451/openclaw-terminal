const noop = () => {};
const defaultLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function resolveLogger(logger) {
  return logger && typeof logger === 'object'
    ? {
        debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : noop,
        info: typeof logger.info === 'function' ? logger.info.bind(logger) : noop,
        warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop,
        error: typeof logger.error === 'function' ? logger.error.bind(logger) : noop,
      }
    : defaultLogger;
}

async function probeModelToolsSupport({
  provider,
  baseUrl,
  apiKey,
  model,
  config,
  fetchWithRetry,
  buildChatHeaders,
  classifyProbeFailure,
  googleHttpsProxy,
  logger,
}) {
  if (!apiKey || !baseUrl) {
    return { toolsSupport: 'unknown', capabilitySource: 'runtime_probe_skipped' };
  }
  const cached = config.getProbeCacheEntry?.({
    providerId: provider.id,
    baseUrl,
    modelId: model,
  });
  if (cached?.toolsSupport) return cached;

  const log = resolveLogger(logger);
  const probeToolName = 'oct_capability_probe_noop';
  const probeBody = {
    model,
    stream: false,
    max_tokens: 1,
    messages: [
      { role: 'system', content: 'You are running a capability probe.' },
      { role: 'user', content: 'Call the probe function now.' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: probeToolName,
          description: 'Capability probe noop tool.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    tool_choice: {
      type: 'function',
      function: { name: probeToolName },
    },
  };

  const endpoint = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
  try {
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: buildChatHeaders(baseUrl, apiKey),
      body: JSON.stringify(probeBody),
    }, {
      maxRetries: 0,
      logger: log,
      googleHttpsProxy,
    });
    const json = await response.json().catch(() => ({}));
    const choice = json?.choices?.[0] || {};
    const finishReason = choice?.finish_reason || '';
    const toolCalls = choice?.message?.tool_calls || [];
    const toolsSupport = (Array.isArray(toolCalls) && toolCalls.length > 0) || finishReason === 'tool_calls'
      ? 'supported'
      : 'unknown';
    return config.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    }) || { toolsSupport, capabilitySource: 'runtime_probe' };
  } catch (error) {
    const toolsSupport = classifyProbeFailure(error?.message || String(error));
    return config.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    }) || { toolsSupport, capabilitySource: 'runtime_probe' };
  }
}

function hasUnverifiedExecutionNarrative(text) {
  const source = String(text || '');
  if (!source.trim()) return false;
  const alreadyHonest = /无法(直接)?(调用|使用)工具|不支持工具|不能(联网|调用工具)|未触发工具调用/.test(source);
  if (alreadyHonest) return false;

  const patterns = [
    /我(去|来)?查(一下|下)?/i,
    /我(将|会|正在|先)?调用(工具|搜索|查询|检索|web_search|read_file|memory_search)/i,
    /正在(调用工具|搜索|查询|检索|联网查)/i,
    /已(调用|执行)(了)?(工具|搜索|查询|检索)/i,
    /\b(let me|i('| wi)?ll|i am)\s+(search|look up|call|use)\b/i,
  ];
  return patterns.some((re) => re.test(source));
}

function enforceExecutionContract({ text, supportsTools, hasToolEvidence }) {
  const source = String(text || '');
  if (!source.trim()) return source;
  if (hasToolEvidence) return source;
  if (!hasUnverifiedExecutionNarrative(source)) return source;

  if (!supportsTools) {
    return `当前模型不支持工具执行，我会基于现有上下文直接回答。\n\n${source}`;
  }
  return `本轮未触发可验证的工具调用，先基于现有信息继续回答。\n\n${source}`;
}

function buildClarifyCapabilityRule(toolsSupport) {
  if (toolsSupport === 'supported') {
    return `## 澄清询问器（工具路径）

当你需要一次性收集用户多个维度的结构化信息时，优先调用 \`request_clarify\` 工具，不要输出 [clarify_card] 文本标签。

调用规则：
- 字段最多 4 个，field.label 必须是完整问句
- 工具返回 waiting_user_reply 后立即停止输出，等待下一轮用户消息（通常以 [澄清回执] 开头）
- 一次对话只调用一次该工具，不要连续追问
- 收到 [澄清回执] 后继续执行任务；用户跳过字段可用合理默认值并在开头说明假设`;
  }

  return `## 澄清询问器（文本路径）

当你需要一次性收集用户多个维度的结构化信息时，用 [clarify_card]...[/clarify_card] 输出 JSON。

格式规则：
- 字段最多 4 个，field.label 必须是完整问句
- 结构：{ "fields": [{ "id", "label", "type", "options?", "allow_custom?", "placeholder?" }] }
- type 仅可用：single / multi / text / confirm
- 一次对话只输出一张卡片，不连续追问
- 收到 [澄清回执] 后继续执行任务；用户跳过字段可用合理默认值并在开头说明假设`;
}

function injectClarifyCapabilityMessage(messages, toolsSupport) {
  const list = Array.isArray(messages) ? messages : [];
  const exists = list.some((msg) => {
    if (!msg || msg.role !== 'system' || typeof msg.content !== 'string') return false;
    return msg.content.includes('## 澄清询问器（工具路径）') || msg.content.includes('## 澄清询问器（文本路径）');
  });
  if (exists) return list;
  return [
    ...list,
    { role: 'system', content: buildClarifyCapabilityRule(toolsSupport) },
  ];
}

function canAttemptTools(caps) {
  if (!caps || caps.toolReliability === 'none') {
    return false;
  }
  return caps.toolsSupport !== 'unsupported';
}

function normalizeMessagesForProvider(messages, providerId, model) {
  const list = Array.isArray(messages) ? messages : [];
  const modelName = String(model || '').toLowerCase();
  const isMiniMax = providerId === 'minimax' || modelName.includes('minimax');
  if (!isMiniMax) return list;

  const systemText = list
    .filter((msg) => msg?.role === 'system' && typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => msg.content.trim())
    .join('\n\n');
  if (!systemText) return list;

  const nonSystemMessages = list.filter((msg) => msg?.role !== 'system');
  const firstUserIndex = nonSystemMessages.findIndex((msg) => msg?.role === 'user');
  const prefix = `【系统指令】\n${systemText}\n\n【用户消息】\n`;

  if (firstUserIndex < 0) {
    return [{ role: 'user', content: prefix.trim() }, ...nonSystemMessages];
  }

  return nonSystemMessages.map((msg, index) => {
    if (index !== firstUserIndex) return msg;
    if (typeof msg.content === 'string') {
      return { ...msg, content: `${prefix}${msg.content}` };
    }
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: [{ type: 'text', text: prefix.trim() }, ...msg.content],
      };
    }
    return { ...msg, content: `${prefix}${String(msg.content || '')}` };
  });
}

module.exports = {
  probeModelToolsSupport,
  enforceExecutionContract,
  injectClarifyCapabilityMessage,
  canAttemptTools,
  normalizeMessagesForProvider,
  _internals: {
    hasUnverifiedExecutionNarrative,
    buildClarifyCapabilityRule,
  },
};
