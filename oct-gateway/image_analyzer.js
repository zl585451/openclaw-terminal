/**
 * 图片自动分析：支持三条路径，按优先级依次尝试：
 *   1. DashScope 云端（仅当主 provider 为 bailian/bailian-coding 时）
 *   2. 视觉 API（VISION_API_KEY + VISION_BASE_URL + VISION_MODEL，独立于主 provider）
 *   3. MCP understand_image（最后兜底）
 * 支持 PNG/JPG/WebP，失败不阻塞对话。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const toolLoader = require('./tool_loader');
const { createLogger } = require('./logger');
const logger = createLogger('image_analyzer');

const DEFAULT_VISION_MODEL = 'qwen-vl-max';
const PROMPT = '请用一句话描述这张图片的内容。如果是截图，请说明截图中的关键信息（界面、文字、错误信息等）。直接输出描述，不要加引号或前缀。';
const VISION_API_PROMPT = '详细描述这张图片的内容，包括可见文字、界面布局、主要区域和关键信息。';

const FALLBACK_MSG = '[图片分析] 图片分析失败，请用户描述图片内容。';

// ─── MCP 工具名解析 ──────────────────────────────────────────────────────────

function normalizeToolResultText(text) {
  return String(text || '').trim();
}

function looksLikeMcpToolErrorText(text) {
  const normalized = normalizeToolResultText(text).toLowerCase();
  if (!normalized) return false;

  const compact = normalized.replace(/\s+/g, ' ').trim();
  const startsWithAny = [
    'error executing tool',
    'validation error',
    'field required',
    'missing required',
    'mcp 请求超时',
    'tool execution failed',
    '工具执行失败',
    '参数名不匹配',
    'unauthorized access',
    'unauthorized',
    'fetch failed',
  ].some((prefix) => compact.startsWith(prefix));

  if (startsWithAny) return true;

  if (compact.length <= 220) {
    const includesAny = [
      'error executing tool',
      'validation error',
      'field required',
      'missing required',
      'image_source',
      '参数名不匹配',
      'unauthorized access',
      'mcp 请求超时',
    ].some((token) => compact.includes(token));
    if (includesAny) return true;
  }

  return false;
}

function inferMcpFailureKind(text) {
  const normalized = normalizeToolResultText(text).toLowerCase();
  if (normalized.startsWith('fetch failed')) return 'network_or_remote_fetch_failed';
  if (normalized.startsWith('unauthorized access') || normalized.startsWith('unauthorized')) return 'unauthorized';
  if (
    normalized.startsWith('field required') ||
    normalized.startsWith('missing required') ||
    (normalized.length <= 220 && normalized.includes('image_source'))
  ) return 'invalid_arguments';
  if (normalized.startsWith('validation error')) return 'validation_error';
  if (normalized.startsWith('参数名不匹配')) return 'argument_name_mismatch';
  if (
    normalized.startsWith('error executing tool') ||
    normalized.startsWith('tool execution failed') ||
    normalized.startsWith('工具执行失败')
  ) return 'tool_execution_error';
  if (normalized.startsWith('mcp 请求超时')) return 'mcp_timeout';
  return 'unknown';
}

function dataUrlToTempFile(dataUrl, mimeType) {
  const match = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/);
  const ext = (match && match[1]) ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : ((mimeType || 'image/png').split('/')[1] || 'png');
  const base64 = match ? match[2] : dataUrl;
  const buf = Buffer.from(base64, 'base64');
  const filePath = path.join(os.tmpdir(), `oct-vision-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(filePath, buf);
  return {
    filePath,
    cleanup: () => {
      try { fs.unlinkSync(filePath); } catch {}
    },
  };
}

function resolveVisionToolName(defs) {
  const names = (defs || []).map((def) => String(def?.function?.name || '')).filter(Boolean);
  if (names.length === 0) return '';

  const exactCandidates = [
    'mcp_minimax_understand_image',
    'MiniMax_understand_image',
    'minimax_understand_image',
    'understand_image',
  ];
  for (const candidate of exactCandidates) {
    const hit = names.find((name) => name.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }

  const regexCandidates = [
    /(?:^|_)understand_image$/i,
    /understand.*image/i,
    /image.*understand/i,
    /vision.*image/i,
    /mcp_.*image/i,
  ];
  for (const pattern of regexCandidates) {
    const hit = names.find((name) => pattern.test(name));
    if (hit) return hit;
  }

  return '';
}

function resolveToolDefinition(defs, toolName) {
  return (defs || []).find((def) => def?.function?.name === toolName) || null;
}

function buildMcpVisionArgs(definition, filePath, dataUrl) {
  const schemaProps = definition?.function?.parameters?.properties || {};
  const propNames = Object.keys(schemaProps);
  const args = {};

  const setIfKnown = (name, value) => {
    if (!propNames.length || Object.prototype.hasOwnProperty.call(schemaProps, name)) {
      args[name] = value;
    }
  };

  setIfKnown('image_source', filePath);
  setIfKnown('image_path', filePath);
  setIfKnown('file_path', filePath);
  setIfKnown('path', filePath);
  setIfKnown('file', filePath);
  setIfKnown('source', filePath);
  setIfKnown('image_url', dataUrl);
  setIfKnown('url', dataUrl);
  setIfKnown('image', dataUrl);
  setIfKnown('prompt', VISION_API_PROMPT);
  setIfKnown('query', VISION_API_PROMPT);

  if (propNames.length === 0) {
    args.image_source = filePath;
    args.image_url = dataUrl;
    args.prompt = VISION_API_PROMPT;
  }

  return args;
}

// ─── 路径 1：DashScope 云端（仅 bailian provider）────────────────────────────

async function analyzeImageCloud(url, timeoutMs, options = {}) {
  const cfg = config.image_analysis || {};
  const apiKey = options.apiKey || config.DASHSCOPE_API_KEY;
  const baseUrl = options.baseUrl || config.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const isCoding = String(baseUrl).includes('coding.dashscope');
  const model = isCoding
    ? (options.model || config.DASHSCOPE_MODEL || 'qwen3.5-plus')
    : (cfg.vision_model || DEFAULT_VISION_MODEL);

  if (!apiKey) return null;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
        max_tokens: 256,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn('[ImageAnalyzer] 云端 API 错误', { status: res.status, model, baseUrl, bodyPreview: errText.slice(0, 200) });
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) return `[图片分析] ${text}`;
    return null;
  } catch (e) {
    logger.warn('[ImageAnalyzer] 云端失败', { model, baseUrl, error: e?.message || String(e) });
    return null;
  }
}

// ─── 路径 2：视觉 API（独立 key，与主 provider 无关）────────────────────────

async function analyzeImageVisionApi(url, timeoutMs) {
  const apiKey = config.getEnvOrConfig('VISION_API_KEY') || '';
  const baseUrl = (config.getEnvOrConfig('VISION_BASE_URL') || '').replace(/\/$/, '');
  const model = config.getEnvOrConfig('VISION_MODEL') || '';

  if (!apiKey || !baseUrl || !model) {
    logger.info('[ImageAnalyzer] 视觉 API 未配置，跳过', {
      hasKey: !!apiKey,
      hasBaseUrl: !!baseUrl,
      hasModel: !!model,
    });
    return null;
  }

  try {
    logger.info('[ImageAnalyzer] 视觉 API 分析', { model, baseUrl });
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url } },
              { type: 'text', text: VISION_API_PROMPT },
            ],
          },
        ],
        max_tokens: 512,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn('[ImageAnalyzer] 视觉 API 错误', { status: res.status, model, bodyPreview: errText.slice(0, 200) });
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) {
      logger.info('[ImageAnalyzer] 视觉 API 分析成功', { model, resultLen: text.length });
      return `[图片分析] ${text}\n[图片分析说明] 你已经拿到图片分析结果，不要再调用 exec_command、read_file 或查找本地媒体路径来重复找图。`;
    }
    return null;
  } catch (e) {
    logger.warn('[ImageAnalyzer] 视觉 API 失败', { model, baseUrl, error: e?.message || String(e) });
    return null;
  }
}

// ─── 路径 3：MCP understand_image（最后兜底）────────────────────────────────

async function analyzeImageViaMcp(dataUrl, mimeType) {
  const defs = toolLoader.getDefinitions?.() || [];
  const availableTools = defs.map((def) => def?.function?.name).filter(Boolean);
  const visionToolName = resolveVisionToolName(defs);
  if (!visionToolName) {
    logger.warn('[ImageAnalyzer] 未找到可用的 MCP 图片理解工具', {
      availableTools: availableTools.slice(0, 20),
      availableToolCount: availableTools.length,
      hint: '支持 mcp_minimax_understand_image、MiniMax_understand_image 以及其他 understand_image / image vision 命名。',
    });
    return null;
  }

  const { filePath, cleanup } = dataUrlToTempFile(dataUrl, mimeType);
  try {
    const definition = resolveToolDefinition(defs, visionToolName);
    const args = buildMcpVisionArgs(definition, filePath, dataUrl);
    logger.info('[ImageAnalyzer] 准备调用 MCP 图片理解工具', {
      tool: visionToolName,
      mimeType: mimeType || 'image/png',
      tempFileExt: path.extname(filePath),
      availableToolCount: availableTools.length,
      argKeys: Object.keys(args),
    });
    const result = await toolLoader.executeTool(visionToolName, args, {
      skipAgentPermission: true,
      reason: 'internal_image_analysis',
    });
    const text = typeof result === 'string' ? result.trim() : JSON.stringify(result);
    if (!text) return null;

    const looksLikeToolError = looksLikeMcpToolErrorText(text);
    const failureKind = inferMcpFailureKind(text);

    if (looksLikeToolError) {
      logger.warn('[ImageAnalyzer] MCP 图片理解返回错误文本', {
        failureKind,
        preview: text.slice(0, 220),
        tool: visionToolName,
        hint:
          failureKind === 'network_or_remote_fetch_failed'
            ? 'MCP server 可能已连接，但其访问远端接口失败；优先检查网络/代理/API Key。'
            : failureKind === 'unauthorized'
              ? '请检查 API Key 是否有效。'
              : failureKind === 'invalid_arguments' || failureKind === 'argument_name_mismatch'
                ? '请检查 understand_image 工具参数名与当前 MCP server 版本是否一致。'
                : '请检查 MCP server 日志和工具返回内容。',
      });
      return null;
    }

    logger.info('[ImageAnalyzer] MCP 图片理解成功', { resultLen: text.length });
    return `[图片分析] ${text}\n[图片分析说明] 你已经拿到图片分析结果，不要再调用 exec_command、read_file 或查找本地媒体路径来重复找图。`;
  } catch (error) {
    logger.warn('[ImageAnalyzer] MCP 图片理解失败', {
      error: error?.message || String(error),
      tool: visionToolName,
      availableTools: availableTools.slice(0, 20),
      hint: '如果 mcp/status 里已连接但这里仍失败，更可能是网络、鉴权或远端接口问题，而不是 MCP 进程未启动。',
    });
    return null;
  } finally {
    cleanup();
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 分析单张图片，降级顺序：
 *   1. DashScope 云端（provider=bailian 时）
 *   2. 视觉 API（VISION_API_KEY，独立配置）
 *   3. MCP understand_image
 *   4. 降级提示
 */
async function analyzeImage(dataUrl, mimeType, options = {}) {
  const cfg = config.image_analysis || {};
  if (cfg.enabled === false) {
    logger.info('[ImageAnalyzer] 图片分析已禁用，直接返回降级提示');
    return '[图片分析] 未启用，请用户描述图片内容。';
  }

  let url = dataUrl;
  if (typeof dataUrl === 'string' && !dataUrl.startsWith('data:')) {
    const m = mimeType || 'image/png';
    url = `data:${m};base64,${dataUrl}`;
  }

  const timeoutMs = ((cfg.timeout_seconds || 30) | 0) * 1000;
  const provider = (cfg.provider || 'aliyun_vl').toLowerCase();
  const currentProviderId = String(options.currentProviderId || '').toLowerCase();
  const currentProviderBaseUrl = String(options.baseUrl || '').toLowerCase();
  const cloudCompatible =
    currentProviderId === 'bailian'
    || currentProviderId === 'bailian-coding'
    || currentProviderBaseUrl.includes('dashscope');
  const useCloud = (provider === 'aliyun_vl' || provider === 'auto') && cloudCompatible;

  logger.info('[ImageAnalyzer] 开始分析图片', {
    provider,
    mimeType: mimeType || 'image/png',
    timeoutMs,
    useCloud,
    currentProviderId: currentProviderId || 'unknown',
  });

  // 1) DashScope 云端（仅 bailian provider）
  if (useCloud) {
    const cloudResult = await analyzeImageCloud(url, timeoutMs, options);
    if (cloudResult) {
      logger.info('[ImageAnalyzer] 云端分析成功', { resultLen: cloudResult.length });
      return cloudResult;
    }
    logger.warn('[ImageAnalyzer] 云端分析未返回结果，继续尝试视觉 API');
  } else if (provider === 'aliyun_vl' || provider === 'auto') {
    logger.warn('[ImageAnalyzer] 跳过云端视觉分析：当前 provider 与 DashScope 视觉链路不兼容', {
      currentProviderId: currentProviderId || 'unknown',
      baseUrl: options.baseUrl || '',
    });
  }

  // 2) 视觉 API（VISION_API_KEY，与主 provider 无关）
  const visionApiResult = await analyzeImageVisionApi(url, timeoutMs);
  if (visionApiResult) {
    return visionApiResult;
  }

  // 3) MCP understand_image（最后兜底）
  const mcpResult = await analyzeImageViaMcp(url, mimeType);
  if (mcpResult) {
    return mcpResult;
  }

  // 4) 全链路失败
  logger.warn('[ImageAnalyzer] 图片分析全部失败，返回最终降级提示', {
    provider,
    currentProviderId: currentProviderId || 'unknown',
  });
  return `${FALLBACK_MSG}\n[图片分析状态] 当前模型不支持直接看图，且视觉分析器未成功返回结果。不要假装已看见图片，也不要继续调用依赖本地媒体路径的额外看图工具；请明确告知用户当前视觉链路失败。`;
}

/**
 * 分析多张图片，结果用换行拼接
 */
async function analyzeImages(imageAttachments, options = {}) {
  if (!imageAttachments || imageAttachments.length === 0) return '';

  logger.info('[ImageAnalyzer] 批量分析开始', { count: imageAttachments.length });

  const results = await Promise.all(
    imageAttachments.map((a) => {
      const dataUrl = `data:${a.mimeType || 'image/png'};base64,${a.content}`;
      return analyzeImage(dataUrl, a.mimeType, options);
    })
  );

  const combined = results.filter(Boolean).join('\n\n');
  logger.info('[ImageAnalyzer] 批量分析完成', {
    count: imageAttachments.length,
    resultCount: results.filter(Boolean).length,
    combinedLen: combined.length,
  });
  return combined;
}

module.exports = { analyzeImage, analyzeImages };
