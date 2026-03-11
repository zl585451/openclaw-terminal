/**
 * Agent 权限控制 - 危险命令检测与拦截
 */

export interface PermissionConfig {
  shellCommands: boolean;
  fileWrite: boolean;
  networkRequests: boolean;
  softwareInstall: boolean;
  systemConfig: boolean;
}

export const DEFAULT_PERMISSIONS: PermissionConfig = {
  shellCommands: false,
  fileWrite: false,
  networkRequests: true,
  softwareInstall: false,
  systemConfig: false,
};

export const PERMISSION_STORAGE_KEY = 'claw-terminal-permissions';

export type DangerLevel = 'critical' | 'high' | 'medium';

export const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; level: DangerLevel; desc: string; category: keyof PermissionConfig }> = [
  { pattern: /rm\s+-rf/i, level: 'critical', desc: '强制递归删除', category: 'fileWrite' },
  { pattern: /del\s+\/s/i, level: 'critical', desc: '递归删除', category: 'fileWrite' },
  { pattern: /format\s+[a-z]:/i, level: 'critical', desc: '格式化磁盘', category: 'fileWrite' },
  { pattern: /curl.*\.(exe|bat|ps1|sh)/i, level: 'high', desc: '下载可执行文件', category: 'networkRequests' },
  { pattern: /wget.*\.(exe|bat|ps1|sh)/i, level: 'high', desc: '下载可执行文件', category: 'networkRequests' },
  { pattern: /powershell\s+.*-EncodedCommand/i, level: 'high', desc: '编码执行PowerShell', category: 'shellCommands' },
  { pattern: /powershell\s+.*-Command\s+/i, level: 'high', desc: 'PowerShell命令执行', category: 'shellCommands' },
  { pattern: /reg\s+(add|delete)/i, level: 'high', desc: '修改注册表', category: 'systemConfig' },
  { pattern: /sc\s+(config|delete)/i, level: 'high', desc: '修改系统服务', category: 'systemConfig' },
  { pattern: /netsh\s+/i, level: 'medium', desc: '网络配置', category: 'systemConfig' },
  { pattern: /chmod\s+777/i, level: 'medium', desc: '开放所有权限', category: 'fileWrite' },
  { pattern: /apt\s+install|yum\s+install|pip\s+install|npm\s+install/i, level: 'high', desc: '安装软件', category: 'softwareInstall' },
  { pattern: /msiexec|winget\s+install|choco\s+install/i, level: 'high', desc: '安装软件', category: 'softwareInstall' },
];

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  matched?: { desc: string; level: DangerLevel };
}

/**
 * 检查消息是否需要权限确认
 * @param message 用户输入的消息
 * @param config 权限配置
 * @returns { allowed, reason?, matched? }
 */
export function checkPermission(message: string, config: PermissionConfig): PermissionCheckResult {
  if (!message || typeof message !== 'string') {
    return { allowed: true };
  }

  const text = message.trim();
  for (const { pattern, level, desc, category } of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      const hasPermission = config[category];
      if (!hasPermission) {
        return {
          allowed: false,
          reason: `检测到危险操作: ${desc}。请在设置中开启「${getCategoryLabel(category)}」权限后重试。`,
          matched: { desc, level },
        };
      }
    }
  }

  return { allowed: true };
}

function getCategoryLabel(cat: keyof PermissionConfig): string {
  const map: Record<keyof PermissionConfig, string> = {
    shellCommands: '允许执行 Shell 命令',
    fileWrite: '允许文件系统写操作',
    networkRequests: '允许网络请求',
    softwareInstall: '允许安装软件',
    systemConfig: '允许系统配置修改',
  };
  return map[cat] || cat;
}

/**
 * 检查是否匹配危险模式（用于弹窗确认提示）
 */
export function getDangerMatch(message: string): { desc: string; level: DangerLevel } | null {
  if (!message || typeof message !== 'string') return null;
  for (const { pattern, level, desc } of DANGEROUS_PATTERNS) {
    if (pattern.test(message)) return { desc, level };
  }
  return null;
}
