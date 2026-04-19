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
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-primary)' }}>已连接的服务器</h4>
            {Object.entries(mcpStatus).map(([name, info]) => (
              <div
                key={name}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 8,
                  border: info.status === 'connected' ? '1px solid var(--status-success)' : '1px solid var(--border-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 16, marginRight: 8 }}>{getServerIcon(name)}</span>
                    <div>
                      <span className="settings-label" style={{ fontWeight: 500 }}>{name}</span>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: info.status === 'connected' ? 'var(--status-success)' : 'var(--status-error)',
                          color: 'white',
                        }}
                      >
                        {info.status === 'connected' ? '已连接' : info.status}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-btn"
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => onRemoveServer(name)}
                  >
                    删除
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  命令：{info.config?.command} {(info.config?.args || []).join(' ')}
                </div>
                {name === 'file_ops' && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-secondary)',
                      background: 'var(--bg-base)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                          全盘访问（高风险）
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
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
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    可用工具：{info.tools.map((t) => t.name).join('、')}
                  </div>
                )}
                {info.errorMessage && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: 'var(--status-error)',
                      padding: '4px 8px',
                      background: 'var(--bg-error)',
                      borderRadius: 4,
                    }}
                  >
                    ❌ {info.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {Object.keys(mcpStatus).length === 0 && !mcpLoading && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px',
              background: 'var(--bg-surface)',
              borderRadius: 8,
              marginBottom: 16,
              border: '2px dashed var(--border-secondary)',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔧</div>
            <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>还没有连接任何 MCP 服务器</p>
          </div>
        )}

        <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>手动添加 MCP 服务器</h4>
            <button
              type="button"
              className="settings-btn"
              style={{ padding: '4px 8px', fontSize: 12 }}
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
              className="settings-input settings-input-focusable"
              value={newServer.envText}
              onChange={(e) => setNewServer({ ...newServer, envText: e.target.value })}
              rows={4}
              placeholder="每行一个环境变量，格式：KEY=VALUE"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                border: envErrors.length > 0 ? '1px solid var(--status-error)' : undefined,
              }}
            />
            {envErrors.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {envErrors.map((error, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--status-error)' }}>
                    ⚠️ {error}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
            <div
              style={{
                marginTop: 12,
                padding: 8,
                background: 'var(--bg-info)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <strong>常用示例：</strong> `uvx minimax-coding-plan-mcp -y`（需先安装 uv/uvx，并配置 `MINIMAX_API_KEY`）。
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="settings-btn" onClick={onRefresh}>
            ↻ 刷新状态
          </button>
        </div>
      </section>
    </div>
  );
}
