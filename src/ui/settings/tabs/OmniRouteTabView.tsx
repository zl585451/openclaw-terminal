import React, { useState, useEffect } from 'react';
import { useApiKeys } from '../../../hooks/settings/useApiKeys';

interface Candidate {
  provider: string;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  available: boolean;
  reason: string | null;
  source: string;
}

interface CapabilityStatus {
  capability: string;
  description: string;
  tools: boolean;
  candidates: Candidate[];
  status: 'healthy' | 'degraded' | 'unavailable';
}

interface MetricCap {
  totalRequests: number;
  successRequests: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  errorCount: number;
  errorTypes: Record<string, number>;
}

interface MetricProv {
  totalRequests: number;
  successRequests: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  errorCount: number;
  errorTypes: Record<string, number>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface MetricModel {
  totalRequests: number;
  successRequests: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  errorCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface RecentRequest {
  timestamp: number;
  capability: string;
  providerId: string;
  model: string;
  latencyMs: number;
  status: number | null;
  errorType: string | null;
  tokens: number;
}

interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  capabilities: Record<string, MetricCap>;
  providers: Record<string, MetricProv>;
  models: Record<string, MetricModel>;
  recentRequests: RecentRequest[];
}

interface ExternalGatewayConnectivity {
  ok: boolean;
  status: string;
  httpStatus: number | null;
  checkedUrl: string | null;
  error: string | null;
}

interface ExternalGatewayStatus {
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  hasApiKey: boolean;
  model?: string;
  models: Record<string, string>;
  availableModels?: string[];
  connectivity: ExternalGatewayConnectivity;
}

interface StatusResponse {
  capabilities?: CapabilityStatus[];
  metrics?: Metrics | null;
  externalGateway?: ExternalGatewayStatus | null;
}

export const OmniRouteTabView: React.FC = () => {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'routing' | 'config' | 'metrics' | 'recent'>('routing');
  const { apiKeys, setApiKeys, saveGatewayAndReconnect, gatewaySaveStatus, hasGatewayConfigChanges } = useApiKeys();

  const handleInputChange = (key: string, value: any) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveConfig = async () => {
    const ok = await saveGatewayAndReconnect();
    if (ok) {
      await fetchStatus();
    }
  };

  const externalStatus = data?.externalGateway || null;
  const externalModelOptions = Array.from(new Set([
    apiKeys.OMNIROUTE_MODEL,
    externalStatus?.model,
    externalStatus?.models?.default,
    ...(externalStatus?.availableModels || []),
  ].map((item) => String(item || '').trim()).filter(Boolean)));

  const renderConfigTab = () => {
    return (
      <div className="omniroute-config-form">
        <div className="settings-field-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={apiKeys.OCT_USE_EXTERNAL_OMNIROUTE}
              onChange={(e) => handleInputChange('OCT_USE_EXTERNAL_OMNIROUTE', e.target.checked)}
            />
            启用外部 OmniRoute 模式
          </label>
        </div>

        <div className="settings-field-group">
          <label>OmniRoute Base URL</label>
          <input
            type="text"
            value={apiKeys.OMNIROUTE_BASE_URL}
            onChange={(e) => handleInputChange('OMNIROUTE_BASE_URL', e.target.value)}
            placeholder="https://api.omniroute.example/v1"
          />
        </div>

        <div className="settings-field-group">
          <label>OmniRoute API Key</label>
          <input
            type="password"
            value={apiKeys.OMNIROUTE_API_KEY}
            onChange={(e) => handleInputChange('OMNIROUTE_API_KEY', e.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div className="settings-field-group">
          <label>OmniRoute Model / Combo</label>
          {externalModelOptions.length > 0 && (
            <select
              value={apiKeys.OMNIROUTE_MODEL || ''}
              onChange={(e) => handleInputChange('OMNIROUTE_MODEL', e.target.value)}
            >
              <option value="">默认 combo/chat</option>
              {externalModelOptions.map((modelId) => (
                <option key={modelId} value={modelId}>{modelId}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={apiKeys.OMNIROUTE_MODEL}
            onChange={(e) => handleInputChange('OMNIROUTE_MODEL', e.target.value)}
            placeholder={externalModelOptions.length > 0 ? '手动覆盖模型 / Combo' : 'combo/chat 或 gemini'}
          />
        </div>

        <button
          type="button"
          className="settings-save-button"
          disabled={!hasGatewayConfigChanges || gatewaySaveStatus === 'saving'}
          onClick={handleSaveConfig}
        >
          {gatewaySaveStatus === 'saving' ? '正在保存...' : hasGatewayConfigChanges ? '保存配置' : '无需保存'}
        </button>

        {externalStatus && (
          <div className="settings-status-card mt-3">
            <p className="settings-status-line">
              外部模式：
              <span className={externalStatus.enabled ? 'settings-status-success' : 'settings-status-muted'}>
                {externalStatus.enabled ? '已启用' : '未启用'}
              </span>
            </p>
            <p className="settings-status-line">
              凭证状态：
              <span className={externalStatus.configured ? 'settings-status-success' : 'settings-status-muted'}>
                {externalStatus.configured ? 'Base URL / API Key 已配置' : '配置未完成'}
              </span>
            </p>
            <p className="settings-status-line">
              连通性：
              <span className={externalStatus.connectivity.ok ? 'settings-status-success' : 'settings-status-muted'}>
                {externalStatus.connectivity.status}
                {externalStatus.connectivity.httpStatus ? ` (${externalStatus.connectivity.httpStatus})` : ''}
              </span>
            </p>
            <p className="settings-status-line-muted">
              地址：{externalStatus.baseUrl || '—'}
            </p>
            <p className="settings-status-line-muted">
              模型出口：{externalStatus.model || externalStatus.models?.default || '—'}
            </p>
            <p className="settings-status-line-muted">
              可用模型：{externalModelOptions.length > 0 ? `${externalModelOptions.length} 个` : '未读取到'}
            </p>
            {externalStatus.connectivity.error && (
              <p className="settings-status-line-muted">
                诊断：{externalStatus.connectivity.error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };
  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://127.0.0.1:18790/omniroute/status');
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      setData(json);
    } catch (err: any) {
      console.error('[OmniRouteTabView] Failed to fetch omniroute status:', err);
      setError(err.message || '网关连接失败，请确保 Gateway 正在运行。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'healthy') return 'status-badge-success';
    if (status === 'degraded') return 'status-badge-warning';
    return 'status-badge-error';
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const renderRoutingTab = () => {
    if (!data?.capabilities || data.capabilities.length === 0) {
      return <div className="settings-no-data">无逻辑能力配置。</div>;
    }

    return (
      <div className="omniroute-routing-flow">
        {data.capabilities.map((cap) => (
          <div className="omniroute-capability-card" key={cap.capability}>
            <div className="omniroute-card-header">
              <div className="omniroute-cap-title">
                <span className="omniroute-cap-name">◈ {cap.capability}</span>
                <span className="omniroute-cap-desc">{cap.description}</span>
              </div>
              <span className={`omniroute-status-badge ${getStatusBadgeClass(cap.status)}`}>
                {cap.status === 'healthy' ? '健康 (HEALTHY)' : cap.status === 'degraded' ? '亚健康 (DEGRADED)' : '不可用 (UNAVAILABLE)'}
              </span>
            </div>

            <div className="omniroute-candidate-list">
              <table className="omniroute-table">
                <thead>
                  <tr>
                    <th>提供商 (Provider)</th>
                    <th>对应物理模型 (Model)</th>
                    <th>连接端点 (Base URL)</th>
                    <th>凭证状态</th>
                    <th>诊断解析</th>
                    <th>通道来源</th>
                  </tr>
                </thead>
                <tbody>
                  {cap.candidates.map((cand, idx) => (
                    <tr key={`${cand.provider}-${cand.model}-${idx}`} className={cand.available ? '' : 'omniroute-row-disabled'}>
                      <td>
                        <strong>{cand.provider}</strong>
                      </td>
                      <td>
                        <code>{cand.model}</code>
                      </td>
                      <td className="omniroute-url-cell" title={cand.baseUrl || ''}>
                        {cand.baseUrl ? String(cand.baseUrl).replace(/(https?:\/\/[^\/]+).*/, '$1/...') : '—'}
                      </td>
                      <td>
                        <span className={cand.hasApiKey ? 'omniroute-text-success' : 'omniroute-text-error'}>
                          {cand.hasApiKey ? '已配置 (OK)' : '未配置 (EMPTY)'}
                        </span>
                      </td>
                      <td>
                        {cand.available ? (
                          <span className="omniroute-text-success">● 可用 (Ready)</span>
                        ) : (
                          <span className="omniroute-text-error" title={cand.reason || ''}>
                            ✕ 离线 ({cand.reason || '原因未知'})
                          </span>
                        )}
                      </td>
                      <td>
                        <code className="omniroute-source-code">{cand.source}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMetricsTab = () => {
    const metrics = data?.metrics;
    if (!metrics) {
      return <div className="settings-no-data">无运行时统计指标。</div>;
    }

    const successRate = metrics.totalRequests > 0
      ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1) + '%'
      : '0.0%';

    return (
      <div className="omniroute-metrics-view">
        {/* Total stats */}
        <div className="omniroute-stats-grid">
          <div className="omniroute-stat-box">
            <span className="omniroute-stat-label">总请求次数</span>
            <span className="omniroute-stat-val text-cyan">{metrics.totalRequests}</span>
          </div>
          <div className="omniroute-stat-box">
            <span className="omniroute-stat-label">成功次数</span>
            <span className="omniroute-stat-val text-green">{metrics.successfulRequests}</span>
          </div>
          <div className="omniroute-stat-box">
            <span className="omniroute-stat-label">失败次数</span>
            <span className="omniroute-stat-val text-red">{metrics.failedRequests}</span>
          </div>
          <div className="omniroute-stat-box">
            <span className="omniroute-stat-label">综合成功率</span>
            <span className="omniroute-stat-val text-yellow">{successRate}</span>
          </div>
        </div>

        {/* Breakdown tables */}
        <div className="omniroute-metrics-tables">
          {/* Provider Stats */}
          <div className="omniroute-metric-section">
            <h5>◈ 物理通道提供商能效统计</h5>
            <table className="omniroute-table text-small">
              <thead>
                <tr>
                  <th>提供商 ID</th>
                  <th>请求数</th>
                  <th>平均延迟</th>
                  <th>异常数</th>
                  <th>Prompt Tokens</th>
                  <th>Completion Tokens</th>
                  <th>总 Token 数</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(metrics.providers).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center">暂无物理请求数据。</td>
                  </tr>
                ) : (
                  Object.entries(metrics.providers).map(([provId, m]) => (
                    <tr key={provId}>
                      <td><strong>{provId}</strong></td>
                      <td>{m.totalRequests}</td>
                      <td>{m.avgLatencyMs}ms</td>
                      <td className={m.errorCount > 0 ? 'omniroute-text-error' : ''}>{m.errorCount}</td>
                      <td>{m.promptTokens}</td>
                      <td>{m.completionTokens}</td>
                      <td>{m.totalTokens}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Capability Stats */}
          <div className="omniroute-metric-section">
            <h5>◈ 逻辑别名能效统计</h5>
            <table className="omniroute-table text-small">
              <thead>
                <tr>
                  <th>逻辑能力</th>
                  <th>请求数</th>
                  <th>平均延迟</th>
                  <th>异常数</th>
                  <th>各异常分布统计</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(metrics.capabilities).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">暂无逻辑能力调用。</td>
                  </tr>
                ) : (
                  Object.entries(metrics.capabilities).map(([capName, m]) => {
                    const errTypes = Object.entries(m.errorTypes || {})
                      .map(([type, count]) => `${type}(${count})`)
                      .join(', ') || '—';
                    return (
                      <tr key={capName}>
                        <td><strong>{capName}</strong></td>
                        <td>{m.totalRequests}</td>
                        <td>{m.avgLatencyMs}ms</td>
                        <td className={m.errorCount > 0 ? 'omniroute-text-error' : ''}>{m.errorCount}</td>
                        <td className="omniroute-text-muted">{errTypes}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderRecentTab = () => {
    const requests = data?.metrics?.recentRequests || [];
    if (requests.length === 0) {
      return <div className="settings-no-data">最近 100 次内尚无调用记录。</div>;
    }

    return (
      <div className="omniroute-recent-view">
        <h5>◈ 运行时最新请求追踪 (脱敏元数据)</h5>
        <div className="omniroute-recent-container">
          <table className="omniroute-table text-small">
            <thead>
              <tr>
                <th>时间</th>
                <th>别名能力</th>
                <th>物理通道</th>
                <th>物理模型</th>
                <th>延迟</th>
                <th>状态码</th>
                <th>异常类型</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              {requests.slice().reverse().map((req, idx) => (
                <tr key={`${req.timestamp}-${idx}`}>
                  <td>{formatTimestamp(req.timestamp)}</td>
                  <td><code>{req.capability}</code></td>
                  <td><strong>{req.providerId}</strong></td>
                  <td><code>{req.model}</code></td>
                  <td>{req.latencyMs}ms</td>
                  <td>
                    <span className={req.status === 200 || !req.status ? 'omniroute-text-success' : 'omniroute-text-error'}>
                      {req.status || '—'}
                    </span>
                  </td>
                  <td>
                    {req.errorType ? (
                      <span className="omniroute-error-pill" title={req.errorType}>{req.errorType}</span>
                    ) : (
                      <span className="omniroute-text-success">OK</span>
                    )}
                  </td>
                  <td>{req.tokens || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="settings-tab-content">
      <div className="omniroute-header-bar">
        <div className="omniroute-header-title">
          <h4>OmniRoute 智能自愈路由诊断面板</h4>
          <span className="settings-guide-copy-lg">
            基于逻辑能力别名的物理通道优先级、可用性检测和多节点自愈观测系统。
          </span>
        </div>
        <button
          type="button"
          className="settings-action-button"
          onClick={fetchStatus}
          disabled={loading}
        >
          {loading ? '正在诊断中...' : '刷新诊断指标'}
        </button>
      </div>

      {error && (
        <div className="settings-banner-warning mt-2" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Sub tabs inside OmniRoute panel */}
      <div className="omniroute-sub-tabs">
        <button
          type="button"
          className={`omniroute-sub-tab ${subTab === 'routing' ? 'active' : ''}`}
          onClick={() => setSubTab('routing')}
        >
          物理候选路由监控
        </button>
        <button
          type="button"
          className={`omniroute-sub-tab ${subTab === 'config' ? 'active' : ''}`}
          onClick={() => setSubTab('config')}
        >
          外部 OmniRoute 配置
        </button>
        <button
          type="button"
          className={`omniroute-sub-tab ${subTab === 'metrics' ? 'active' : ''}`}
          onClick={() => setSubTab('metrics')}
        >
          逻辑与通道能效分析
        </button>
        <button
          type="button"
          className={`omniroute-sub-tab ${subTab === 'recent' ? 'active' : ''}`}
          onClick={() => setSubTab('recent')}
        >
          最近请求脱敏日志
        </button>
      </div>

      <div className="omniroute-tab-pane mt-3">
        {loading && !data ? (
          <div className="settings-loading">正在与 Gateway 本机通信并分析拓扑，请稍候...</div>
        ) : (
          <>
            {subTab === 'routing' && renderRoutingTab()}
            {subTab === 'config' && renderConfigTab()}
            {subTab === 'metrics' && renderMetricsTab()}
            {subTab === 'recent' && renderRecentTab()}
          </>
        )}
      </div>
    </div>
  );
};
