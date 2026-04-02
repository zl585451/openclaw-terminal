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
  onRemoveServer: (name: string) => void;
  onRefresh: () => void;
}

export function McpTabView({
  mcpStatus,
  mcpLoading,
  newServer,
  setNewServer,
  onAddServer,
  onRemoveServer,
  onRefresh,
}: McpTabViewProps) {
  return (
    <div className="settings-tab-content">
      <section className="settings-section">
        <h3>MCP 工具服务器</h3>
        <p className="settings-desc">
          连接 MCP Server 后，AI 可以调用 MCP 提供的工具（联网搜索、图片理解等）。
        </p>

        {Object.keys(mcpStatus).length === 0 && !mcpLoading && (
          <p className="settings-desc" style={{ color: 'var(--text-tertiary)' }}>
            还没有 MCP Server，在下方添加第一个。
          </p>
        )}

        {Object.entries(mcpStatus).map(([name, info]) => (
          <div key={name} style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span className="settings-label" style={{ fontWeight: 500 }}>{name}</span>
                <span style={{
                  marginLeft: 8, fontSize: 12,
                  color: info.status === 'connected' ? 'var(--status-success)' : 'var(--status-error)'
                }}>
                  {info.status === 'connected' ? '● 已连接' : `● ${info.status}`}
                </span>
              </div>
              <button
                type="button"
                className="settings-btn"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => onRemoveServer(name)}
              >
                删除
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              {info.config?.command} {(info.config?.args || []).join(' ')}
            </div>
            {info.tools?.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                工具：{info.tools.map((t) => t.name).join('、')}
              </div>
            )}
            {info.errorMessage && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--status-error)' }}>
                {info.errorMessage}
              </div>
            )}
          </div>
        ))}

        <details className="settings-details" style={{ marginTop: 12 }}>
          <summary>+ 添加 MCP Server</summary>
          <div className="settings-details-content" style={{ marginTop: 8 }}>
            <div className="settings-field">
              <label>名称（唯一标识，字母+数字）</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.name}
                onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="minimax"
              />
            </div>
            <div className="settings-field">
              <label>启动命令</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.command}
                onChange={e => setNewServer({ ...newServer, command: e.target.value })}
                placeholder="uvx"
              />
            </div>
            <div className="settings-field">
              <label>参数（空格分隔）</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.args}
                onChange={e => setNewServer({ ...newServer, args: e.target.value })}
                placeholder="minimax-coding-plan-mcp"
              />
            </div>
            <div className="settings-field">
              <label>环境变量（每行 KEY=VALUE）</label>
              <textarea
                className="settings-input settings-input-focusable"
                value={newServer.envText}
                onChange={e => setNewServer({ ...newServer, envText: e.target.value })}
                rows={3}
                placeholder={"MINIMAX_API_KEY=your-key\nMINIMAX_API_HOST=https://api.minimaxi.com"}
              />
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              disabled={!newServer.name || !newServer.command}
              onClick={onAddServer}
            >
              连接并添加
            </button>
          </div>
        </details>

        <button type="button" className="settings-btn" style={{ marginTop: 12 }} onClick={onRefresh}>
          ↻ 刷新状态
        </button>
      </section>
    </div>
  );
}
