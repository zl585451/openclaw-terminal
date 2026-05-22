'use strict';

const OMNI_ROUTE_CAPABILITIES = {
  default: {
    description: 'Single OmniRoute model outlet for chat, planning, and tool loops.',
    tools: true,
    candidates: [{ provider: 'external_omniroute', model: 'combo/chat' }],
  },
};

function getCapabilityDefinition(capability) {
  return OMNI_ROUTE_CAPABILITIES[capability] || null;
}

function listCapabilityDefinitions() {
  return Object.keys(OMNI_ROUTE_CAPABILITIES).map((capability) => ({
    capability,
    ...getCapabilityDefinition(capability),
  }));
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  getCapabilityDefinition,
  listCapabilityDefinitions,
};
