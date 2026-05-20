'use strict';

/**
 * OmniRoute 核心配置治理与软集成接口模块 (Phase 4)
 *
 * 职责：
 * - 统一作为对外主入口，完全保留 Phase 3 现有公开 API
 * - 委托 routes.js 和 credentials.js 分别进行能力路由与凭证就绪检测
 */

const routes = require('./omniRoute.routes');
const credentials = require('./omniRoute.credentials');

/**
 * 获取或导出静态逻辑能力映射关系
 */
const OMNI_ROUTE_CAPABILITIES = routes.OMNI_ROUTE_CAPABILITIES;

/**
 * 判断是否为有效的逻辑能力别名
 * @param {string} name - 别名
 * @returns {boolean}
 */
function isCapabilityAlias(name) {
  return Object.prototype.hasOwnProperty.call(OMNI_ROUTE_CAPABILITIES, name);
}

/**
 * 获取所有支持的逻辑能力别名列表
 * @returns {Array<string>}
 */
function listCapabilities() {
  return Object.keys(OMNI_ROUTE_CAPABILITIES);
}

/**
 * 解析具体逻辑能力的提供商配置
 * @param {string} capability - 逻辑能力别名 (如 oct-chat, oct-plan, oct-tool-safe)
 * @param {object} context - 包含 originalResolve 回调的上下文
 * @returns {object|null} 解析成功则返回 `{ providerId, baseUrl, apiKey, model, source, capability }`
 */
function resolveCapability(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return null;
  }
  const def = routes.getCapabilityDefinition(capability);
  const candidates = def.candidates;

  for (const candidate of candidates) {
    const res = credentials.resolveCandidate(candidate, context);
    if (res.ok) {
      return {
        providerId: res.provider,
        baseUrl: res.baseUrl,
        apiKey: res.apiKey,
        model: res.model,
        source: res.source,
        capability,
      };
    }
  }

  return null;
}

/**
 * 安全诊断具体别名下的所有候选物理通道状态，决不泄露明文 API Key
 * @param {string} capability - 逻辑能力别名
 * @param {object} context - 包含 originalResolve 回调的上下文
 * @returns {object|null}
 */
function inspectCapability(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return null;
  }
  const def = routes.getCapabilityDefinition(capability);
  const candidates = def.candidates;

  const inspectedCandidates = candidates.map((candidate) => {
    const res = credentials.inspectCandidate(candidate, context);
    return {
      provider: candidate.provider,
      model: candidate.model,
      available: res.ok,
      baseUrl: res.baseUrl,
      hasApiKey: res.hasApiKey,
      reason: res.reason,
    };
  });

  return {
    capability,
    description: def.description,
    tools: def.tools,
    candidates: inspectedCandidates,
  };
}

/**
 * 罗列系统内所有能力路由的完整就绪状态列表
 * @param {object} context - 包含 originalResolve 回调的上下文
 * @returns {Array<object>}
 */
function listCapabilityStatus(context = {}) {
  return listCapabilities().map((capability) => {
    return inspectCapability(capability, context);
  });
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  isCapabilityAlias,
  listCapabilities,
  resolveCapability,
  inspectCapability,
  listCapabilityStatus,
};
