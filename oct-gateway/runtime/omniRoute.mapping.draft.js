'use strict';

/**
 * OmniRoute 静态逻辑能力映射草案 (Phase 1/2/3 兼容包装)
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
