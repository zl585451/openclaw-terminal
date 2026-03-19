/**
 * 本地图片分析（BLIP）：云端失败时的降级方案。
 * 使用 @xenova/transformers 的 image-to-text 管道，模型缓存到 config.image_analysis.local.model_cache_path。
 * 支持 PNG/JPG/WebP，超时 30 秒，失败不阻塞对话。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const config = require('./config');
const { createLogger } = require('./logger');
const logger = createLogger('image_analyzer_local');

const BLIP_MODEL_ID = 'Xenova/blip-image-captioning-base';
let pipe = null;
let loadPromise = null;
let firstLoadLogged = false;

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

    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = cacheDir;
    env.allowLocalModels = false;
    env.useBrowserCache = false;

    pipe = await pipeline('image-to-text', BLIP_MODEL_ID, { progress_callback: () => {} });
    return pipe;
  })();

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
    logger.warn('[ImageAnalyzerLocal] 模型加载失败:', e?.message || e);
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
      return `[图片分析] ${text.trim()}`;
    }
    return null;
  } catch (e) {
    if (e?.message === 'timeout') {
      logger.warn('[ImageAnalyzerLocal] 本地分析超时');
    } else {
      logger.warn('[ImageAnalyzerLocal]', e?.message || e);
    }
    return null;
  } finally {
    cleanup();
  }
}

module.exports = { loadModel, analyzeImageLocal };
