'use strict';

/**
 * OmniRoute 静态逻辑能力映射草案 (Phase 1/2/3 兼容包装)
 *
 * 注意：本文件仅作为历史版本的向后兼容层。
 * 它不应作为新的主配置源或路由解析核心。所有的主解析逻辑、能力路由
 * 和凭证状态判定，现在均由 runtime/omniRoute.js 主模块进行托管与执行。
 */

const omniRoute = require('./omniRoute');

module.exports = {
  OMNI_ROUTE_CAPABILITIES: omniRoute.OMNI_ROUTE_CAPABILITIES,
  getCapabilityDefinition: (capability) => {
    const definition = omniRoute.OMNI_ROUTE_CAPABILITIES[capability];
    if (!definition) return null;
    return {
      description: definition.description,
      tools: definition.tools,
      candidates: definition.candidates.map((c) => ({ ...c })),
    };
  },
  getCandidatesFor: (capability) => {
    const definition = omniRoute.OMNI_ROUTE_CAPABILITIES[capability];
    if (!definition) return [];
    return definition.candidates.map((c) => ({ ...c }));
  },
};
