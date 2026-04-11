/**
 * 本地图片分析（BLIP）：云端失败时的降级方案。
 * 使用 @xenova/transformers 的 image-to-text 管道，模型缓存到 config.image_analysis.local.model_cache_path。
 * 支持 PNG/JPG/WebP，超时 30 秒，失败不阻塞对话。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { ProxyAgent } = (() => {
  try { return require('undici'); }
  catch { return { ProxyAgent: null }; }
})();

const config = require('./config');
const { createLogger } = require('./logger');
const logger = createLogger('image_analyzer_local');

const BLIP_MODEL_ID = 'Xenova/blip-image-captioning-base';
let pipe = null;
let loadPromise = null;
let firstLoadLogged = false;
let lastLocalError = null;
let fetchPatched = false;

function patchFetchForModelDownload() {
  if (fetchPatched) return;
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    '';
  if (!proxyUrl || !ProxyAgent || typeof globalThis.fetch !== 'function') return;

  const dispatcher = new ProxyAgent(proxyUrl);
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url);
    if (isLocal || init.dispatcher) {
      return originalFetch(input, init);
    }
    return originalFetch(input, { ...init, dispatcher });
  };
  fetchPatched = true;
  logger.info('[ImageAnalyzerLocal] 已为模型下载启用代理支持', { proxyUrl });
}

/**
 * 首次加载 BLIP 模型（自动下载并缓存）
 * @returns {Promise<import('@xenova/transformers').Pipeline>}
 */
async function loadModel() {
  if (pipe) return pipe;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const localCfg = config.image_analysis?.local || {};
    const cacheDir = path.resolve(path.join(__dirname, localCfg.model_cache_path || './models/blip'));

    if (!firstLoadLogged) {
      firstLoadLogged = true;
      logger.info('[ImageAnalyzerLocal] 首次使用本地图片分析，正在下载模型（~100MB）…');
    }

    patchFetchForModelDownload();

    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = cacheDir;
    env.allowLocalModels = true;
    env.useBrowserCache = false;

    pipe = await pipeline('image-to-text', BLIP_MODEL_ID, { progress_callback: () => {} });
    lastLocalError = null;
    return pipe;
  })().catch((error) => {
    pipe = null;
    loadPromise = null;
    lastLocalError = error?.message || String(error);
    const suffix = fetchPatched ? '（已尝试代理下载）' : '（未检测到可用代理）';
    throw new Error(`${lastLocalError}${suffix}`);
  });

  return loadPromise;
}

/**
 * 将 data URL 转为临时文件路径（支持 PNG/JPG/WebP）
 * @param {string} dataUrl - data:image/png;base64,xxx
 * @returns {{ filePath: string, cleanup: () => void }}
 */
function dataUrlToTempFile(dataUrl) {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  const ext = (match && match[1]) ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : 'png';
  const base64 = match ? match[2] : dataUrl;
  const buf = Buffer.from(base64, 'base64');
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `oct-blip-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(filePath, buf);
  return {
    filePath,
    cleanup: () => {
      try { fs.unlinkSync(filePath); } catch (_) {}
    },
  };
}

/**
 * 本地分析单张图片，返回描述文本或 null（失败时）
 * @param {string} dataUrl - data:image/png;base64,xxx 或 data:image/jpeg;base64,xxx
 * @param {number} [timeoutMs] - 超时毫秒
 * @returns {Promise<string|null>} 成功返回 "[图片分析] 描述"，失败返回 null
 */
async function analyzeImageLocal(dataUrl, timeoutMs) {
  const localCfg = config.image_analysis?.local || {};
  if (localCfg.enabled === false) return null;

  const timeout = timeoutMs ?? ((localCfg.timeout_seconds || 30) | 0) * 1000;
  let pipeline;
  try {
    pipeline = await loadModel();
  } catch (e) {
    lastLocalError = e?.message || String(e);
    logger.warn('[ImageAnalyzerLocal] 模型加载失败', { error: lastLocalError });
    return null;
  }

  const { filePath, cleanup } = dataUrlToTempFile(dataUrl);
  try {
    const result = await Promise.race([
      pipeline(filePath, { max_new_tokens: 80 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ]);
    const text = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
    if (text && typeof text === 'string' && text.trim()) {
      lastLocalError = null;
      return `[图片分析] ${text.trim()}`;
    }
    lastLocalError = 'empty_result';
    return null;
  } catch (e) {
    if (e?.message === 'timeout') {
      logger.warn('[ImageAnalyzerLocal] 本地分析超时');
      lastLocalError = 'timeout';
    } else {
      logger.warn('[ImageAnalyzerLocal]', e?.message || e);
      lastLocalError = e?.message || String(e);
    }
    return null;
  } finally {
    cleanup();
  }
}

function getLastLocalError() {
  return lastLocalError;
}

module.exports = { loadModel, analyzeImageLocal, getLastLocalError };
