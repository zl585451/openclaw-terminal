import type { Dispatch, SetStateAction } from 'react';
import type { PermissionConfig } from '../../../utils/permissionCheck';
import { PERMISSION_ITEMS, SCREENSHOT_SHORTCUT_OPTIONS } from '../constants';

export interface AdvancedTabViewProps {
  localPerm: PermissionConfig;
  setLocalPerm: Dispatch<SetStateAction<PermissionConfig>>;
  shortcutMode: 'preset' | 'custom';
  setShortcutMode: (m: 'preset' | 'custom') => void;
  screenshotShortcut: string;
  setScreenshotShortcut: (v: string) => void;
  shortcutCustom: string;
  setShortcutCustom: (v: string) => void;
  clearData: () => void;
}

export function AdvancedTabView({
  localPerm,
  setLocalPerm,
  shortcutMode,
  setShortcutMode,
  screenshotShortcut,
  setScreenshotShortcut,
  shortcutCustom,
  setShortcutCustom,
  clearData,
}: AdvancedTabViewProps) {
  return (
    <div className="settings-tab-content">
      <section className="settings-section">
        <h3>Agent 权限</h3>
        {PERMISSION_ITEMS.map(({ key, label }) => (
          <div key={key} className="settings-row">
            <label>{label}</label>
            <label className="toggle-wrap">
              <input type="checkbox" checked={localPerm[key]} onChange={(e) => setLocalPerm((p) => ({ ...p, [key]: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
        ))}
      </section>
      <section className="settings-section">
        <h3>快捷键</h3>
        <div className="settings-row">
          <label>截图</label>
          <div className="settings-shortcut-wrap">
            <select
              value={shortcutMode === 'custom' ? '__CUSTOM__' : screenshotShortcut}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__CUSTOM__') setShortcutMode('custom');
                else { setShortcutMode('preset'); setScreenshotShortcut(v); }
              }}
              className="settings-select"
            >
              {SCREENSHOT_SHORTCUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {shortcutMode === 'custom' && (
              <input type="text" value={shortcutCustom} onChange={(e) => setShortcutCustom(e.target.value)} placeholder="如 Ctrl+Alt+S" className="settings-input settings-input-focusable" style={{ width: 140 }} />
            )}
          </div>
        </div>
      </section>
      <section className="settings-section settings-danger">
        <h3>危险操作</h3>
        <button type="button" className="settings-btn settings-btn-danger" onClick={clearData}>清除所有数据</button>
      </section>
    </div>
  );
}
