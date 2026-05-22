'use strict';

const config = require('../config');

function normalizeBaseUrl(raw) {
  return String(raw || '').trim().replace(/\/$/, '');
}

function readBool(raw) {
  if (raw === true) return true;
  if (raw === false || raw === null || raw === undefined) return false;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

function parseModelListPayload(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

  const seen = new Set();
  const models = [];
  for (const item of source) {
    const id = String(
      typeof item === 'string'
        ? item
        : (item?.id || item?.model || item?.name || '')
    ).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return models;
}

function getExternalGatewayConfig() {
  const baseUrl = normalizeBaseUrl(config.getEnvOrConfig('OMNIROUTE_BASE_URL'));
  const apiKey = String(config.getEnvOrConfig('OMNIROUTE_API_KEY') || '').trim();
  const model = String(
    config.getEnvOrConfig('OMNIROUTE_MODEL')
    || config.getEnvOrConfig('OMNIROUTE_CHAT_MODEL')
    || ''
  ).trim() || 'combo/chat';
  const rawEnabled = config.getEnvOrConfig('OCT_USE_EXTERNAL_OMNIROUTE');
  const enabled = readBool(rawEnabled);

  return {
    enabled,
    configured: !!baseUrl && !!apiKey,
    baseUrl,
    hasApiKey: !!apiKey,
    apiKey,
    model,
    models: {
      default: model,
    },
  };
}

function getCapabilityAlias(capability, snapshot = getExternalGatewayConfig()) {
  return String(snapshot?.model || snapshot?.models?.default || '').trim();
}

function resolveCapabilityTarget(capability = 'default') {
  const snapshot = getExternalGatewayConfig();
  const model = getCapabilityAlias(capability, snapshot);
  if (!snapshot.enabled || !snapshot.baseUrl || !snapshot.apiKey || !model) {
    return null;
  }
  return {
    providerId: 'external_omniroute',
    baseUrl: snapshot.baseUrl,
    apiKey: snapshot.apiKey,
    model,
    source: 'external_omniroute_config',
    capability: 'default',
  };
}

async function checkConnectivity(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 2500);
  const snapshot = getExternalGatewayConfig();
  const checkedUrl = snapshot.baseUrl ? `${snapshot.baseUrl}/models` : null;

  if (!snapshot.enabled) {
    return {
      ok: false,
      status: 'disabled',
      httpStatus: null,
      checkedUrl,
      error: null,
    };
  }
  if (!snapshot.baseUrl) {
    return {
      ok: false,
      status: 'missing_base_url',
      httpStatus: null,
      checkedUrl: null,
      error: 'OMNIROUTE_BASE_URL 未配置',
    };
  }
  if (!snapshot.apiKey) {
    return {
      ok: false,
      status: 'missing_api_key',
      httpStatus: null,
      checkedUrl,
      error: 'OMNIROUTE_API_KEY 未配置',
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'fetch_unavailable',
      httpStatus: null,
      checkedUrl,
      error: '当前运行时不支持 fetch',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(checkedUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${snapshot.apiKey}`,
      },
      signal: controller.signal,
    });

    if (res.ok) {
      let availableModels = [];
      if (typeof res.json === 'function') {
        try {
          availableModels = parseModelListPayload(await res.json());
        } catch (_) {
          availableModels = [];
        }
      }
      return {
        ok: true,
        status: 'reachable',
        httpStatus: res.status,
        checkedUrl,
        error: null,
        availableModels,
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: 'http_error',
      httpStatus: res.status,
      checkedUrl,
      error: String(errText || `HTTP ${res.status}`).slice(0, 200),
      availableModels: [],
    };
  } catch (err) {
    const aborted = err && typeof err === 'object' && err.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 'timeout' : 'network_error',
      httpStatus: null,
      checkedUrl,
      error: err?.message || String(err),
      availableModels: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectExternalGateway(options = {}) {
  const snapshot = getExternalGatewayConfig();
  const connectivity = await checkConnectivity(options);
  return {
    enabled: snapshot.enabled,
    configured: snapshot.configured,
    baseUrl: snapshot.baseUrl,
    hasApiKey: snapshot.hasApiKey,
    model: snapshot.model,
    models: snapshot.models,
    availableModels: connectivity.availableModels || [],
    connectivity,
  };
}

module.exports = {
  getExternalGatewayConfig,
  getCapabilityAlias,
  resolveCapabilityTarget,
  parseModelListPayload,
  checkConnectivity,
  inspectExternalGateway,
};
