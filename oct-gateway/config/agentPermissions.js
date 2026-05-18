'use strict';

const DEFAULT_AGENT_PERMISSIONS = {
  shellCommands: false,
  fileWrite: false,
  networkRequests: true,
  softwareInstall: false,
  systemConfig: false,
};

function normalizeAgentPermissions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    shellCommands: source.shellCommands === true,
    fileWrite: source.fileWrite === true,
    networkRequests: source.networkRequests !== false,
    softwareInstall: source.softwareInstall === true,
    systemConfig: source.systemConfig === true,
  };
}

module.exports = {
  DEFAULT_AGENT_PERMISSIONS,
  normalizeAgentPermissions,
};
