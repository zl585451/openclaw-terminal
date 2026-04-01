import { useScreenshotShortcut } from '../../../hooks/settings/useScreenshotShortcut';
import { useAdvancedSettings } from '../../../hooks/settings/useAdvancedSettings';
import { useTheme } from '../../../themes/ThemeProvider';
import { allThemes, type ThemeId } from '../../../themes/themes';
import { FONT_SIZE_OPTIONS, SCREENSHOT_SHORTCUT_OPTIONS, PERMISSION_ITEMS } from '../constants';

interface InterfaceTabProps {
  local: any; // Settings from context
  setLocal: (settings: any) => void;
  localPerm: any; // Permissions from context
  setLocalPerm: (permissions: any) => void;
}

export function InterfaceTab({ local, setLocal, localPerm, setLocalPerm }: InterfaceTabProps) {
  const screenshotHook = useScreenshotShortcut();
  const advancedHook = useAdvancedSettings();
  const { themeId, setTheme } = useTheme();

  return (
    <div className="settings-section">
      <h3>② 界面设置</h3>
      
      <div className="settings-group">
        <h4>字体与显示</h4>
        <div className="settings-group">
          <label>字体大小</label>
          <select
            value={advancedHook.fontSize}
            onChange={(e) => advancedHook.setFontSize(e.target.value)}
          >
            {FONT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-group">
          <label>
            <input
              type="checkbox"
              checked={advancedHook.autoScroll}
              onChange={(e) => advancedHook.setAutoScroll(e.target.checked)}
            />
            自动滚动到最新消息
          </label>
        </div>

        <div className="settings-group">
          <label>
            <input
              type="checkbox"
              checked={advancedHook.showNotifications}
              onChange={(e) => advancedHook.setShowNotifications(e.target.checked)}
            />
            显示系统通知
          </label>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>快捷键设置</h4>
        <div className="settings-group">
          <label>截图快捷键</label>
          <select
            value={screenshotHook.screenshotShortcut}
            onChange={(e) => {
              screenshotHook.setScreenshotShortcut(e.target.value);
              if (e.target.value === '__CUSTOM__') {
                screenshotHook.setShortcutMode('custom');
              } else {
                screenshotHook.setShortcutMode('preset');
              }
            }}
          >
            {SCREENSHOT_SHORTCUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {screenshotHook.shortcutMode === 'custom' && (
            <input
              type="text"
              value={screenshotHook.shortcutCustom}
              onChange={(e) => screenshotHook.setShortcutCustom(e.target.value)}
              placeholder="自定义快捷键，如 Ctrl+Alt+S"
            />
          )}
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>主题设置</h4>
        <div className="settings-group">
          <label>主题</label>
          <select
            value={themeId}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
          >
            {Object.entries(allThemes).map(([themeKey, theme]) => (
              <option key={themeKey} value={themeKey}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>流式打字设置</h4>
        <div className="settings-group">
          <label>打字速度</label>
          <select
            value={local.streamSpeed}
            onChange={(e) => setLocal({ ...local, streamSpeed: e.target.value })}
          >
            <option value="fast">快速</option>
            <option value="medium">中等</option>
            <option value="slow">慢速</option>
          </select>
        </div>

        <div className="settings-group">
          <label>打字音效</label>
          <select
            value={local.typingSoundMode}
            onChange={(e) => setLocal({ ...local, typingSoundMode: e.target.value })}
          >
            <option value="off">关闭</option>
            <option value="typewriter">打字机</option>
            <option value="soft">轻柔</option>
            <option value="bubble">气泡</option>
          </select>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>权限管理</h4>
        <p className="settings-description">
          控制 AI 助手可以执行的操作类型。建议根据使用场景谨慎开启。
        </p>
        {PERMISSION_ITEMS.map((item) => (
          <div key={item.key} className="settings-group">
            <label>
              <input
                type="checkbox"
                checked={localPerm[item.key]}
                onChange={(e) => setLocalPerm({ ...localPerm, [item.key]: e.target.checked })}
              />
              {item.label}
            </label>
          </div>
        ))}
      </div>

      <hr />

      <div className="settings-group">
        <h4>历史记录</h4>
        <div className="settings-group">
          <label>最大历史记录数</label>
          <input
            type="number"
            value={advancedHook.maxHistory}
            onChange={(e) => advancedHook.setMaxHistory(Number(e.target.value))}
            min="10"
            max="1000"
          />
          <small>设置过大可能影响性能</small>
        </div>
      </div>
    </div>
  );
}