'use strict';

const OMNI_ROUTE_CAPABILITIES = {
  'oct-chat': {
    description: 'Low-latency conversational chat and instant response.',
    tools: false,
    candidates: [{ provider: 'external_omniroute', model: 'combo/chat' }],
  },
  'oct-plan': {
    description: 'Structured planning, summarization, and heavy extraction.',
    tools: false,
    candidates: [{ provider: 'external_omniroute', model: 'combo/plan' }],
  },
  'oct-tool-safe': {
    description: 'Strict, verified function calling and tool loop execution.',
    tools: true,
    candidates: [{ provider: 'external_omniroute', model: 'combo/tool' }],
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
