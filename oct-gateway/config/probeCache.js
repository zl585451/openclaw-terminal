'use strict';

const CAPABILITY_PROBE_CACHE_FILE = 'capability-probe-cache.json';
const PROBE_TTL_SUPPORTED_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_TTL_UNSUPPORTED_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_TTL_UNKNOWN_MS = 24 * 60 * 60 * 1000;

function createProbeCacheStore({
  fs,
  path,
  os,
  configPath,
  normalizeModelId,
}) {
  let probeCache = null;
  let probeCacheLoaded = false;

  function getProbeCachePath() {
    const baseDir = configPath ? path.dirname(configPath) : path.join(os.homedir(), '.openclaw');
    return path.join(baseDir, CAPABILITY_PROBE_CACHE_FILE);
  }

  function loadProbeCache() {
    if (probeCacheLoaded) return probeCache || {};
    probeCacheLoaded = true;
    const probePath = getProbeCachePath();
    try {
      if (fs.existsSync(probePath)) {
        const parsed = JSON.parse(fs.readFileSync(probePath, 'utf-8'));
        probeCache = parsed && typeof parsed === 'object' ? parsed : {};
        return probeCache;
      }
    } catch {}
    probeCache = {};
    return probeCache;
  }

  function saveProbeCache() {
    const probePath = getProbeCachePath();
    const dir = path.dirname(probePath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(probePath, JSON.stringify(probeCache || {}, null, 2), 'utf-8');
    } catch {}
  }

  function buildProbeCacheKey(providerId, baseUrl, modelId) {
    const provider = String(providerId || '').trim().toLowerCase();
    const normalizedBaseUrl = String(baseUrl || '').trim().toLowerCase().replace(/\/$/, '');
    const normalizedModelId = normalizeModelId(modelId);
    return `${provider}::${normalizedBaseUrl}::${normalizedModelId}`;
  }

  function getProbeCacheEntry({ providerId, baseUrl, modelId }) {
    const key = buildProbeCacheKey(providerId, baseUrl, modelId);
    const cache = loadProbeCache();
    const item = cache[key];
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      delete cache[key];
      saveProbeCache();
      return null;
    }
    return item;
  }

  function setProbeCacheEntry({ providerId, baseUrl, modelId, toolsSupport, capabilitySource = 'runtime_probe' }) {
    const key = buildProbeCacheKey(providerId, baseUrl, modelId);
    const cache = loadProbeCache();
    const ttl = toolsSupport === 'supported'
      ? PROBE_TTL_SUPPORTED_MS
      : toolsSupport === 'unsupported'
        ? PROBE_TTL_UNSUPPORTED_MS
        : PROBE_TTL_UNKNOWN_MS;
    cache[key] = {
      providerId,
      baseUrl: String(baseUrl || '').trim(),
      modelId: String(modelId || '').trim(),
      normalizedModelId: normalizeModelId(modelId),
      toolsSupport: toolsSupport || 'unknown',
      capabilitySource,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    probeCache = cache;
    saveProbeCache();
    return cache[key];
  }

  return {
    getProbeCachePath,
    getProbeCacheEntry,
    setProbeCacheEntry,
  };
}

module.exports = {
  createProbeCacheStore,
};
