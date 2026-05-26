'use strict';

const { GoogleGenAI } = require('@google/genai');

const DEFAULT_VERTEX_LOCATION = 'us-central1';
const DEFAULT_API_VERSION = 'v1';
let activeGoogleProxyUrl = '';

function isGoogleNativeMode(rawConfig = {}) {
  const mode = String(
    rawConfig.GOOGLE_API_MODE
    || rawConfig.googleApiMode
    || ''
  ).trim().toLowerCase();
  return mode !== 'openai_compat';
}

function sanitizeGoogleModelId(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return '';
  const withoutPrefix = raw.toLowerCase().startsWith('google/')
    ? raw.slice('google/'.length)
    : raw;
  const aliasMap = {
    'gemini-2.5-pro-preview-03-25': 'gemini-2.5-pro',
    'gemini-2.5-flash-preview-04-17': 'gemini-2.5-flash',
    'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image',
    'gemini-2.0-flash-001': 'gemini-2.0-flash',
    'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
  };
  return aliasMap[withoutPrefix] || withoutPrefix;
}

function parseGoogleVertexFromBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return { project: '', location: '' };
  const match = raw.match(/\/projects\/([^/]+)\/locations\/([^/]+)/i);
  return {
    project: match?.[1] ? decodeURIComponent(match[1]) : '',
    location: match?.[2] ? decodeURIComponent(match[2]) : '',
  };
}

function isGoogleImageModel(modelId) {
  const model = sanitizeGoogleModelId(modelId).toLowerCase();
  return model.includes('flash-image') || model.includes('pro-image');
}

function isImagenModel(modelId) {
  return /^imagen[-.]/i.test(String(sanitizeGoogleModelId(modelId) || ''));
}

function resolveGoogleProxyUrl(rawConfig = {}) {
  return String(
    rawConfig.GOOGLE_HTTPS_PROXY
    || rawConfig.HTTPS_PROXY
    || rawConfig.https_proxy
    || rawConfig.HTTP_PROXY
    || rawConfig.http_proxy
    || ''
  ).trim();
}

function configureGoogleNativeProxy(rawConfig = {}) {
  const proxyUrl = resolveGoogleProxyUrl(rawConfig);
  if (!proxyUrl || proxyUrl === activeGoogleProxyUrl) return false;

  delete process.env.NODE_USE_ENV_PROXY;
  delete process.env.node_use_env_proxy;

  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    activeGoogleProxyUrl = proxyUrl;
    return true;
  } catch (error) {
    console.warn('[GoogleNative] proxy setup skipped:', String(error?.message || error));
    return false;
  }
}

function resolveGoogleClientConfig(rawConfig = {}) {
  configureGoogleNativeProxy(rawConfig);

  const apiKey = String(
    rawConfig.GOOGLE_AI_API_KEY
    || rawConfig.GOOGLE_API_KEY
    || rawConfig.GEMINI_API_KEY
    || ''
  ).trim();
  const baseUrl = String(rawConfig.GOOGLE_AI_BASE_URL || '').trim();
  const parsed = parseGoogleVertexFromBaseUrl(baseUrl);
  const project = String(
    rawConfig.GOOGLE_CLOUD_PROJECT
    || rawConfig.GCLOUD_PROJECT
    || parsed.project
    || ''
  ).trim();
  const location = String(
    rawConfig.GOOGLE_CLOUD_LOCATION
    || rawConfig.GCLOUD_LOCATION
    || parsed.location
    || DEFAULT_VERTEX_LOCATION
  ).trim();
  const apiVersion = String(
    rawConfig.GOOGLE_GENAI_API_VERSION
    || rawConfig.GOOGLE_API_VERSION
    || DEFAULT_API_VERSION
  ).trim();
  const looksVertex = /aiplatform\.googleapis\.com/i.test(baseUrl) || !!project || !!apiKey;
  const useApiKeyExpressMode = !!apiKey;
  const options = {
    vertexai: looksVertex,
    apiVersion: apiVersion || DEFAULT_API_VERSION,
  };
  if (apiKey) options.apiKey = apiKey;
  // Vertex AI Express Mode / API key mode must not pass project/location
  // together in the current @google/genai initializer.
  if (!useApiKeyExpressMode && looksVertex && project) options.project = project;
  if (!useApiKeyExpressMode && looksVertex && location) options.location = location;
  return {
    apiKey,
    baseUrl,
    project,
    location,
    apiVersion: options.apiVersion,
    vertexai: looksVertex,
    useApiKeyExpressMode,
    client: new GoogleGenAI(options),
  };
}

function toGoogleInlineDataFromDataUrl(url) {
  const match = String(url || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
}

function collectFunctionNameMap(messages) {
  const map = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || !Array.isArray(message.tool_calls)) continue;
    for (const toolCall of message.tool_calls) {
      const callId = String(toolCall?.id || '').trim();
      const name = String(toolCall?.function?.name || '').trim();
      if (callId && name) map.set(callId, name);
    }
  }
  return map;
}

function contentToGoogleParts(content) {
  if (typeof content === 'string') {
    const text = String(content || '');
    return text ? [{ text }] : [];
  }
  if (!Array.isArray(content)) return [];

  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && String(part.text || '')) {
      parts.push({ text: String(part.text) });
      continue;
    }
    if (part.type === 'image_url') {
      const imageUrl = part.image_url?.url || part.url || '';
      const inline = toGoogleInlineDataFromDataUrl(imageUrl);
      if (inline) parts.push(inline);
    }
  }
  return parts;
}

function getGoogleThoughtSignature(part) {
  if (!part || typeof part !== 'object') return '';
  return String(
    part.thoughtSignature
    || part.thought_signature
    || part.functionCall?.thoughtSignature
    || part.functionCall?.thought_signature
    || ''
  ).trim();
}

function getToolCallThoughtSignature(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') return '';
  return String(
    toolCall.extra_content?.google_native?.thoughtSignature
    || toolCall.extra_content?.google_native?.thought_signature
    || toolCall.extra_content?.google?.thoughtSignature
    || toolCall.extra_content?.google?.thought_signature
    || ''
  ).trim();
}

function sanitizeGoogleNativePart(part) {
  if (!part || typeof part !== 'object') return null;
  if (part.functionCall && typeof part.functionCall === 'object') {
    const sanitized = {
      functionCall: {
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      },
    };
    const thoughtSignature = getGoogleThoughtSignature(part);
    if (thoughtSignature) sanitized.thoughtSignature = thoughtSignature;
    return sanitized;
  }
  if (part.functionResponse && typeof part.functionResponse === 'object') {
    return {
      functionResponse: {
        name: part.functionResponse.name,
        response: part.functionResponse.response || { output: '' },
      },
    };
  }
  if (part.text || part.inlineData || part.fileData) return part;
  return null;
}

function sanitizeGoogleNativeContent(content) {
  if (!content || typeof content !== 'object') return null;
  const role = content.role === 'model' ? 'model' : 'user';
  const parts = (Array.isArray(content.parts) ? content.parts : [])
    .map(sanitizeGoogleNativePart)
    .filter(Boolean);
  if (parts.length === 0) return null;
  return { role, parts };
}

function convertMessagesToGoogleContents(messages) {
  const contents = [];
  const systemTexts = [];
  const toolNameByCallId = collectFunctionNameMap(messages);

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== 'object') continue;

    if (message.role === 'system') {
      const text = typeof message.content === 'string'
        ? String(message.content || '').trim()
        : contentToGoogleParts(message.content)
          .map((part) => part.text || '')
          .filter(Boolean)
          .join('\n');
      if (text) systemTexts.push(text);
      continue;
    }

    if (message.google_native_content && typeof message.google_native_content === 'object') {
      const sanitized = sanitizeGoogleNativeContent(message.google_native_content);
      if (sanitized) contents.push(sanitized);
      continue;
    }

    if (message.role === 'tool') {
      const callId = String(message.tool_call_id || '').trim();
      const toolName = String(
        message.tool_name
        || toolNameByCallId.get(callId)
        || ''
      ).trim();
      const resultText = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content || '');
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: toolName || undefined,
            response: { output: resultText },
          },
        }],
      });
      continue;
    }

    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts = contentToGoogleParts(message.content);
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const name = String(toolCall?.function?.name || '').trim();
        const callId = String(toolCall?.id || '').trim();
        let args = {};
        try {
          args = JSON.parse(toolCall?.function?.arguments || '{}');
        } catch {}
        if (name) {
          const functionCallPart = {
            functionCall: {
              name,
              args,
            },
          };
          const thoughtSignature = getToolCallThoughtSignature(toolCall);
          if (thoughtSignature) functionCallPart.thoughtSignature = thoughtSignature;
          parts.push(functionCallPart);
        }
      }
    }

    if (parts.length === 0) continue;
    contents.push({ role, parts });
  }

  return {
    contents,
    systemInstruction: systemTexts.join('\n\n').trim(),
  };
}

function convertToolDefinitionsToGoogleTools(definitions) {
  const functionDeclarations = (Array.isArray(definitions) ? definitions : [])
    .map((entry) => entry?.function)
    .filter((fn) => fn && fn.name)
    .map((fn) => ({
      name: fn.name,
      description: fn.description || '',
      parameters: fn.parameters || { type: 'object', properties: {} },
    }));
  return functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : [];
}

function buildGoogleToolConfig(toolChoice) {
  if (!toolChoice || toolChoice === 'auto') return {
    functionCallingConfig: { mode: 'AUTO' },
  };
  if (toolChoice === 'none') return {
    functionCallingConfig: { mode: 'NONE' },
  };
  if (typeof toolChoice === 'object' && toolChoice.function?.name) {
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.function.name],
      },
    };
  }
  return { functionCallingConfig: { mode: 'AUTO' } };
}

function mergeFunctionCalls(acc, nextCalls) {
  const merged = Array.isArray(acc) ? [...acc] : [];
  for (const call of Array.isArray(nextCalls) ? nextCalls : []) {
    if (!call) continue;
    const callId = String(call.id || '');
    const existingIndex = merged.findIndex((item) => String(item?.id || '') === callId && callId);
    const normalized = {
      id: callId || `google-fn-${merged.length}`,
      name: String(call.name || '').trim(),
      args: call.args && typeof call.args === 'object' ? call.args : {},
      thoughtSignature: String(call.thoughtSignature || call.thought_signature || '').trim(),
    };
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...normalized,
        args: {
          ...(merged[existingIndex]?.args || {}),
          ...(normalized.args || {}),
        },
        thoughtSignature: normalized.thoughtSignature || merged[existingIndex]?.thoughtSignature || '',
      };
    } else {
      merged.push(normalized);
    }
  }
  return merged;
}

function normalizeGoogleFunctionCalls(functionCalls) {
  return (Array.isArray(functionCalls) ? functionCalls : []).map((call, index) => {
    const id = String(call?.id || `google-fn-${index}`);
    const thoughtSignature = String(call?.thoughtSignature || call?.thought_signature || '').trim();
    return {
      id,
      type: 'function',
      function: {
        name: String(call?.name || ''),
        arguments: JSON.stringify(call?.args || {}),
      },
      extra_content: {
        google_native: {
          id,
          ...(thoughtSignature
            ? { thoughtSignature, thought_signature: thoughtSignature }
            : {}),
        },
      },
    };
  });
}

function extractFunctionCallsFromChunk(chunk) {
  const fromParts = [];
  const candidates = Array.isArray(chunk?.candidates) ? chunk.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (!part?.functionCall) continue;
      fromParts.push({
        ...part.functionCall,
        thoughtSignature: getGoogleThoughtSignature(part),
      });
    }
  }
  if (fromParts.length > 0) return fromParts;
  return Array.isArray(chunk?.functionCalls) ? chunk.functionCalls : [];
}

function usageToOpenAiShape(usageMetadata) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return null;
  const promptTokens = Number(usageMetadata.promptTokenCount || 0);
  const completionTokens = Number(usageMetadata.candidatesTokenCount || 0);
  const totalTokens = Number(usageMetadata.totalTokenCount || (promptTokens + completionTokens) || 0);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    extra_properties: {
      google: usageMetadata,
    },
  };
}

async function generateNativeChat({
  rawConfig,
  messages,
  model,
  toolDefinitions = [],
  toolChoice = 'auto',
  onDelta,
}) {
  const clientConfig = resolveGoogleClientConfig(rawConfig);
  const normalizedModel = sanitizeGoogleModelId(model);
  if (!normalizedModel) {
    throw new Error('Google 模型未配置');
  }
  if (isGoogleImageModel(normalizedModel) || isImagenModel(normalizedModel)) {
    throw new Error(`模型 ${normalizedModel} 属于图像模型，请改用 image.generate 链路`);
  }

  const { contents, systemInstruction } = convertMessagesToGoogleContents(messages);
  const tools = convertToolDefinitionsToGoogleTools(toolDefinitions);
  const request = {
    model: normalizedModel,
    contents,
    config: {
      systemInstruction: systemInstruction || undefined,
      tools: tools.length > 0 ? tools : undefined,
      toolConfig: tools.length > 0 ? buildGoogleToolConfig(toolChoice) : undefined,
    },
  };

  const stream = await clientConfig.client.models.generateContentStream(request);
  let fullText = '';
  let functionCalls = [];
  let usage = null;

  for await (const chunk of stream) {
    if (typeof chunk?.text === 'string' && chunk.text) {
      fullText += chunk.text;
      if (onDelta) onDelta(chunk.text);
    }
    const chunkFunctionCalls = extractFunctionCallsFromChunk(chunk);
    if (chunkFunctionCalls.length > 0) {
      functionCalls = mergeFunctionCalls(functionCalls, chunkFunctionCalls);
    }
    if (chunk?.usageMetadata) {
      usage = usageToOpenAiShape(chunk.usageMetadata);
    }
  }

  const normalizedToolCalls = normalizeGoogleFunctionCalls(functionCalls);
  const assistantParts = [];
  if (fullText) assistantParts.push({ text: fullText });
  for (const call of functionCalls) {
    const functionCallPart = {
      functionCall: {
        name: call.name,
        args: call.args || {},
      },
    };
    const thoughtSignature = String(call.thoughtSignature || call.thought_signature || '').trim();
    if (thoughtSignature) functionCallPart.thoughtSignature = thoughtSignature;
    assistantParts.push(functionCallPart);
  }

  return {
    text: fullText,
    usage,
    responseModel: normalizedModel,
    toolCalls: normalizedToolCalls,
    assistantResponseMessage: {
      role: 'assistant',
      content: fullText,
      tool_calls: normalizedToolCalls,
      google_native_content: assistantParts.length > 0
        ? { role: 'model', parts: assistantParts }
        : undefined,
    },
  };
}

function buildGoogleImagePrompt(payload) {
  const prompt = String(payload?.prompt || '').trim();
  const negative = String(payload?.negativePrompt || payload?.negative_prompt || '').trim();
  return negative ? `${prompt}\n\nAvoid: ${negative}` : prompt;
}

function toDataUrl(base64, mimeType) {
  if (!base64) return '';
  return `data:${mimeType || 'image/png'};base64,${base64}`;
}

async function generateNativeImage({
  rawConfig,
  payload,
  fallbackModel,
  aspectRatio,
}) {
  const clientConfig = resolveGoogleClientConfig(rawConfig);
  const model = sanitizeGoogleModelId(
    payload?.model
    || rawConfig.IMAGE_MODEL
    || rawConfig.IMAGE_GOOGLE_MODEL
    || fallbackModel
    || 'gemini-2.5-flash-image'
  );
  const prompt = buildGoogleImagePrompt(payload);
  if (!prompt) throw new Error('提示词不能为空');

  if (isImagenModel(model)) {
    const response = await clientConfig.client.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: Math.min(Math.max(Number(payload?.n || 1), 1), 4),
        aspectRatio: aspectRatio || '1:1',
        includeRaiReason: true,
      },
    });
    const images = (Array.isArray(response?.generatedImages) ? response.generatedImages : [])
      .map((item) => item?.image)
      .filter(Boolean)
      .map((image) => ({
        mimeType: image.mimeType || 'image/png',
        data: image.imageBytes || '',
        dataUrl: toDataUrl(image.imageBytes || '', image.mimeType || 'image/png'),
        gcsUri: image.gcsUri || '',
      }))
      .filter((item) => item.dataUrl || item.gcsUri);
    if (images.length === 0) {
      throw new Error(`Imagen 未返回图片数据（model=${model}）`);
    }
    return { model, images };
  }

  const response = await clientConfig.client.models.generateContent({
    model,
    contents: [prompt],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });
  const directParts = Array.isArray(response?.parts) ? response.parts : [];
  const candidateParts = Array.isArray(response?.candidates)
    ? response.candidates.flatMap((candidate) => (
      Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    ))
    : [];
  const images = [...directParts, ...candidateParts]
    .map((part) => part?.inlineData || part?.inline_data || null)
    .filter(Boolean)
    .map((inlineData) => ({
      mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png',
      data: inlineData.data || '',
      dataUrl: toDataUrl(inlineData.data || '', inlineData.mimeType || inlineData.mime_type || 'image/png'),
    }))
    .filter((item) => item.dataUrl);
  if (images.length === 0) {
    throw new Error(`Gemini 图像模型未返回图片数据（model=${model}）`);
  }
  return { model, images };
}

module.exports = {
  isGoogleNativeMode,
  sanitizeGoogleModelId,
  parseGoogleVertexFromBaseUrl,
  isGoogleImageModel,
  isImagenModel,
  resolveGoogleClientConfig,
  resolveGoogleProxyUrl,
  configureGoogleNativeProxy,
  convertMessagesToGoogleContents,
  convertToolDefinitionsToGoogleTools,
  normalizeGoogleFunctionCalls,
  generateNativeChat,
  generateNativeImage,
  _internals: {
    buildGoogleToolConfig,
    mergeFunctionCalls,
    extractFunctionCallsFromChunk,
    sanitizeGoogleNativeContent,
    usageToOpenAiShape,
    toGoogleInlineDataFromDataUrl,
  },
};
