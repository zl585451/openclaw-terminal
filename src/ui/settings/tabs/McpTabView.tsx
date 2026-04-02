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
  onRemoveServer: (name: string) => void;
  onRefresh: () => void;
}

// MCP 服务器预设模板
const MCP_PRESETS = [
  {
    id: 'minimax',
    name: 'MiniMax 多模态工具包',
    description: '支持图片理解、文本生成、编程规划等多模态 AI 工具',
    command: 'uvx',
    args: 'minimax-coding-plan-mcp',
    envTemplate: 'MINIMAX_API_KEY=sk-cp-your-key-here\nMINIMAX_API_HOST=https://api.minimaxi.com',
    icon: '🎯',
    category: 'AI 工具'
  },
  {
    id: 'web-search',
    name: 'Web 搜索工具',
    description: '提供实时网页搜索和内容抓取功能',
    command: 'npx',
    args: '@modelcontextprotocol/server-web-search',
    envTemplate: 'BRAVE_API_KEY=your-brave-api-key',
    icon: '🔍',
    category: '网络工具'
  },
  {
    id: 'filesystem',
    name: '文件系统工具',
    description: '提供文件读写、目录操作等本地文件系统功能',
    command: 'npx',
    args: '@modelcontextprotocol/server-filesystem /path/to/allowed/directory',
    envTemplate: '',
    icon: '📁',
    category: '系统工具'
  },
  {
    id: 'github',
    name: 'GitHub 集成',
    description: '访问 GitHub 仓库、Issues、PR 等功能',
    command: 'npx',
    args: '@modelcontextprotocol/server-github',
    envTemplate: 'GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your-token-here',
    icon: '🐙',
    category: '开发工具'
  },
  {
    id: 'sqlite',
    name: 'SQLite 数据库',
    description: '查询和操作 SQLite 数据库',
    command: 'npx',
    args: '@modelcontextprotocol/server-sqlite /path/to/database.db',
    envTemplate: '',
    icon: '🗄️',
    category: '数据库'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL 数据库',
    description: '连接和查询 PostgreSQL 数据库',
    command: 'npx',
    args: '@modelcontextprotocol/server-postgres',
    envTemplate: 'POSTGRES_CONNECTION_STRING=postgresql://user:pass@localhost:5432/dbname',
    icon: '🐘',
    category: '数据库'
  },
  {
    id: 'slack',
    name: 'Slack 集成',
    description: '发送消息、管理频道等 Slack 操作',
    command: 'npx',
    args: '@modelcontextprotocol/server-slack',
    envTemplate: 'SLACK_BOT_TOKEN=xoxb-your-bot-token\nSLACK_TEAM_ID=your-team-id',
    icon: '💬',
    category: '通讯工具'
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer 浏览器自动化',
    description: '控制浏览器进行网页截图、数据抓取等',
    command: 'npx',
    args: '@modelcontextprotocol/server-puppeteer',
    envTemplate: '',
    icon: '🎭',
    category: '自动化'
  },
  {
    id: 'custom',
    name: '自定义配置',
    description: '手动配置其他 MCP 服务器',
    command: '',
    args: '',
    envTemplate: '',
    icon: '⚙️',
    category: '其他'
  }
];

export function McpTabView({
  mcpStatus,
  mcpLoading,
  newServer,
  setNewServer,
  onAddServer,
  onRemoveServer,
  onRefresh,
}: McpTabViewProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  // 应用预设模板
  const applyPreset = (preset: typeof MCP_PRESETS[0]) => {
    if (preset.id === 'custom') {
      setNewServer({ name: '', command: '', args: '', envText: '' });
    } else {
      setNewServer({
        name: preset.id,
        command: preset.command,
        args: preset.args,
        envText: preset.envTemplate
      });
    }
    setSelectedPreset(preset.id);
    setShowAddForm(true);
  };

  // 验证环境变量格式
  const validateEnvText = (text: string): string[] => {
    const errors: string[] = [];
    const lines = text.split('\n').filter(line => line.trim());
    
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

        {/* 已连接的服务器 */}
        {Object.keys(mcpStatus).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-primary)' }}>已连接的服务器</h4>
            {Object.entries(mcpStatus).map(([name, info]) => (
              <div key={name} style={{ 
                background: 'var(--bg-surface)', 
                borderRadius: 8, 
                padding: '12px 16px', 
                marginBottom: 8,
                border: info.status === 'connected' ? '1px solid var(--status-success)' : '1px solid var(--border-primary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 16, marginRight: 8 }}>
                      {MCP_PRESETS.find(p => p.id === name)?.icon || '🔧'}
                    </span>
                    <div>
                      <span className="settings-label" style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{
                        marginLeft: 8, fontSize: 12, padding: '2px 6px', borderRadius: 4,
                        background: info.status === 'connected' ? 'var(--status-success)' : 'var(--status-error)',
                        color: 'white'
                      }}>
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
                {info.tools?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    可用工具：{info.tools.map((t) => t.name).join('、')}
                  </div>
                )}
                {info.errorMessage && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--status-error)', padding: '4px 8px', background: 'var(--bg-error)', borderRadius: 4 }}>
                    ❌ {info.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {Object.keys(mcpStatus).length === 0 && !mcpLoading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '24px', 
            background: 'var(--bg-surface)', 
            borderRadius: 8, 
            marginBottom: 16,
            border: '2px dashed var(--border-secondary)'
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔧</div>
            <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>
              还没有连接任何 MCP 服务器
            </p>
          </div>
        )}

        {/* 预设模板选择 */}
        {!showAddForm && (
          <div>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, color: 'var(--text-primary)' }}>选择要添加的 MCP 服务器</h4>
            
            {/* 按分类显示预设 */}
            {Array.from(new Set(MCP_PRESETS.map(p => p.category))).map(category => (
              <div key={category} style={{ marginBottom: 20 }}>
                <h5 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: 12, 
                  color: 'var(--text-tertiary)', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {category}
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                  {MCP_PRESETS.filter(p => p.category === category).map((preset) => (
                    <div
                      key={preset.id}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                      onClick={() => applyPreset(preset)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-primary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 20, marginRight: 10 }}>{preset.icon}</span>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>
                            {preset.name}
                          </div>
                          {preset.id !== 'custom' && (
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {preset.command} {preset.args.split(' ')[0]}
                            </div>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                        {preset.description}
                      </p>
                      
                      {/* 已安装标识 */}
                      {mcpStatus[preset.id] && (
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: mcpStatus[preset.id].status === 'connected' ? 'var(--status-success)' : 'var(--status-error)',
                          color: 'white',
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4
                        }}>
                          {mcpStatus[preset.id].status === 'connected' ? '已连接' : '错误'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加表单 */}
        {showAddForm && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
                {selectedPreset && selectedPreset !== 'custom' 
                  ? `配置 ${MCP_PRESETS.find(p => p.id === selectedPreset)?.name}`
                  : '自定义 MCP 服务器'
                }
              </h4>
              <button
                type="button"
                className="settings-btn"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={() => setShowAddForm(false)}
              >
                取消
              </button>
            </div>

            <div className="settings-field">
              <label>服务器名称</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.name}
                onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="输入唯一的服务器名称"
              />
            </div>

            <div className="settings-field">
              <label>启动命令</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.command}
                onChange={e => setNewServer({ ...newServer, command: e.target.value })}
                placeholder="如：uvx, npx, python"
              />
            </div>

            <div className="settings-field">
              <label>命令参数</label>
              <input
                className="settings-input settings-input-focusable"
                value={newServer.args}
                onChange={e => setNewServer({ ...newServer, args: e.target.value })}
                placeholder="如：minimax-coding-plan-mcp"
              />
            </div>

            <div className="settings-field">
              <label>环境变量</label>
              <textarea
                className="settings-input settings-input-focusable"
                value={newServer.envText}
                onChange={e => setNewServer({ ...newServer, envText: e.target.value })}
                rows={4}
                placeholder="每行一个环境变量，格式：KEY=VALUE"
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: 12,
                  border: envErrors.length > 0 ? '1px solid var(--status-error)' : undefined
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
              {selectedPreset && selectedPreset !== 'custom' && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  💡 请将示例值替换为真实的 API 密钥或配置
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
                  setSelectedPreset('');
                  setShowAddForm(false);
                }}
              >
                重置
              </button>
            </div>
            
            {selectedPreset && selectedPreset !== 'custom' && (
              <div style={{ 
                marginTop: 12, 
                padding: 8, 
                background: 'var(--bg-info)', 
                borderRadius: 4, 
                fontSize: 11,
                color: 'var(--text-secondary)'
              }}>
                <strong>安装提示：</strong>
                {selectedPreset === 'minimax' && ' 需要先安装 uvx：pip install uv'}
                {selectedPreset.startsWith('web') && ' 需要 Brave Search API 密钥'}
                {selectedPreset === 'github' && ' 需要 GitHub Personal Access Token'}
                {selectedPreset.includes('sql') && ' 确保数据库路径正确且可访问'}
                {selectedPreset === 'slack' && ' 需要创建 Slack App 并获取 Bot Token'}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="settings-btn" onClick={onRefresh}>
            ↻ 刷新状态
          </button>
          {!showAddForm && Object.keys(mcpStatus).length > 0 && (
            <button 
              type="button" 
              className="settings-btn" 
              onClick={() => setShowAddForm(true)}
            >
              + 添加更多
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
