const fs = require('fs');
const config = require('../config');

const DEFAULT_AGENT_PERMISSIONS = Object.freeze({
  shellCommands: false,
  fileWrite: false,
  networkRequests: true,
  softwareInstall: false,
  systemConfig: false,
});

const DEFAULT_POLICY_OPTIONS = Object.freeze({
  strictUnknownMcpDeny: true,
});

let _permissionCache = {
  expiresAt: 0,
  value: { ...DEFAULT_AGENT_PERMISSIONS },
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

function getPolicyOptions() {
  const strictFromConfig = config.getEnvOrConfig?.('AGENT_PERMISSIONS_STRICT_UNKNOWN_MCP_DENY');
  const strictUnknownMcpDeny = strictFromConfig === '' || strictFromConfig === null || strictFromConfig === undefined
    ? DEFAULT_POLICY_OPTIONS.strictUnknownMcpDeny
    : /^(1|true|yes|on)$/i.test(String(strictFromConfig).trim());
  return { strictUnknownMcpDeny };
}

function getRuntimeAgentPermissions() {
  const now = Date.now();
  if (_permissionCache.expiresAt > now) return _permissionCache.value;

  const fallback = normalizeAgentPermissions(config.AGENT_PERMISSIONS || config.__fileConfig?.AGENT_PERMISSIONS);
  let finalPermissions = fallback;
  const configPath = config._configPath;

  if (configPath && fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      finalPermissions = normalizeAgentPermissions(parsed?.AGENT_PERMISSIONS);
      if (config.__fileConfig && typeof config.__fileConfig === 'object') {
        config.__fileConfig.AGENT_PERMISSIONS = finalPermissions;
      }
      config.AGENT_PERMISSIONS = finalPermissions;
    } catch {
      finalPermissions = fallback;
    }
  }

  _permissionCache = {
    expiresAt: now + 800,
    value: finalPermissions,
  };
  return finalPermissions;
}

function blockedMessage(permissionLabel, toolName, detail) {
  return [
    `系统级权限拒绝：${permissionLabel} 已关闭。`,
    `工具：${toolName}`,
    detail ? `详情：${detail}` : '',
    '请在 设置 -> 高级 -> Agent 权限 中开启后重试。',
  ].filter(Boolean).join('\n');
}

function inferCapabilitiesFromText(text) {
  const t = String(text || '').toLowerCase();
  return {
    shellCommands: /(shell|command|terminal|exec|powershell|bash|cmd)/i.test(t),
    fileWrite: /(write|delete|remove|move|rename|create|update|save|upload|overwrite|trash|mkdir|copy file|edit file)/i.test(t),
    networkRequests: /(web|http|https|fetch|search|crawler|crawl|serp|browser|url|api call|download|联网|搜索|网页)/i.test(t),
    softwareInstall: /(install|setup|package|pip|npm|pnpm|yarn|winget|choco|brew|apt|yum|dnf|msi)/i.test(t),
    systemConfig: /(registry|reg add|reg delete|service|system config|firewall|netsh|bcdedit|group policy|hosts file|proxy setting)/i.test(t),
  };
}

function mergeCapabilities(a, b) {
  return {
    shellCommands: !!(a.shellCommands || b.shellCommands),
    fileWrite: !!(a.fileWrite || b.fileWrite),
    networkRequests: !!(a.networkRequests || b.networkRequests),
    softwareInstall: !!(a.softwareInstall || b.softwareInstall),
    systemConfig: !!(a.systemConfig || b.systemConfig),
  };
}

function inferCapabilitiesFromToolContext({ toolName, args, meta, definition, isMcpTool }) {
  const name = String(toolName || '').toLowerCase();
  const desc = String(definition?.function?.description || '');
  const propKeys = Object.keys(definition?.function?.parameters?.properties || {}).join(' ');
  const cmd = String(args?.command || '');

  let caps = {
    shellCommands: false,
    fileWrite: false,
    networkRequests: false,
    softwareInstall: false,
    systemConfig: false,
  };

  caps = mergeCapabilities(caps, inferCapabilitiesFromText(`${name} ${desc} ${propKeys}`));

  if (meta?.category === 'web') caps.networkRequests = true;
  if (meta?.category === 'system') {
    caps.shellCommands = true;
    caps.systemConfig = true;
  }
  if (meta?.riskLevel === 'dangerous') {
    caps.shellCommands = true;
    caps.systemConfig = true;
    caps.fileWrite = true;
  }

  if (name === 'exec_command') {
    caps.shellCommands = true;
    const cmdCaps = {
      shellCommands: true,
      fileWrite: /(rm\s+-rf|del\s+\/s|rmdir\s+\/s|mv\b|move\b|cp\b|copy\b|ren\b|rename\b|mkdir\b|new-item\b|set-content\b|add-content\b|out-file\b|>\s*[^>]|>>\s*[^>])/i.test(cmd),
      networkRequests: /(curl\b|wget\b|invoke-webrequest\b|iwr\b|invoke-restmethod\b|irm\b|scp\b|ssh\b|ftp\b|http:\/\/|https:\/\/)/i.test(cmd),
      softwareInstall: /(npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|uv\s+pip|apt\s+install|yum\s+install|dnf\s+install|brew\s+install|winget\s+install|choco\s+install|msiexec)/i.test(cmd),
      systemConfig: /(reg\s+(add|delete)|sc\s+(config|delete)|netsh\b|bcdedit\b|systemctl\b|service\s+\w+\s+(start|stop|restart|enable|disable)|set-executionpolicy|set-itemproperty|defaults\s+write)/i.test(cmd),
    };
    caps = mergeCapabilities(caps, cmdCaps);
  }

  if (/^(web_search|web_fetch|http_request|search_knowledge)$/i.test(name)) caps.networkRequests = true;
  if (/^(write_file|memory_write|tasks_add|tasks_update|tasks_delete|task_add|task_done|task_delete|parking_add|vault_ops)$/i.test(name)) caps.fileWrite = true;

  if (isMcpTool) {
    // MCP 外部工具视为高风险面：无法可靠识别能力时走默认拒绝。
    const mcpHint = inferCapabilitiesFromText(`${name} ${desc} ${propKeys}`);
    caps = mergeCapabilities(caps, mcpHint);
  }

  return caps;
}

function hasAnyCapability(capabilities) {
  return Object.values(capabilities || {}).some(Boolean);
}

function enforceAgentPermission({ toolName, args, meta, definition, isMcpTool }) {
  const perms = getRuntimeAgentPermissions();
  const options = getPolicyOptions();
  const caps = inferCapabilitiesFromToolContext({ toolName, args, meta, definition, isMcpTool });
  const name = String(toolName || '');

  if (caps.shellCommands && !perms.shellCommands) {
    throw new Error(blockedMessage('允许执行 Shell 命令', name));
  }
  if (caps.fileWrite && !perms.fileWrite) {
    throw new Error(blockedMessage('允许文件系统写操作', name));
  }
  if (caps.networkRequests && !perms.networkRequests) {
    throw new Error(blockedMessage('允许网络请求', name));
  }
  if (caps.softwareInstall && !perms.softwareInstall) {
    throw new Error(blockedMessage('允许安装软件', name));
  }
  if (caps.systemConfig && !perms.systemConfig) {
    throw new Error(blockedMessage('允许系统配置修改', name));
  }

  if (
    isMcpTool &&
    options.strictUnknownMcpDeny &&
    !hasAnyCapability(caps) &&
    Object.values(perms).some((value) => value === false)
  ) {
    // 无法识别能力的 MCP 工具默认拒绝，避免通过“改名工具”绕过策略。
    throw new Error(blockedMessage('系统级工具权限', name, '无法识别的 MCP 工具在严格模式下默认拒绝'));
  }
}

module.exports = {
  enforceAgentPermission,
  getRuntimeAgentPermissions,
  normalizeAgentPermissions,
};
