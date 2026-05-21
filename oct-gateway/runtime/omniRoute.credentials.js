'use strict';

const externalOmniRoute = require('./externalOmniRoute');

function resolveCandidate(candidate, options = {}) {
  const snapshot = externalOmniRoute.getExternalGatewayConfig();
  if (snapshot.configured) {
    return {
      ok: true,
      provider: 'external_omniroute',
      model: candidate.model || 'combo/chat',
      baseUrl: snapshot.baseUrl,
      apiKey: snapshot.apiKey,
      source: 'external_omniroute_config',
      reason: null,
    };
  }
  return {
    ok: false,
    provider: 'external_omniroute',
    model: candidate.model || 'combo/chat',
    baseUrl: null,
    apiKey: '',
    source: 'external_omniroute_config',
    reason: 'OMNIROUTE_BASE_URL or OMNIROUTE_API_KEY is not configured',
  };
}

function inspectCandidate(candidate, options = {}) {
  const resolved = resolveCandidate(candidate, options);
  return {
    ok: resolved.ok,
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    hasApiKey: !!resolved.apiKey,
    source: resolved.source,
    reason: resolved.reason,
  };
}

function listProviderCredentialStatus(options = {}) {
  return [inspectCandidate({ provider: 'external_omniroute', model: 'combo/chat' }, options)];
}

module.exports = {
  resolveCandidate,
  inspectCandidate,
  listProviderCredentialStatus,
};
