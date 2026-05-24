import { useState } from 'react';
import './SetupGuide.css';

interface SetupGuideProps {
  wsConnected: boolean;
  gatewayRunning: boolean;
  onStartGateway: () => void;
  onOpenSettings: () => void;
}

export default function SetupGuide({
  wsConnected,
  gatewayRunning,
  onStartGateway,
  onOpenSettings,
}: SetupGuideProps) {
  const [expanded, setExpanded] = useState(!wsConnected);

  if (wsConnected) return null;

  return (
    <div className={`setup-guide ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="setup-guide-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="setup-guide-title">⚠ 连接失败？按下面步骤完成设置</span>
        <span className="setup-guide-toggle">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="setup-guide-body">
          <ol className="setup-steps">
            <li>
              <strong>第一步：启动 Gateway</strong>
              <p>Gateway 是对话的后端服务，必须运行才能连接。</p>
              <button
                type="button"
                className="setup-btn setup-btn-start"
                onClick={onStartGateway}
                disabled={gatewayRunning}
              >
                {gatewayRunning ? '● Gateway 已启动' : '▶ 启动 Gateway'}
              </button>
            </li>
            <li>
              <strong>第二步：配置 API Key（若需要）</strong>
              <p>在设置中填入你的大模型 API Key（如阿里云百炼、DeepSeek 等）。</p>
              <button type="button" className="setup-btn setup-btn-settings" onClick={onOpenSettings}>
                打开设置
              </button>
            </li>
          </ol>
          <p className="setup-hint">
            完成后通常几秒内会自动连接。若仍失败，请查看右侧 Gateway 日志区的错误信息。
          </p>
        </div>
      )}
    </div>
  );
}
