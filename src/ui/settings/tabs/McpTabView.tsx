import { useState } from 'react';

export interface McpServerInfo {
  status: string;
  errorMessage?: string;
  tools: Array<{ name: string; description: string }>;
  config: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface McpTabViewProps {
  mcpStatus: Record<string, McpServerInfo>;
  mcpLoading: boolean;
  newServer: { name: string; command: string; args: string; envText: string };
  setNewServer: (v: { name: string; command: string; args: string; envText: string }) => void;
  onAddServer: () => void;
  onUpdateServer: (name: string, cfg: { command: string; args: string[]; env: Record<string, string> }) => void;
  onRemoveServer: (name: string) => void;
  onRefresh: () => void;
}

function getServerIcon(name: string): string {
  if (name === 'minimax') return '🎯';
  return '🔧';
}

export function McpTabView({
  mcpStatus,
  mcpLoading,
  newServer,
  setNewServer,
  onAddServer,
  onUpdateServer,
  onRemoveServer,
  onRefresh,
}: McpTabViewProps) {
  const [showInstallHint, setShowInstallHint] = useState(false);

  const validateEnvText = (text: string): string[] => {
    const errors: string[] = [];
    const lines = text.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (!line.includes('=')) {
        errors.push(`格式错误：${line}`);
      } else if (line.endsWith('=')) {
        errors.push(`值为空：${line}`);
      } else if (line.includes('your-') || line.includes('-here')) {
        errors.push(`请替换示例值：${line.split('=')[0]}`);
      }
    }

    return errors;
  };

  const envErrors = validateEnvText(newServer.envText);
  const canSubmit = newServer.name && newServer.command && envErrors.length === 0;

  return (
    <div className="settings-tab-content">
      <section className="settings-section">
        <h3>MCP 工具服务器</h3>
        <p className="settings-desc">
          连接 MCP Server 后，AI 可以调用 MCP 提供的工具（联网搜索、图片理解等）。
        </p>

        {Object.keys(mcpStatus).length > 0 && (
          <div className="settings-list-section">
            <h4 className="settings-subtitle">已连接的服务器</h4>
            {Object.entries(mcpStatus).map(([name, info]) => (
              <div
                key={name}
                className={`settings-server-card ${info.status === 'connected' ? 'settings-server-card-connected' : ''}`}
              >
                <div className="settings-server-head">
                  <div className="settings-server-identity">
                    <span className="settings-server-icon">{getServerIcon(name)}</span>
                    <div>
                      <span className="settings-label settings-label-strong">{name}</span>
                      <span
                        className={`settings-status-pill ${info.status === 'connected' ? 'settings-status-pill-connected' : 'settings-status-pill-error'}`}
                      >
                        {info.status === 'connected' ? '已连接' : info.status}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-btn settings-small-btn-wide"
                    onClick={() => onRemoveServer(name)}
                  >
                    删除
                  </button>
                </div>
                <div className="settings-command-line">
                  命令：{info.config?.command} {(info.config?.args || []).join(' ')}
                </div>
                {name === 'file_ops' && (
                  <div className="settings-risk-card">
                    <div className="settings-inline-row-between">
                      <div>
                        <div className="settings-risk-title">
                          全盘访问（高风险）
                        </div>
                        <div className="settings-risk-desc">
                          关闭时仅白名单目录可操作；开启后可操作任意目录。
                        </div>
                      </div>
                      <label className="toggle-wrap" title="切换 file_ops 的全盘访问开关">
                        <input
                          type="checkbox"
                          checked={String(info.config?.env?.OCT_FILE_OPS_UNSAFE_ALLOW_ALL || '').trim() === '1'}
                          disabled={mcpLoading}
                          onChange={(e) => {
                            const nextEnv = {
                              ...(info.config?.env || {}),
                              OCT_FILE_OPS_UNSAFE_ALLOW_ALL: e.target.checked ? '1' : '0',
                            };
                            onUpdateServer(name, {
                              command: info.config?.command || 'node',
                              args: info.config?.args || [],
                              env: nextEnv,
                            });
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                )}
                {info.tools?.length > 0 && (
                  <div className="settings-tool-list">
                    可用工具：{info.tools.map((t) => t.name).join('、')}
                  </div>
                )}
                {info.errorMessage && (
                  <div className="settings-inline-error-card">
                    ❌ {info.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {Object.keys(mcpStatus).length === 0 && !mcpLoading && (
          <div className="settings-empty-state">
            <div className="settings-empty-icon">🔧</div>
            <p className="settings-empty-text">还没有连接任何 MCP 服务器</p>
          </div>
        )}

        <div className="settings-form-card">
          <div className="settings-form-card-head">
            <h4 className="settings-subtitle settings-heading-inline">手动添加 MCP 服务器</h4>
            <button
              type="button"
              className="settings-btn settings-small-btn-narrow"
              onClick={() => setShowInstallHint((v) => !v)}
            >
              {showInstallHint ? '隐藏提示' : '显示提示'}
            </button>
          </div>

          <div className="settings-field">
            <label>服务器名称</label>
            <input
              className="settings-input settings-input-focusable"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              placeholder="输入唯一的服务器名称"
            />
          </div>

          <div className="settings-field">
            <label>启动命令</label>
            <input
              className="settings-input settings-input-focusable"
              value={newServer.command}
              onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
              placeholder="如：uvx, npx, python"
            />
          </div>

          <div className="settings-field">
            <label>命令参数</label>
            <input
              className="settings-input settings-input-focusable"
              value={newServer.args}
              onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
              placeholder="如：minimax-coding-plan-mcp"
            />
          </div>

          <div className="settings-field">
            <label>环境变量</label>
            <textarea
              className={`settings-input settings-input-focusable settings-textarea-mono ${envErrors.length > 0 ? 'settings-textarea-error' : ''}`}
              value={newServer.envText}
              onChange={(e) => setNewServer({ ...newServer, envText: e.target.value })}
              rows={4}
              placeholder="每行一个环境变量，格式：KEY=VALUE"
            />
            {envErrors.length > 0 && (
              <div className="settings-validation-list">
                {envErrors.map((error, i) => (
                  <div key={i} className="settings-validation-error">
                    ⚠️ {error}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="settings-actions-row settings-stack-lg">
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              disabled={!canSubmit}
              onClick={onAddServer}
              title={!canSubmit ? '请填写完整信息并修复环境变量错误' : ''}
            >
              {mcpLoading ? '连接中...' : '连接并添加'}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                setNewServer({ name: '', command: '', args: '', envText: '' });
              }}
            >
              重置
            </button>
          </div>

          {showInstallHint && (
            <div className="settings-info-card">
              <strong>常用示例：</strong> `uvx minimax-coding-plan-mcp -y`（需先安装 uv/uvx，并配置 `MINIMAX_API_KEY`）。
            </div>
          )}
        </div>

        <div className="settings-actions-row settings-stack-lg">
          <button type="button" className="settings-btn" onClick={onRefresh}>
            ↻ 刷新状态
          </button>
        </div>
      </section>
    </div>
  );
}
