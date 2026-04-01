import { useAdvancedSettings } from '../../../hooks/settings/useAdvancedSettings';

interface AdvancedTabProps {
  onClearData: () => void;
}

export function AdvancedTab({ onClearData }: AdvancedTabProps) {
  const advancedHook = useAdvancedSettings();

  return (
    <div className="settings-section">
      <h3>④ 高级设置</h3>
      
      <div className="settings-group">
        <h4>性能设置</h4>
        <div className="settings-group">
          <label>最大历史记录数</label>
          <input
            type="number"
            value={advancedHook.maxHistory}
            onChange={(e) => advancedHook.setMaxHistory(Number(e.target.value))}
            min="10"
            max="1000"
          />
          <small>设置过大可能影响性能，建议保持在 100-500 之间</small>
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
          <small>关闭后可以减少 CPU 使用，但需要手动滚动查看新消息</small>
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
          <small>AI 回复完成时显示桌面通知</small>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>显示设置</h4>
        <div className="settings-group">
          <label>全局字体大小</label>
          <select
            value={advancedHook.fontSize}
            onChange={(e) => advancedHook.setFontSize(e.target.value)}
          >
            <option value="13">紧凑 (13px)</option>
            <option value="14">标准 (14px)</option>
            <option value="15">舒适 (15px)</option>
            <option value="16">大字 (16px)</option>
            <option value="17">超大 (17px)</option>
            <option value="18">巨大 (18px)</option>
            <option value="19">超巨大 (19px)</option>
          </select>
          <small>影响整个应用的文字大小，包括代码、消息、界面元素</small>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>开发者选项</h4>
        <div className="settings-group">
          <label>调试信息</label>
          <div className="debug-info">
            <p>字体大小: {advancedHook.fontSize}px</p>
            <p>自动滚动: {advancedHook.autoScroll ? '开启' : '关闭'}</p>
            <p>通知: {advancedHook.showNotifications ? '开启' : '关闭'}</p>
            <p>历史记录上限: {advancedHook.maxHistory}</p>
            <p>本地存储键: claw-terminal-advanced-settings</p>
          </div>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>数据管理</h4>
        <div className="settings-group">
          <p className="settings-description">
            清除所有本地数据将删除：聊天记录、设置、API 密钥、主题配置等。
            此操作不可恢复，请谨慎操作。
          </p>
          <button
            onClick={onClearData}
            className="settings-btn-danger"
          >
            清除所有本地数据
          </button>
        </div>
      </div>

      <hr />

      <div className="settings-group">
        <h4>应用信息</h4>
        <div className="app-info">
          <p>应用名称: OpenClaw Terminal</p>
          <p>版本: 0.1.8</p>
          <p>构建时间: {new Date().toLocaleDateString()}</p>
          <p>运行环境: {typeof window !== 'undefined' && (window as any).electronAPI ? 'Electron' : 'Browser'}</p>
        </div>
      </div>
    </div>
  );
}