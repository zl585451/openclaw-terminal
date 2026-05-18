'use strict';

function buildChatHeaders(baseUrl, apiKey) {
  const target = String(baseUrl || '');
  if (target.includes('aiplatform.googleapis.com')) {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function classifyProbeFailure(message) {
  const m = String(message || '').toLowerCase();
  const unsupportedHints = [
    'tool',
    'function calling',
    'function_call',
    'tool_calls',
    'tool_choice',
    'unrecognized request argument',
    'unknown field',
    'does not support',
    'not supported',
    'invalid parameter',
  ];
  const hasToolHint = unsupportedHints.some((token) => m.includes(token));
  if (hasToolHint) return 'unsupported';
  return 'unknown';
}

async function probeModelToolsSupport({
  provider,
  baseUrl,
  apiKey,
  model,
  config,
  fetchImpl = fetch,
  fetchOptions = {},
}) {
  if (!apiKey || !baseUrl) {
    return { toolsSupport: 'unknown', capabilitySource: 'runtime_probe_skipped' };
  }

  const cached = config?.getProbeCacheEntry?.({
    providerId: provider.id,
    baseUrl,
    modelId: model,
  });
  if (cached?.toolsSupport) return cached;

  const probeToolName = 'oct_capability_probe_noop';
  const endpoint = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
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

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: buildChatHeaders(baseUrl, apiKey),
      body: JSON.stringify(probeBody),
      ...fetchOptions,
    });
    const json = await res.json().catch(() => ({}));
    const choice = json?.choices?.[0] || {};
    const finishReason = String(choice?.finish_reason || '');
    const toolCalls = choice?.message?.tool_calls;
    const toolsSupport = (Array.isArray(toolCalls) && toolCalls.length > 0) || finishReason === 'tool_calls'
      ? 'supported'
      : 'unknown';
    return config?.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    }) || { toolsSupport, capabilitySource: 'runtime_probe' };
  } catch (e) {
    const toolsSupport = classifyProbeFailure(e?.message || String(e));
    return config?.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    }) || { toolsSupport, capabilitySource: 'runtime_probe' };
  }
}

module.exports = {
  buildChatHeaders,
  classifyProbeFailure,
  probeModelToolsSupport,
};
