'use strict';

/**
 * OmniRoute 核心配置治理与外部宿主路由接口模块 (Phase 5)
 *
 * 职责：
 * - 移除本地 provider 直连路由、fallback 候选、物理展开、本地凭证仓等重复网关职责。
 * - 真正作为“调用 OmniRoute 的宿主客户端”。
 * - 所有能力解析直接委托至 externalOmniRoute 外部路由接口。
 */

const externalOmniRoute = require('./externalOmniRoute');

const OMNI_ROUTE_CAPABILITIES = {
  default: {
    description: 'Single OmniRoute model outlet for chat, planning, and tool loops.',
    tools: true,
    candidates: [{ provider: 'external_omniroute', model: 'combo/chat' }],
  },
};

const LEGACY_CAPABILITY_ALIASES = new Set(['oct-chat', 'oct-plan', 'oct-tool-safe']);

function normalizeCapability(capability) {
  return LEGACY_CAPABILITY_ALIASES.has(capability) ? 'default' : capability;
}

/**
 * 判断是否为有效的逻辑能力别名
 */
function isCapabilityAlias(name) {
  return Object.prototype.hasOwnProperty.call(OMNI_ROUTE_CAPABILITIES, name)
    || LEGACY_CAPABILITY_ALIASES.has(name);
}

/**
 * 获取所有支持的逻辑能力别名列表
 */
function listCapabilities() {
  return Object.keys(OMNI_ROUTE_CAPABILITIES);
}

/**
 * 解析具体逻辑能力的提供商配置 (Phase 5: 唯一出口为外部 OmniRoute)
 */
function resolveCapability(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return null;
  }
  return externalOmniRoute.resolveCapabilityTarget(normalizeCapability(capability));
}

/**
 * 安全诊断具体别名下的所有候选物理通道状态，仅代表外部 OmniRoute 通道
 */
function inspectCapability(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return null;
  }
  const snapshot = externalOmniRoute.getExternalGatewayConfig();
  const resolved = resolveCapability(capability, context);
  const normalizedCapability = normalizeCapability(capability);
  const definition = OMNI_ROUTE_CAPABILITIES[normalizedCapability] || OMNI_ROUTE_CAPABILITIES.default;
  const model = snapshot.model || snapshot.models?.default || definition.candidates[0].model;

  const candidate = {
    provider: 'external_omniroute',
    model,
    available: !!resolved,
    baseUrl: snapshot.baseUrl || '',
    hasApiKey: snapshot.hasApiKey,
    source: 'external_omniroute_config',
    reason: resolved ? null : 'OMNIROUTE_BASE_URL or OMNIROUTE_API_KEY is not configured',
  };

  return {
    capability: normalizedCapability,
    description: definition.description,
    tools: definition.tools,
    status: resolved ? 'healthy' : 'unavailable',
    candidates: [candidate],
  };
}

/**
 * 罗列系统内所有能力路由的完整就绪状态列表
 */
function listCapabilityStatus(context = {}) {
  return listCapabilities().map((capability) => {
    return inspectCapability(capability, context);
  });
}

/**
 * 解析并列出特定逻辑能力下所有已配置可用的物理候选提供商列表 (Phase 5: 仅保留外部 OmniRoute)
 */
function resolveAllCandidates(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return [];
  }
  const resolved = resolveCapability(capability, context);
  return resolved ? [resolved] : [];
}

/**
 * 判断错误是否属于网络超时、429、5xx 服务器内部异常等可恢复错误
 */
function isRetryableError(err) {
  if (!err) return false;

  if (err.name === 'LlmClientHttpError' || typeof err.status === 'number') {
    const status = err.status;
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
    return false;
  }

  if (err.message && err.message.startsWith('API Error ')) {
    const match = err.message.match(/API Error (\d+)/);
    if (match) {
      const status = Number(match[1]);
      if (status === 429 || (status >= 500 && status < 600)) {
        return true;
      }
      return false;
    }
  }

  if (
    err.name === 'LlmClientTimeoutError' ||
    err.message?.includes('超时') ||
    err.message?.includes('timeout')
  ) {
    return true;
  }

  const msg = String(err.message || '').toLowerCase();
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'EPIPE' ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('socket hang up') ||
    msg.includes('aborted')
  ) {
    return true;
  }

  return false;
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  isCapabilityAlias,
  listCapabilities,
  resolveCapability,
  inspectCapability,
  listCapabilityStatus,
  resolveAllCandidates,
  isRetryableError,
};
