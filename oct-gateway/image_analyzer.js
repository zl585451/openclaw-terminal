/**
 * 图片自动分析：云端（qwen-vl-max）优先，本地 BLIP 降级。
 * 支持 PNG/JPG/WebP，失败不阻塞对话。
 */

const config = require('./config');
const imageAnalyzerLocal = require('./image_analyzer_local');

const DEFAULT_VISION_MODEL = 'qwen-vl-max';
const PROMPT = '请用一句话描述这张图片的内容。如果是截图，请说明截图中的关键信息（界面、文字、错误信息等）。直接输出描述，不要加引号或前缀。';

const FALLBACK_MSG = '[图片分析] 图片分析失败，请少爷描述图片内容。';

/**
 * 云端分析单张图片，成功返回 "[图片分析] ..."，失败返回 null（不抛错，仅打日志）
 * @param {string} url - data:image/xxx;base64,...
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
async function analyzeImageCloud(url, timeoutMs) {
  const cfg = config.image_analysis || {};
  const apiKey = config.DASHSCOPE_API_KEY;
  const baseUrl = config.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  // 百炼 Coding (coding.dashscope.aliyuncs.com) 不支持 qwen-vl-max，用主对话模型（如 qwen3.5-plus）做看图
  const isCoding = String(baseUrl).includes('coding.dashscope');
  const model = isCoding ? (config.DASHSCOPE_MODEL || 'qwen3.5-plus') : (cfg.vision_model || DEFAULT_VISION_MODEL);

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
      console.warn('[ImageAnalyzer] 云端 API 错误:', res.status, errText.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) return `[图片分析] ${text}`;
    return null;
  } catch (e) {
    console.warn('[ImageAnalyzer] 云端失败:', e?.message || e);
    return null;
  }
}

/**
 * 分析单张图片：云端优先，失败则本地 BLIP 降级，都失败返回友好降级文案
 * @param {string} dataUrl - data:image/png;base64,xxx 或 data:image/jpeg;base64,xxx
 * @param {string} [mimeType] - image/png | image/jpeg | image/webp
 * @returns {Promise<string>}
 */
async function analyzeImage(dataUrl, mimeType) {
  const cfg = config.image_analysis || {};
  if (cfg.enabled === false) {
    return '[图片分析] 未启用，请少爷描述图片内容。';
  }

  let url = dataUrl;
  if (typeof dataUrl === 'string' && !dataUrl.startsWith('data:')) {
    const m = mimeType || 'image/png';
    url = `data:${m};base64,${dataUrl}`;
  }

  const timeoutMs = ((cfg.timeout_seconds || 30) | 0) * 1000;
  const provider = (cfg.provider || 'aliyun_vl').toLowerCase();
  const useCloud = provider === 'aliyun_vl' || provider === 'auto';
  const useLocal = (provider === 'local_blip' || provider === 'auto') && (cfg.local?.enabled !== false);

  // 1) 首选云端
  if (useCloud) {
    const cloudResult = await analyzeImageCloud(url, timeoutMs);
    if (cloudResult) return cloudResult;
  }

  // 2) 备选本地（无感切换，不告知少爷）
  if (useLocal) {
    const localResult = await imageAnalyzerLocal.analyzeImageLocal(url, timeoutMs);
    if (localResult) return localResult;
  }

  // 3) 都失败
  return FALLBACK_MSG;
}

/**
 * 分析多张图片，结果用换行拼接
 * @param {Array<{ mimeType: string, content: string }>} imageAttachments
 * @returns {Promise<string>}
 */
async function analyzeImages(imageAttachments) {
  if (!imageAttachments || imageAttachments.length === 0) return '';

  const results = await Promise.all(
    imageAttachments.map((a) => {
      const dataUrl = `data:${a.mimeType || 'image/png'};base64,${a.content}`;
      return analyzeImage(dataUrl, a.mimeType);
    })
  );

  return results.filter(Boolean).join('\n\n');
}

module.exports = { analyzeImage, analyzeImages };
