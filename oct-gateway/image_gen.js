/**
 * OCT ImageStudio 生图处理器
 * 支持独立 image.generate 旁路，不进入 chat.send 上下文。
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/** 生图 HTTP 超时（硅基 / 部分模型可能超过 60s），可通过环境变量覆盖 */
const DEFAULT_IMAGE_HTTP_TIMEOUT_MS = Number(process.env.OCT_IMAGE_HTTP_TIMEOUT_MS || 180000);

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
          reject(new Error(`JSON parse error: ${String(data).slice(0, 200)}`));
          return;
        }
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsedData).slice(0, 300)}`));
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
  const baseUrl = String(config.IMAGE_BASE_URL || 'https://api.minimax.chat').trim().replace(/\/$/, '');
  const url = `${baseUrl}/v1/image_generation`;
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
  const baseUrl = String(config.IMAGE_BASE_URL || 'https://api.openai.com').trim().replace(/\/$/, '');
  const url = `${baseUrl}/v1/images/generations`;
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

function resolveApiKey(rawConfig) {
  const direct = String(rawConfig.IMAGE_API_KEY || '').trim();
  if (direct) return direct;

  const provider = String(rawConfig.IMAGE_PROVIDER || 'minimax').trim().toLowerCase();
  if (provider === 'minimax') {
    return String(rawConfig.MINIMAX_API_KEY || rawConfig.DASHSCOPE_API_KEY || '').trim();
  }
  // OpenAI 兼容 / 硅基：聊天 Key 在 DASHSCOPE（硅基官方入口）、CUSTOM（自定义兼容）等字段
  return String(
    rawConfig.CUSTOM_API_KEY
      || rawConfig.DASHSCOPE_API_KEY
      || rawConfig.DEEPSEEK_API_KEY
      || rawConfig.MINIMAX_API_KEY
      || '',
  ).trim();
}

async function handleImageGenerate(payload, rawConfig, sendToClient) {
  const requestId = payload?.requestId || `img_${Date.now()}`;
  const prompt = String(payload?.prompt || '').trim();
  const resolvedApiKey = resolveApiKey(rawConfig);

  if (!resolvedApiKey) {
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: { requestId, error: '未配置生图 API Key，请先在设置中填写。' },
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

  const config = { ...rawConfig, resolvedApiKey };
  sendToClient({
    type: 'res',
    method: 'image.generate',
    ok: true,
    payload: { requestId, status: 'generating', message: '正在生成图片...' },
  });

  try {
    const provider = String(rawConfig.IMAGE_PROVIDER || 'minimax').trim().toLowerCase();
    const baseHint = String(config.IMAGE_BASE_URL || '').trim();
    const useSiliconflow = provider === 'siliconflow'
      || (provider === 'openai' && isSiliconFlowBaseUrl(baseHint));

    let imageUrls;
    if (provider === 'minimax') {
      imageUrls = await minimaxAdapter({ ...payload, prompt }, config);
    } else if (useSiliconflow) {
      const merged = {
        ...config,
        IMAGE_BASE_URL: baseHint || config.IMAGE_BASE_URL || 'https://api.siliconflow.cn/v1',
      };
      imageUrls = await siliconflowAdapter({ ...payload, prompt }, merged);
    } else {
      imageUrls = await openaiAdapter({ ...payload, prompt }, config);
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
        aspectRatio: resolveRequestedAspectRatio(payload, rawConfig),
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
