/**
 * OCT ImageStudio 生图处理器
 * 支持独立 image.generate 旁路，不进入 chat.send 上下文。
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const {
  isGoogleNativeMode,
  generateNativeImage,
} = require('./services/googleNative');

/** 生图 HTTP 超时（硅基 / 部分模型可能超过 60s），可通过环境变量覆盖 */
const DEFAULT_IMAGE_HTTP_TIMEOUT_MS = Number(process.env.OCT_IMAGE_HTTP_TIMEOUT_MS || 180000);

function normalizeBaseUrl(rawBaseUrl, fallback) {
  const base = String(rawBaseUrl || '').trim() || String(fallback || '').trim();
  return base.replace(/\/+$/, '');
}

function joinUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl, '');
  const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  return `${base}${suffix}`;
}

function stripTrailingV1(baseUrl) {
  return normalizeBaseUrl(baseUrl, '').replace(/\/v1$/i, '');
}

function sizeToAspectRatio(sizeStr) {
  const map = {
    '1024x1024': '1:1',
    '1280x720': '16:9',
    '720x1280': '9:16',
    '1152x864': '4:3',
    '864x1152': '3:4',
    '1248x832': '3:2',
    '832x1248': '2:3',
    '1344x576': '21:9',
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
    '3:2': '3:2',
    '2:3': '2:3',
    '21:9': '21:9',
  };
  return map[String(sizeStr || '').trim()] || '1:1';
}

function aspectRatioToSize(aspectRatio) {
  const map = {
    '1:1': '1024x1024',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1344x576',
  };
  return map[String(aspectRatio || '').trim()] || '1024x1024';
}

function resolveRequestedAspectRatio(payload, config) {
  const raw = String(payload?.aspectRatio || '').trim();
  if (raw) return raw;
  return sizeToAspectRatio(config.IMAGE_SIZE || '1024x1024');
}

function resolveRequestedSize(payload, config) {
  const customWidth = Number(payload?.width);
  const customHeight = Number(payload?.height);
  if (customWidth > 0 && customHeight > 0) {
    return `${customWidth}x${customHeight}`;
  }
  return aspectRatioToSize(resolveRequestedAspectRatio(payload, config));
}

function resolveCustomDimensions(payload) {
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  const valid = Number.isFinite(width) && Number.isFinite(height)
    && width >= 512 && width <= 2048 && height >= 512 && height <= 2048
    && width % 8 === 0 && height % 8 === 0;
  if (!valid) return null;
  return { width, height };
}

function buildPrompt(payload) {
  const base = String(payload?.prompt || '').trim();
  const styleHints = {
    photoreal: 'photorealistic, realistic lighting, natural materials',
    illustration: 'illustration style, clean shapes, crafted details',
    cinematic: 'cinematic composition, dramatic lighting, film still aesthetic',
    concept: 'concept art, imaginative design language, production-quality details',
  };
  const styleHint = styleHints[String(payload?.stylePreset || '').trim()] || '';
  const qualityHint = payload?.quality === 'high' ? 'high detail, refined textures, polished finish' : '';
  return [base, styleHint, qualityHint].filter(Boolean).join(', ');
}

function isSiliconFlowBaseUrl(urlStr) {
  return /siliconflow\.(cn|com)/i.test(String(urlStr || ''));
}

function asBool(input) {
  if (typeof input === 'boolean') return input;
  if (typeof input !== 'string') return false;
  return /^(true|1|yes|on)$/i.test(input.trim());
}

function normalizeProvider(rawProvider) {
  const provider = String(rawProvider || '').trim().toLowerCase();
  if (provider === 'siliconflow') return 'siliconflow';
  if (provider === 'openai') return 'openai';
  if (provider === 'google') return 'google';
  return 'minimax';
}

function httpPost(urlStr, headers, body, timeoutMs = DEFAULT_IMAGE_HTTP_TIMEOUT_MS) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_IMAGE_HTTP_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyStr = JSON.stringify(body);
    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: ms,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsedData = null;
        try {
          parsedData = data ? JSON.parse(data) : {};
        } catch {
          reject(new Error(`HTTP ${res.statusCode || '???'} @ ${urlStr} — JSON parse error: ${String(data).slice(0, 200)}`));
          return;
        }
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode} @ ${urlStr}: ${JSON.stringify(parsedData).slice(0, 300)}`));
          return;
        }
        resolve(parsedData);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (${Math.round(ms / 1000)}s)`));
    });
    req.write(bodyStr);
    req.end();
  });
}

function resolveProviderError(result) {
  const statusCode = Number(result?.base_resp?.status_code);
  const statusMsg = String(result?.base_resp?.status_msg || '').trim();
  if (!statusCode || statusCode === 0) return null;

  if (statusCode === 1026 || /new_sensitive/i.test(statusMsg)) {
    return '提示词被服务商安全策略拦截，请去掉敏感、暴力、惊悚过强或违规描述后重试。';
  }

  return `生图服务返回错误：${statusMsg || `status_code=${statusCode}`}`;
}

async function minimaxAdapter(payload, config) {
  const rawBaseUrl = normalizeBaseUrl(config.IMAGE_BASE_URL, 'https://api.minimax.chat');
  const baseUrl = stripTrailingV1(rawBaseUrl);
  const url = joinUrl(baseUrl, '/v1/image_generation');
  const dimensions = resolveCustomDimensions(payload);
  const body = {
    model: config.IMAGE_MODEL || 'image-01',
    prompt: buildPrompt(payload),
    negative_prompt: payload.negativePrompt || '',
    response_format: 'url',
    n: 1,
    prompt_optimizer: payload?.promptOptimizer === true,
    aigc_watermark: payload?.aigcWatermark === true,
  };

  if (payload?.seed !== undefined && payload?.seed !== null && String(payload.seed).trim() !== '') {
    const seed = Number(payload.seed);
    if (Number.isFinite(seed)) body.seed = seed;
  }

  if (dimensions) {
    body.width = dimensions.width;
    body.height = dimensions.height;
  } else {
    body.aspect_ratio = resolveRequestedAspectRatio(payload, config);
  }

  const result = await httpPost(url, { Authorization: `Bearer ${config.resolvedApiKey}` }, body);
  const providerError = resolveProviderError(result);
  if (providerError) {
    throw new Error(providerError);
  }
  const imageUrls = [
    ...(Array.isArray(result?.data?.image_urls) ? result.data.image_urls : []),
    ...(Array.isArray(result?.data) ? result.data.map((item) => item?.url).filter(Boolean) : []),
    ...(Array.isArray(result?.data?.images) ? result.data.images.map((item) => item?.url).filter(Boolean) : []),
    result?.image_url,
    result?.data?.image_url,
    result?.output?.image_url,
  ].filter(Boolean);

  if (!imageUrls.length) {
    throw new Error(`MiniMax 未返回图片 URL。响应：${JSON.stringify(result).slice(0, 300)}`);
  }
  return imageUrls;
}

async function openaiAdapter(payload, config) {
  const rawBaseUrl = normalizeBaseUrl(config.IMAGE_BASE_URL, 'https://api.openai.com');
  const baseUrl = stripTrailingV1(rawBaseUrl);
  const url = joinUrl(baseUrl, '/v1/images/generations');
  const body = {
    model: config.IMAGE_MODEL || 'dall-e-3',
    prompt: buildPrompt(payload),
    n: 1,
    size: resolveRequestedSize(payload, config),
    response_format: 'url',
  };

  const result = await httpPost(url, { Authorization: `Bearer ${config.resolvedApiKey}` }, body);
  const providerError = resolveProviderError(result);
  if (providerError) {
    throw new Error(providerError);
  }
  const imageUrls = Array.isArray(result?.data)
    ? result.data.map((item) => item?.url).filter(Boolean)
    : [];
  if (!imageUrls.length) {
    throw new Error(`接口未返回图片 URL。响应：${JSON.stringify(result).slice(0, 300)}`);
  }
  return imageUrls;
}

/**
 * 硅基流动 /images/generations：请求体为 image_size、batch_size 等，与 OpenAI DALL·E 的 size 字段不同；
 * 响应为 { images: [{ url }] }，而非 { data: [{ url }] }。
 * 文档：https://docs.siliconflow.cn/cn/api-reference/images/images-generations
 */
async function siliconflowAdapter(payload, config) {
  const baseUrl = String(config.IMAGE_BASE_URL || 'https://api.siliconflow.cn/v1').trim().replace(/\/$/, '');
  const url = `${baseUrl}/images/generations`;
  const dimensions = resolveCustomDimensions(payload);
  const imageSize = dimensions
    ? `${dimensions.width}x${dimensions.height}`
    : resolveRequestedSize(payload, config);

  const body = {
    model: config.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
    prompt: buildPrompt(payload),
    image_size: imageSize,
    batch_size: 1,
    num_inference_steps: 20,
    guidance_scale: 7.5,
  };

  const neg = String(payload?.negativePrompt || '').trim();
  if (neg) body.negative_prompt = neg;

  if (payload?.seed !== undefined && payload?.seed !== null && String(payload.seed).trim() !== '') {
    const seed = Number(payload.seed);
    if (Number.isFinite(seed)) body.seed = seed;
  }

  const result = await httpPost(url, { Authorization: `Bearer ${config.resolvedApiKey}` }, body);

  const fromImages = Array.isArray(result?.images)
    ? result.images.map((item) => item?.url).filter(Boolean)
    : [];
  const fromData = Array.isArray(result?.data)
    ? result.data.map((item) => item?.url).filter(Boolean)
    : [];
  const imageUrls = [...fromImages, ...fromData].filter(Boolean);

  if (!imageUrls.length) {
    throw new Error(`硅基流动未返回图片 URL。响应：${JSON.stringify(result).slice(0, 400)}`);
  }
  return imageUrls;
}

function resolveImageRuntimeConfig(rawConfig) {
  const provider = normalizeProvider(rawConfig.IMAGE_PROVIDER);
  const allowFallbackToChat = asBool(rawConfig.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY);

  const scopedApiKeySource = provider === 'openai'
    ? rawConfig.IMAGE_OPENAI_API_KEY
    : provider === 'google'
      ? rawConfig.IMAGE_GOOGLE_API_KEY
    : provider === 'siliconflow'
      ? rawConfig.IMAGE_SILICONFLOW_API_KEY
      : rawConfig.IMAGE_MINIMAX_API_KEY;
  const scopedBaseUrlSource = provider === 'openai'
    ? rawConfig.IMAGE_OPENAI_BASE_URL
    : provider === 'google'
      ? rawConfig.IMAGE_GOOGLE_BASE_URL
    : provider === 'siliconflow'
      ? rawConfig.IMAGE_SILICONFLOW_BASE_URL
      : rawConfig.IMAGE_MINIMAX_BASE_URL;
  const scopedModelSource = provider === 'openai'
    ? rawConfig.IMAGE_OPENAI_MODEL
    : provider === 'google'
      ? rawConfig.IMAGE_GOOGLE_MODEL
    : provider === 'siliconflow'
      ? rawConfig.IMAGE_SILICONFLOW_MODEL
      : rawConfig.IMAGE_MINIMAX_MODEL;

  const scopedApiKey = String(scopedApiKeySource || '').trim();
  const scopedBaseUrl = String(scopedBaseUrlSource || '').trim();
  const scopedModel = String(scopedModelSource || '').trim();

  const legacyApiKey = String(rawConfig.IMAGE_API_KEY || '').trim();
  const legacyBaseUrl = String(rawConfig.IMAGE_BASE_URL || '').trim();
  const legacyModel = String(rawConfig.IMAGE_MODEL || '').trim();

  let fallbackChatKey = '';
  if (allowFallbackToChat) {
    if (provider === 'minimax') {
      fallbackChatKey = String(rawConfig.MINIMAX_API_KEY || rawConfig.DASHSCOPE_API_KEY || '').trim();
    } else if (provider === 'google') {
      fallbackChatKey = String(
        rawConfig.GOOGLE_AI_API_KEY
        || rawConfig.GOOGLE_API_KEY
        || rawConfig.GEMINI_API_KEY
        || ''
      ).trim();
    } else {
      fallbackChatKey = String(
        rawConfig.CUSTOM_API_KEY
        || rawConfig.DASHSCOPE_API_KEY
        || rawConfig.DEEPSEEK_API_KEY
        || rawConfig.MINIMAX_API_KEY
        || '',
      ).trim();
    }
  }

  const baseDefaults = {
    minimax: 'https://api.minimax.chat',
    siliconflow: 'https://api.siliconflow.cn/v1',
    openai: 'https://api.openai.com',
    google: String(rawConfig.GOOGLE_AI_BASE_URL || '').trim(),
  };
  const modelDefaults = {
    minimax: 'image-01',
    siliconflow: 'Kwai-Kolors/Kolors',
    openai: 'dall-e-3',
    google: 'gemini-3.1-flash-image-preview',
  };

  return {
    ...rawConfig,
    IMAGE_PROVIDER: provider,
    IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: allowFallbackToChat,
    IMAGE_BASE_URL: scopedBaseUrl || legacyBaseUrl || baseDefaults[provider],
    IMAGE_MODEL: scopedModel || legacyModel || modelDefaults[provider],
    resolvedApiKey:
      provider === 'google'
        ? (scopedApiKey || legacyApiKey || String(rawConfig.GOOGLE_AI_API_KEY || rawConfig.GOOGLE_API_KEY || rawConfig.GEMINI_API_KEY || '').trim() || fallbackChatKey)
        : (scopedApiKey || legacyApiKey || fallbackChatKey),
  };
}

async function handleImageGenerate(payload, rawConfig, sendToClient) {
  const requestId = payload?.requestId || `img_${Date.now()}`;
  const prompt = String(payload?.prompt || '').trim();
  const config = resolveImageRuntimeConfig(rawConfig || {});
  const resolvedApiKey = String(config.resolvedApiKey || '').trim();

  if (!resolvedApiKey) {
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: {
        requestId,
        error: config.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY
          ? '未配置可用的生图 API Key，请检查生图服务商独立 Key 或聊天 Key。'
          : '未配置生图 API Key（当前未启用回退聊天 Key），请先在设置中填写生图服务商独立 Key。',
      },
    });
    return;
  }

  if (!prompt) {
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: { requestId, error: '提示词不能为空' },
    });
    return;
  }

  const requestConfig = { ...config, resolvedApiKey };
  sendToClient({
    type: 'res',
    method: 'image.generate',
    ok: true,
    payload: { requestId, status: 'generating', message: '正在生成图片...' },
  });

  try {
    const provider = normalizeProvider(config.IMAGE_PROVIDER);
    const baseHint = String(requestConfig.IMAGE_BASE_URL || '').trim();
    const useSiliconflow = provider === 'siliconflow'
      || (provider === 'openai' && isSiliconFlowBaseUrl(baseHint));

    let imageUrls;
    if (provider === 'google') {
      if (!isGoogleNativeMode(requestConfig)) {
        throw new Error('Google 生图仅支持原生 SDK 模式，请移除 GOOGLE_API_MODE=openai_compat');
      }
      const result = await generateNativeImage({
        rawConfig: {
          ...rawConfig,
          GOOGLE_AI_API_KEY: requestConfig.resolvedApiKey || rawConfig.GOOGLE_AI_API_KEY || '',
          GOOGLE_AI_BASE_URL: requestConfig.IMAGE_BASE_URL || rawConfig.GOOGLE_AI_BASE_URL || '',
          IMAGE_MODEL: requestConfig.IMAGE_MODEL || '',
          GOOGLE_API_MODE: rawConfig.GOOGLE_API_MODE || 'native',
          GOOGLE_CLOUD_PROJECT: rawConfig.GOOGLE_CLOUD_PROJECT || '',
          GOOGLE_CLOUD_LOCATION: rawConfig.GOOGLE_CLOUD_LOCATION || '',
          GOOGLE_GENAI_API_VERSION: rawConfig.GOOGLE_GENAI_API_VERSION || '',
        },
        payload: {
          ...payload,
          model: requestConfig.IMAGE_MODEL || payload?.model,
          negativePrompt: payload?.negativePrompt || payload?.negative_prompt || '',
        },
        fallbackModel: requestConfig.IMAGE_MODEL || 'gemini-3.1-flash-image-preview',
        aspectRatio: resolveRequestedAspectRatio(payload, requestConfig),
      });
      imageUrls = result.images.map((item) => item.dataUrl || item.gcsUri).filter(Boolean);
    } else if (provider === 'minimax') {
      imageUrls = await minimaxAdapter({ ...payload, prompt }, requestConfig);
    } else if (useSiliconflow) {
      const merged = {
        ...requestConfig,
        IMAGE_BASE_URL: baseHint || requestConfig.IMAGE_BASE_URL || 'https://api.siliconflow.cn/v1',
      };
      imageUrls = await siliconflowAdapter({ ...payload, prompt }, merged);
    } else {
      imageUrls = await openaiAdapter({ ...payload, prompt }, requestConfig);
    }

    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: true,
      payload: {
        requestId,
        status: 'done',
        imageUrl: imageUrls[0],
        imageUrls,
        prompt,
        negativePrompt: String(payload?.negativePrompt || ''),
        numImages: imageUrls.length,
        aspectRatio: resolveRequestedAspectRatio(payload, requestConfig),
      },
    });
  } catch (err) {
    const message = String(err?.message || '生图请求失败，请检查 API Key、模型和网络配置');
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: {
        requestId,
        error: message.length > 220 ? `${message.slice(0, 220)}...` : message,
      },
    });
  }
}

module.exports = { handleImageGenerate };
