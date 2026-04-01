import type { PermissionConfig } from '../../utils/permissionCheck';

export const SCREENSHOT_SHORTCUT_OPTIONS = [
  { value: 'Alt+A', label: 'Alt+A' },
  { value: 'CommandOrControl+Shift+X', label: 'Ctrl+Shift+X' },
  { value: 'CommandOrControl+Shift+S', label: 'Ctrl+Shift+S' },
  { value: '__CUSTOM__', label: '自定义' },
] as const;

export const FONT_SIZE_OPTIONS = [
  { value: '13', label: '紧凑 (13px)' },
  { value: '15', label: '标准 (15px)' },
  { value: '17', label: '舒适 (17px)' },
  { value: '19', label: '大字 (19px)' },
] as const;

export const PERMISSION_ITEMS: Array<{ key: keyof PermissionConfig; label: string }> = [
  { key: 'shellCommands', label: '允许执行 Shell 命令' },
  { key: 'fileWrite', label: '允许文件系统写操作' },
  { key: 'networkRequests', label: '允许网络请求' },
  { key: 'softwareInstall', label: '允许安装软件' },
  { key: 'systemConfig', label: '允许系统配置修改' },
];

