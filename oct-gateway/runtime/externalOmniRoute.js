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

function getExternalGatewayConfig() {
  const baseUrl = normalizeBaseUrl(config.getEnvOrConfig('OMNIROUTE_BASE_URL'));
  const apiKey = String(config.getEnvOrConfig('OMNIROUTE_API_KEY') || '').trim();
  const chatModel = String(config.getEnvOrConfig('OMNIROUTE_CHAT_MODEL') || '').trim();
  const planModel = String(config.getEnvOrConfig('OMNIROUTE_PLAN_MODEL') || '').trim();
  const toolModel = String(config.getEnvOrConfig('OMNIROUTE_TOOL_MODEL') || '').trim();
  const enabled = readBool(config.getEnvOrConfig('OCT_USE_EXTERNAL_OMNIROUTE'));

  return {
    enabled,
    configured: !!baseUrl && !!apiKey,
    baseUrl,
    hasApiKey: !!apiKey,
    apiKey,
    models: {
      'oct-chat': chatModel,
      'oct-plan': planModel,
      'oct-tool-safe': toolModel,
    },
  };
}

function getCapabilityAlias(capability, snapshot = getExternalGatewayConfig()) {
  return String(snapshot?.models?.[capability] || '').trim();
}

function resolveCapabilityTarget(capability) {
  if (capability !== 'oct-chat' && capability !== 'oct-plan' && capability !== 'oct-tool-safe') {
    return null;
  }
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
    capability,
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
      return {
        ok: true,
        status: 'reachable',
        httpStatus: res.status,
        checkedUrl,
        error: null,
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: 'http_error',
      httpStatus: res.status,
      checkedUrl,
      error: String(errText || `HTTP ${res.status}`).slice(0, 200),
    };
  } catch (err) {
    const aborted = err && typeof err === 'object' && err.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 'timeout' : 'network_error',
      httpStatus: null,
      checkedUrl,
      error: err?.message || String(err),
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
    models: snapshot.models,
    connectivity,
  };
}

module.exports = {
  getExternalGatewayConfig,
  getCapabilityAlias,
  resolveCapabilityTarget,
  checkConnectivity,
  inspectExternalGateway,
};
