import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ConnectionTabViewBeginner } from './ConnectionTabView.Beginner';

import type { ApiKeysState, SettingsMode } from '../../../hooks/settings/useApiKeys';
import type { ProviderEntry } from '../providerTypes';
import {
  getChatProviderApiKeyField,
  getChatProviderApiKeyValue,
  isAnyChatProviderKeyVisible,
  isChatProviderKeyVisible,
} from '../providerViewHelpers';

export type { ProviderEntry } from '../providerTypes';
export type SettingsApiKeysState = ApiKeysState;

const CUSTOM_PROVIDER_PRESETS = [
  {
    id: '',
    label: '通用 OpenAI 兼容服务',
    baseUrl: '',
    docsUrl: '',
    modelHint: '',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    docsUrl: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
    modelHint: '例如：Qwen/Qwen2.5-72B-Instruct、deepseek-ai/DeepSeek-R1',
  },
];

const SILICONFLOW_MODEL_EXAMPLES = [
  'Qwen/Qwen2.5-72B-Instruct',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1',
  'Pro/Qwen/Qwen2.5-7B-Instruct',
];

type ImageProviderId = 'minimax' | 'siliconflow' | 'openai';

function normalizeImageProvider(raw: string): ImageProviderId {
  const provider = String(raw || '').trim().toLowerCase();
  if (provider === 'siliconflow') return 'siliconflow';
  if (provider === 'openai') return 'openai';
  return 'minimax';
}

function readScopedImageValues(state: SettingsApiKeysState, providerRaw: string) {
  const provider = normalizeImageProvider(providerRaw);
  if (provider === 'siliconflow') {
    return {
      apiKey: state.IMAGE_SILICONFLOW_API_KEY || '',
      baseUrl: state.IMAGE_SILICONFLOW_BASE_URL || '',
      model: state.IMAGE_SILICONFLOW_MODEL || '',
    };
  }
  if (provider === 'openai') {
    return {
      apiKey: state.IMAGE_OPENAI_API_KEY || '',
      baseUrl: state.IMAGE_OPENAI_BASE_URL || '',
      model: state.IMAGE_OPENAI_MODEL || '',
    };
  }
  return {
    apiKey: state.IMAGE_MINIMAX_API_KEY || '',
    baseUrl: state.IMAGE_MINIMAX_BASE_URL || '',
    model: state.IMAGE_MINIMAX_MODEL || '',
  };
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
  models: Record<string, string>;
  connectivity: ExternalGatewayConnectivity;
}

interface OmniRouteStatusResponse {
  externalGateway?: ExternalGatewayStatus | null;
}

interface OmniRouteStatusResult {
  success: boolean;
  data?: OmniRouteStatusResponse;
  error?: string;
  status?: number;
  checkedUrl?: string;
}

export const OMNIROUTE_LIVE_ALIAS_UNKNOWN = '未读取到已生效配置';

export function getLiveOmniRouteAlias(
  externalGateway: ExternalGatewayStatus | null | undefined,
  capability: 'oct-chat' | 'oct-plan' | 'oct-tool-safe',
): string | null {
  const raw = externalGateway?.models?.[capability];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function formatLiveOmniRouteAlias(
  externalGateway: ExternalGatewayStatus | null | undefined,
  capability: 'oct-chat' | 'oct-plan' | 'oct-tool-safe',
): string {
  return getLiveOmniRouteAlias(externalGateway, capability) || OMNIROUTE_LIVE_ALIAS_UNKNOWN;
}

export async function requestOmniRouteStatus(
  api: { getOmniRouteStatus?: () => Promise<OmniRouteStatusResult> } | null | undefined,
): Promise<OmniRouteStatusResult> {
  if (!api?.getOmniRouteStatus) {
    return { success: false, error: 'Gateway 状态桥未就绪。' };
  }
  try {
    return await api.getOmniRouteStatus();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || '无法读取 OmniRoute 状态。',
    };
  }
}

export interface ConnectionTabViewProps {
  apiKeysLoaded: boolean;
  apiKeys: SettingsApiKeysState;
  setApiKeys: Dispatch<SetStateAction<SettingsApiKeysState>>;
  showApiKey: Record<string, boolean>;
  setShowApiKey: Dispatch<SetStateAction<Record<string, boolean>>>;
  searchKeysRef: MutableRefObject<{ BRAVE_SEARCH_API_KEY: string; TAVILY_API_KEY: string }>;
  gatewaySaveStatus: 'idle' | 'saving' | 'success';
  saveGatewayAndReconnect: () => Promise<boolean>;
  providers: Record<string, ProviderEntry>;
  currentProviderId: string;
  currentProvider: ProviderEntry | undefined;
  settingsMode: SettingsMode;
  setSettingsMode: Dispatch<SetStateAction<SettingsMode>>;
  testConnectionStatus: 'idle' | 'testing' | 'success' | 'error';
  testConnectionError: string;
  setTestConnectionStatus: Dispatch<SetStateAction<'idle' | 'testing' | 'success' | 'error'>>;
  setTestConnectionError: Dispatch<SetStateAction<string>>;
  apiKeysRefreshing: boolean;
  refetchApiKeys: () => void;
}

// ─── 视觉 API 子组件 ──────────────────────────────────────────────────────────

function VisionApiSection({ apiKeys, setApiKeys, showApiKey, setShowApiKey }: {
  apiKeys: SettingsApiKeysState;
  setApiKeys: Dispatch<SetStateAction<SettingsApiKeysState>>;
  showApiKey: Record<string, boolean>;
  setShowApiKey: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const currentBaseUrl = apiKeys.VISION_BASE_URL || '';
  const presetId = VISION_PRESETS_LIST.find((p) => p.id !== 'custom' && p.baseUrl === currentBaseUrl)?.id || 'custom';
  const [selectedPreset, setSelectedPreset] = useState(presetId);

  useEffect(() => {
    setSelectedPreset(presetId);
  }, [presetId]);

  const onSelectPreset = (id: string) => {
    setSelectedPreset(id);
    const preset = VISION_PRESETS_LIST.find((p) => p.id === id);
    if (preset && id !== 'custom') {
      setApiKeys((k) => ({
        ...k,
        VISION_BASE_URL: preset.baseUrl,
        VISION_MODEL: k.VISION_MODEL || preset.model,
      }));
    }
  };

  const activePreset = VISION_PRESETS_LIST.find((p) => p.id === selectedPreset) || VISION_PRESETS_LIST[VISION_PRESETS_LIST.length - 1];

  return (
    <div className="settings-vision-card">
      <div className="settings-vision-card-head">
        <div>
          <div className="settings-vision-title">图片理解 API（视觉助手）</div>
          <div className="settings-vision-subtitle">
            为不支持视觉的模型（MiniMax、DeepSeek 等）提供图片理解能力。配置后，发图时会自动调用此接口生成描述，再传给主对话模型。
          </div>
        </div>
      </div>

      <div className="settings-field settings-field-compact">
        <label>服务商预设</label>
        <select
          className="settings-input settings-input-focusable"
          value={selectedPreset}
          onChange={(e) => onSelectPreset(e.target.value)}
        >
          {VISION_PRESETS_LIST.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {activePreset.keyLink && (
          <p className="settings-desc settings-desc-compact">
            <a href={activePreset.keyLink} target="_blank" rel="noreferrer" className="settings-link">
              获取 API Key →
            </a>
            {activePreset.modelHint && <span className="settings-hint-inline">{activePreset.modelHint}</span>}
          </p>
        )}
      </div>

      <div className="settings-field settings-field-compact">
        <label>API Key</label>
        <div className="settings-input-row">
          <input
            type={showApiKey.VISION_API_KEY ? 'text' : 'password'}
            value={apiKeys.VISION_API_KEY}
            onChange={(e) => setApiKeys((k) => ({ ...k, VISION_API_KEY: e.target.value }))}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            className="settings-input settings-input-focusable"
            autoComplete="off"
          />
          <button
            type="button"
            className="settings-eye-btn"
            onClick={() => setShowApiKey((s) => ({ ...s, VISION_API_KEY: !s.VISION_API_KEY }))}
          >
            {showApiKey.VISION_API_KEY ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div className="settings-field settings-field-compact">
        <label>Base URL</label>
        <input
          type="text"
          value={apiKeys.VISION_BASE_URL}
          onChange={(e) => setApiKeys((k) => ({ ...k, VISION_BASE_URL: e.target.value }))}
          placeholder="https://api.siliconflow.cn/v1"
          className="settings-input settings-input-focusable"
          autoComplete="off"
        />
      </div>

      <div className="settings-field">
        <label>视觉模型</label>
        <input
          type="text"
          value={apiKeys.VISION_MODEL}
          onChange={(e) => setApiKeys((k) => ({ ...k, VISION_MODEL: e.target.value }))}
          placeholder={activePreset.model || '例如：Qwen/Qwen2.5-VL-7B-Instruct'}
          className="settings-input settings-input-focusable"
          autoComplete="off"
        />
        <p className="settings-desc settings-desc-compact">
          留空则不启用视觉 API。三个字段（Key / URL / 模型）都填写后生效。
        </p>
      </div>
    </div>
  );
}

const VISION_PRESETS_LIST = [
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow（推荐，有免费额度）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-VL-7B-Instruct',
    keyLink: 'https://cloud.siliconflow.cn/',
    modelHint: '免费：Qwen/Qwen2.5-VL-7B-Instruct　付费：Qwen/Qwen2.5-VL-72B-Instruct',
  },
  {
    id: 'aliyun',
    label: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-max',
    keyLink: 'https://bailian.console.aliyun.com/',
    modelHint: '例如：qwen-vl-max、qwen-vl-plus',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容服务',
    baseUrl: '',
    model: '',
    keyLink: '',
    modelHint: '任何支持 image_url 多模态的 OpenAI 兼容接口',
  },
];

export function ConnectionTabView({
  apiKeysLoaded,
  apiKeys,
  setApiKeys,
  showApiKey,
  setShowApiKey,
  searchKeysRef,
  gatewaySaveStatus,
  saveGatewayAndReconnect,
  providers,
  currentProviderId,
  currentProvider,
  settingsMode,
  setSettingsMode,
  testConnectionStatus,
  testConnectionError,
  setTestConnectionStatus,
  setTestConnectionError,
  apiKeysRefreshing,
  refetchApiKeys,
}: ConnectionTabViewProps) {
  const customPresetId = currentProviderId === 'custom'
    ? (apiKeys.CUSTOM_BASE_URL || '').toLowerCase().includes('siliconflow') ? 'siliconflow' : ''
    : '';

  const [statusData, setStatusData] = useState<OmniRouteStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showOmniKey, setShowOmniKey] = useState(false);
  const [omniTestingStatus, setOmniTestingStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [omniTestingError, setOmniTestingError] = useState('');

  const fetchStatus = async () => {
    if (!apiKeys.OCT_USE_EXTERNAL_OMNIROUTE) {
      setStatusData(null);
      setStatusError(null);
      return;
    }
    setStatusLoading(true);
    setStatusError(null);
    try {
      const api = (window as any).electronAPI;
      const result = await requestOmniRouteStatus(api);
      if (!result.success || !result.data) {
        throw new Error(result.error || '无法读取 OmniRoute 状态。');
      }
      setStatusData(result.data);
    } catch (err: any) {
      console.warn('[ConnectionTabView] Failed to fetch OmniRoute status:', err);
      setStatusError('无法连接 Gateway 后台服务，请检查 Gateway 是否正常启动并运行。');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [apiKeys.OCT_USE_EXTERNAL_OMNIROUTE]);

  const handleSaveAndTestOmni = async () => {
    if (!apiKeys.OMNIROUTE_BASE_URL?.trim() || !apiKeys.OMNIROUTE_API_KEY?.trim()) {
      setOmniTestingStatus('error');
      setOmniTestingError('请先填写 Base URL 和 API Key 之后再保存并测试连接。');
      return;
    }
    setOmniTestingStatus('testing');
    setOmniTestingError('');
    const ok = await saveGatewayAndReconnect();
    if (!ok) {
      setOmniTestingStatus('error');
      setOmniTestingError('配置保存并 reconnect Gateway 失败，请检查 Gateway 运行状态。');
      return;
    }
    try {
      const api = (window as any).electronAPI;
      const result = await requestOmniRouteStatus(api);
      if (result.success && result.data) {
        const nextStatus = result.data;
        setStatusData(nextStatus);
        if (nextStatus?.externalGateway?.connectivity?.ok) {
          setOmniTestingStatus('success');
        } else {
          setOmniTestingStatus('error');
          setOmniTestingError(nextStatus?.externalGateway?.connectivity?.error || '外部 OmniRoute 连通性测试失败。');
        }
      } else {
        setOmniTestingStatus('error');
        setOmniTestingError(result.error || '后台诊断失败，请检查 Gateway 状态。');
      }
    } catch (err: any) {
      setOmniTestingStatus('error');
      setOmniTestingError(err.message || '无法向网关端点发起测试请求。');
    }
    setTimeout(() => {
      setOmniTestingStatus('idle');
    }, 4000);
  };

  if (apiKeys.OCT_USE_EXTERNAL_OMNIROUTE) {
    const extStatus = statusData?.externalGateway || null;
    const isUnconfigured = !apiKeys.OMNIROUTE_BASE_URL?.trim() || !apiKeys.OMNIROUTE_API_KEY?.trim();
    const chatAlias = formatLiveOmniRouteAlias(extStatus, 'oct-chat');
    const planAlias = formatLiveOmniRouteAlias(extStatus, 'oct-plan');
    const toolAlias = formatLiveOmniRouteAlias(extStatus, 'oct-tool-safe');

    return (
      <div className="settings-tab-content">
        <div className="settings-guide-card">
          <h4>推荐配置：外部 OmniRoute 模式</h4>
          <p className="settings-desc">
            此模式下，OCT 的底层能力模型完全收敛至外部统一智能网关，由外部统一分配、切换和自愈。
          </p>
        </div>

        {/* Mode selector header */}
        {settingsMode !== 'beginner' && (
          <div className="omniroute-mode-container">
            <button
              type="button"
              className="omniroute-mode-btn active"
              onClick={() => {
                setApiKeys((prev) => ({ ...prev, OCT_USE_EXTERNAL_OMNIROUTE: true }));
              }}
            >
              ◈ 外部 OmniRoute 模式 (推荐)
            </button>
            <button
              type="button"
              className="omniroute-mode-btn"
              onClick={() => {
                setApiKeys((prev) => ({ ...prev, OCT_USE_EXTERNAL_OMNIROUTE: false }));
              }}
            >
              ◈ 本地兼容模式 (旧配置)
            </button>
          </div>
        )}

        <section className="settings-section">
          <h3>OmniRoute 连接配置</h3>
          
          <div className="settings-field">
            <label>OmniRoute Base URL</label>
            <input
              type="text"
              value={apiKeys.OMNIROUTE_BASE_URL || ''}
              onChange={(e) => setApiKeys((prev) => ({ ...prev, OMNIROUTE_BASE_URL: e.target.value }))}
              placeholder="https://api.omniroute.example/v1"
              className="settings-input settings-input-focusable"
              autoComplete="off"
            />
          </div>

          <div className="settings-field">
            <label>OmniRoute API Key</label>
            <div className="settings-input-row">
              <input
                type={showOmniKey ? 'text' : 'password'}
                value={apiKeys.OMNIROUTE_API_KEY || ''}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, OMNIROUTE_API_KEY: e.target.value }))}
                placeholder="sk-..."
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
              <button
                type="button"
                className="settings-eye-btn"
                onClick={() => setShowOmniKey(!showOmniKey)}
              >
                {showOmniKey ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <details className="settings-details">
            <summary>高级：模型别名映射（Alias Configuration）</summary>
            <div className="settings-details-content">
              <div className="settings-field">
                <label>Chat Model Alias (对话别名)</label>
                <input
                  type="text"
                  value={apiKeys.OMNIROUTE_CHAT_MODEL || ''}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, OMNIROUTE_CHAT_MODEL: e.target.value }))}
                  placeholder="combo/chat"
                  className="settings-input settings-input-focusable"
                />
              </div>

              <div className="settings-field">
                <label>Plan Model Alias (规划别名)</label>
                <input
                  type="text"
                  value={apiKeys.OMNIROUTE_PLAN_MODEL || ''}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, OMNIROUTE_PLAN_MODEL: e.target.value }))}
                  placeholder="combo/plan"
                  className="settings-input settings-input-focusable"
                />
              </div>

              <div className="settings-field">
                <label>Tool Model Alias (工具安全通道别名)</label>
                <input
                  type="text"
                  value={apiKeys.OMNIROUTE_TOOL_MODEL || ''}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, OMNIROUTE_TOOL_MODEL: e.target.value }))}
                  placeholder="combo/tool"
                  className="settings-input settings-input-focusable"
                />
              </div>
            </div>
          </details>

          <div className="settings-actions-row">
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              onClick={handleSaveAndTestOmni}
              disabled={omniTestingStatus === 'testing'}
            >
              {omniTestingStatus === 'testing'
                ? '保存并测试中...'
                : omniTestingStatus === 'success'
                  ? '✓ 连接成功'
                  : '保存并测试连接'}
            </button>
          </div>
          {omniTestingStatus === 'error' && omniTestingError && (
            <div className="settings-error-inline">{omniTestingError}</div>
          )}
        </section>

        {/* Real-time Status Panel */}
        <section className="omniroute-diagnostic-card">
          <div className="omniroute-diagnostic-title">
            <span>◈ 外部 OmniRoute 运行状态诊断</span>
          </div>

          <div className="omniroute-diagnostic-item">
            <span className="omniroute-diagnostic-label">链路模式</span>
            <span className="omniroute-diagnostic-value text-cyan">
              外部 OmniRoute 模式
            </span>
          </div>

          <div className="omniroute-diagnostic-item">
            <span className="omniroute-diagnostic-label">诊断连通性</span>
            <span className="omniroute-diagnostic-value">
              {isUnconfigured ? (
                <span className="omniroute-text-error">⚠️ 配置不完整 (Unconfigured)</span>
              ) : statusLoading ? (
                <span className="omniroute-text-muted">正在检测中...</span>
              ) : statusError ? (
                <span className="omniroute-text-error" title={statusError}>✕ 连通未知 (Gateway Offline)</span>
              ) : extStatus?.connectivity?.ok ? (
                <span className="omniroute-text-success">
                  ✓ 连通正常 (Reachable) {extStatus.connectivity.httpStatus ? `(${extStatus.connectivity.httpStatus})` : ''}
                </span>
              ) : (
                <span className="omniroute-text-error" title={extStatus?.connectivity?.error || ''}>
                  ✕ 连通失败 (Connection Failed)
                </span>
              )}
            </span>
          </div>

          <div className="omniroute-diagnostic-item">
            <span className="omniroute-diagnostic-label">Chat 逻辑别名出口</span>
            <span className="omniroute-diagnostic-value">
              <code>{chatAlias}</code>
            </span>
          </div>

          <div className="omniroute-diagnostic-item">
            <span className="omniroute-diagnostic-label">Plan 逻辑别名出口</span>
            <span className="omniroute-diagnostic-value">
              <code>{planAlias}</code>
            </span>
          </div>

          <div className="omniroute-diagnostic-item">
            <span className="omniroute-diagnostic-label">Tool-safe 逻辑别名出口</span>
            <span className="omniroute-diagnostic-value">
              <code>{toolAlias}</code>
            </span>
          </div>

          {extStatus?.connectivity?.error && !isUnconfigured && (
            <div className="settings-note-card settings-note-card-warning mt-2">
              <strong>诊断报错：</strong> {extStatus.connectivity.error}
            </div>
          )}
          {!isUnconfigured && !statusLoading && !statusError && (
            <div className="settings-note-card mt-2">
              诊断面板只显示 Gateway 当前已生效的实际出口映射；未保存草稿不会在这里冒充生效状态。
            </div>
          )}
        </section>
      </div>
    );
  }
  if (settingsMode === 'beginner') {
    return (
      <ConnectionTabViewBeginner
        apiKeysLoaded={apiKeysLoaded}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        providers={providers}
        currentProviderId={currentProviderId}
        currentProvider={currentProvider}
        setSettingsMode={setSettingsMode}
        saveGatewayAndReconnect={saveGatewayAndReconnect}
        testConnectionStatus={testConnectionStatus}
        testConnectionError={testConnectionError}
        setTestConnectionStatus={setTestConnectionStatus}
        setTestConnectionError={setTestConnectionError}
      />
    );
  }

  return (
    <div className="settings-tab-content">
      {/* Mode selector header */}
      <div className="omniroute-mode-container">
        <button
          type="button"
          className="omniroute-mode-btn"
          onClick={() => {
            setApiKeys((prev) => ({ ...prev, OCT_USE_EXTERNAL_OMNIROUTE: true }));
          }}
        >
          ◈ 外部 OmniRoute 模式 (推荐)
        </button>
        <button
          type="button"
          className="omniroute-mode-btn active"
          onClick={() => {
            setApiKeys((prev) => ({ ...prev, OCT_USE_EXTERNAL_OMNIROUTE: false }));
          }}
        >
          ◈ 本地兼容模式 (旧配置)
        </button>
      </div>

      {/* Warning Banner urging upgrade */}
      <div className="omniroute-alert-banner">
        <div className="omniroute-alert-banner-text">
          💡 <strong>当前处于「本地兼容模式」：</strong>我们强烈建议您启用统一的 <strong>OmniRoute 智能自愈网关</strong>，享受更高速、稳定的多模型自愈与智能路由服务。
        </div>
        <button
          type="button"
          className="omniroute-alert-banner-btn"
          onClick={() => {
            setApiKeys((prev) => ({ ...prev, OCT_USE_EXTERNAL_OMNIROUTE: true }));
          }}
        >
          一键开启外部 OmniRoute
        </button>
      </div>

      <div className="settings-guide-card">
        <h4>推荐配置</h4>
        <ol>
          <li>主对话 AI：负责聊天、写作、Canvas 和工具调用，建议直连百炼等官方接口</li>
          <li>工具 AI：图片、向量、后台分析、生图等专项能力，建议后续统一走 New API 网关</li>
          <li>不确定的配置先保持默认，需要时再展开高级配置</li>
        </ol>
      </div>

      <details className="settings-details settings-details-tight">
        <summary>高级：Gateway 连接</summary>
        <div className="settings-details-content">
        {!apiKeysLoaded ? (
          <p className="settings-loading">加载中...</p>
        ) : (
          <>
            <div className="settings-field">
              <label>Gateway 地址</label>
              <input
                type="text"
                value={apiKeys.OPENCLAW_WS_URL}
                onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_WS_URL: e.target.value }))}
                placeholder="ws://127.0.0.1:18789"
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
            </div>
            <div className="settings-field">
              <label>Token（无则留空）</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.OPENCLAW_TOKEN ? 'text' : 'password'}
                  value={apiKeys.OPENCLAW_TOKEN}
                  onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_TOKEN: e.target.value }))}
                  placeholder="没有 Token 请留空"
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, OPENCLAW_TOKEN: !s.OPENCLAW_TOKEN }))}
                >
                  {showApiKey.OPENCLAW_TOKEN ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <details className="settings-details">
              <summary>Token 什么时候需要填写？</summary>
              <div className="settings-details-content">
                <p className="settings-guide-copy">
                  桌面应用会在首次启动时自动生成 Gateway Token，并同步给内置 Gateway 与前端连接。通常保持默认值即可，不需要手动获取。
                </p>
                <p>
                  只有在你手动连接外部 Gateway，或自己通过环境变量 / 配置文件设置了 <strong>OCT_GATEWAY_TOKEN</strong> 时，才需要在这里填入同一个 Token。
                </p>
                <p>
                  如果不确定是否需要填写，请保留当前值或留空，然后点击「保存并重新连接」。连接成功后右上角会显示 CONNECTED。
                </p>
              </div>
            </details>
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              onClick={saveGatewayAndReconnect}
              disabled={gatewaySaveStatus === 'saving'}
            >
              {gatewaySaveStatus === 'saving' ? '保存中...' : gatewaySaveStatus === 'success' ? '已保存 ✓' : '保存并重新连接'}
            </button>
          </>
        )}
        </div>
      </details>

      <section className="settings-section">
        <h3>1. 主对话 AI</h3>
        <p className="settings-desc">用于实时对话、写作、Canvas 和工具调用。这里优先选择直连官方接口，体验会比多走一层网关更稳。</p>
        {!apiKeysLoaded ? null : (
          <>
            <div className="settings-field">
              <div className="settings-inline-row-between">
                <label>AI 服务商</label>
                <button
                  type="button"
                  className="settings-link-btn"
                  onClick={() => setSettingsMode('beginner')}
                >
                  切回新手模式
                </button>
              </div>
              <select
                value={currentProviderId}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = providers[id];
                  setApiKeys((k) => ({
                    ...k,
                    OCT_PROVIDER: id,
                    OCT_MODEL: p?.defaultModel || k.OCT_MODEL,
                    DASHSCOPE_BASE_URL: id === 'deepseek' || id === 'minimax' || id === 'custom' || id === 'google' || id === 'newapi' ? k.DASHSCOPE_BASE_URL : (p?.baseUrl || ''),
                    DEEPSEEK_BASE_URL: id === 'deepseek' ? (p?.baseUrl || '') : k.DEEPSEEK_BASE_URL,
                    MINIMAX_BASE_URL: id === 'minimax' ? (p?.baseUrl || '') : k.MINIMAX_BASE_URL,
                    MOONSHOT_BASE_URL: id === 'moonshot' ? (p?.baseUrl || '') : k.MOONSHOT_BASE_URL,
                    NEWAPI_BASE_URL: id === 'newapi' ? (p?.baseUrl || '') : k.NEWAPI_BASE_URL,
                    CUSTOM_BASE_URL: id === 'custom' ? (p?.baseUrl || '') : k.CUSTOM_BASE_URL,
                    GOOGLE_AI_BASE_URL: id === 'google' ? (p?.baseUrl || '') : k.GOOGLE_AI_BASE_URL,
                  }));
                }}
                className="settings-input settings-input-focusable settings-input-full"
              >
                {Object.entries(providers).map(([id, p]) => (
                  <option key={id} value={id}>{p.name}</option>
                ))}
                {Object.keys(providers).length === 0 && (
                  <option value="bailian-coding">阿里云百炼 Coding Plan</option>
                )}
              </select>
            </div>
            <div className="settings-field">
              <label>API Key</label>
              <div className="settings-input-row">
                <input
                  type={isAnyChatProviderKeyVisible(showApiKey) ? 'text' : 'password'}
                  value={getChatProviderApiKeyValue(apiKeys, currentProviderId)}
                  onChange={(e) => {
                    const key = getChatProviderApiKeyField(currentProviderId);
                    setApiKeys((k) => ({ ...k, [key]: e.target.value }));
                  }}
                  placeholder={currentProvider?.keyPlaceholder || 'sk-xxxxxxxxxxxxxxxx'}
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => {
                    const key = getChatProviderApiKeyField(currentProviderId);
                    setShowApiKey((s) => ({ ...s, [key]: !s[key as keyof typeof s] }));
                  }}
                >
                  {isChatProviderKeyVisible(showApiKey, currentProviderId) ? '🙈' : '👁'}
                </button>
              </div>
              {currentProvider?.keyLink && (
                <a href={currentProvider.keyLink} target="_blank" rel="noopener noreferrer" className="settings-link">获取 API Key →</a>
              )}
              {currentProviderId === 'minimax' && (
                <p className="settings-desc settings-desc-spaced">
                  MiniMax M2.7 现在建议使用 Token Plan 专属 API Key，通常以 <code>sk-cp-</code> 开头；大陆区 Base URL 保持 <code>https://api.minimaxi.com/v1</code> 即可。
                </p>
              )}
              {currentProviderId === 'google' && (
                <p className="settings-desc settings-desc-spaced">
                  默认走 Google 官方 <strong>@google/genai / Vertex AI 原生 SDK</strong>。建议把 Base URL 填成
                  <code>https://aiplatform.googleapis.com/v1beta1/projects/你的PROJECT_ID/locations/us-central1/endpoints/openapi</code>，
                  这样网关能自动识别项目与区域；计费直接落到你的 GCP 项目，工具调用与多轮兼容性也会比 OpenAI 兼容层更稳。
                </p>
              )}
              {currentProviderId === 'newapi' && (
                <p className="settings-desc settings-desc-spaced">
                  New API 建议作为外部分发网关单独部署；这里填写 New API 里创建的令牌，Base URL 通常是
                  <code>http://127.0.0.1:3000/v1</code> 或你的公网网关地址。
                </p>
              )}
            </div>
            <div className="settings-field">
              <label>当前模型</label>
              {currentProviderId === 'siliconflow' ? (
                <>
                  <input
                    type="text"
                    value={apiKeys.OCT_MODEL || ''}
                    onChange={(e) => setApiKeys((k) => ({ ...k, OCT_MODEL: e.target.value }))}
                    placeholder={
                      currentProvider?.defaultModel
                      || 'Qwen/Qwen2.5-72B-Instruct（与硅基模型广场 ID 一致）'
                    }
                    className="settings-input settings-input-focusable settings-input-full"
                    autoComplete="off"
                  />
                  <p className="settings-desc settings-desc-compact">
                    硅基流动模型较多且更新快，请直接填写官方模型 ID（与 OpenAI 兼容字段 <code>model</code> 一致）。
                    <a
                      href="https://docs.siliconflow.cn/cn/userguide/quickstart"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-link settings-link-inline"
                    >
                      文档与模型广场 →
                    </a>
                  </p>
                  <div className="settings-chip-row">
                    {(currentProvider?.models || []).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="settings-chip-btn"
                        onClick={() => setApiKeys((k) => ({ ...k, OCT_MODEL: m.id }))}
                        title={m.label}
                      >
                        {m.label}
                      </button>
                    ))}
                    {SILICONFLOW_MODEL_EXAMPLES.filter(
                      (id) => !(currentProvider?.models || []).some((m) => m.id === id),
                    ).map((model) => (
                      <button
                        key={model}
                        type="button"
                        className="settings-chip-btn"
                        onClick={() => setApiKeys((k) => ({ ...k, OCT_MODEL: model }))}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <select
                  value={apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus'}
                  onChange={(e) => {
                    const modelId = e.target.value;
                    setApiKeys((k) => ({
                      ...k,
                      OCT_MODEL: modelId,
                      CUSTOM_MODEL: modelId === '__custom__' ? (k.CUSTOM_MODEL || '') : k.CUSTOM_MODEL,
                    }));
                  }}
                  className="settings-input settings-input-focusable settings-input-full"
                >
                  {(currentProvider?.models || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.label} {m.tools ? '🔧' : ''} {m.thinking ? '🧠' : ''}</option>
                  ))}
                  {(!currentProvider?.models?.length) && (
                    <option value="qwen3.5-plus">Qwen 3.5 Plus</option>
                  )}
                </select>
              )}
            </div>
            {/* 自定义模型输入框 - 当选择 __custom__ 或 provider 支持自定义模型时显示 */}
            {(apiKeys.OCT_MODEL === '__custom__' || currentProvider?.allowCustomModel) && (
              <div className="settings-field">
                <label>自定义模型名称</label>
                <input
                  type="text"
                  value={apiKeys.CUSTOM_MODEL || ''}
                  onChange={(e) => setApiKeys((k) => ({ 
                    ...k, 
                    CUSTOM_MODEL: e.target.value,
                  }))}
                  placeholder="例如：gpt-4o-mini, claude-3-5-sonnet, gemini-pro..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <p className="settings-desc settings-desc-compact">
                  输入任意 OpenAI 兼容格式的模型名称
                </p>
                {currentProviderId === 'custom' && (
                  <>
                    <div className="settings-chip-row">
                      {SILICONFLOW_MODEL_EXAMPLES.map((model) => (
                        <button
                          key={model}
                          type="button"
                          className="settings-chip-btn"
                          onClick={() => setApiKeys((k) => ({
                            ...k,
                            CUSTOM_MODEL: model,
                          }))}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                    <p className="settings-desc settings-desc-spaced">
                      上面这些是常见的硅基流动模型 ID，可直接点选填入。
                    </p>
                  </>
                )}
              </div>
            )}
            {currentProviderId === 'custom' && (
              <>
                <div className="settings-field">
                  <label>请求地址预设</label>
                  <select
                    value={customPresetId}
                    onChange={(e) => {
                      const preset = CUSTOM_PROVIDER_PRESETS.find((item) => item.id === e.target.value);
                      setApiKeys((k) => ({
                        ...k,
                        CUSTOM_BASE_URL: preset?.baseUrl || '',
                      }));
                    }}
                    className="settings-input settings-input-focusable"
                  >
                    {CUSTOM_PROVIDER_PRESETS.map((preset) => (
                      <option key={preset.id || 'generic'} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <p className="settings-desc settings-desc-compact">
                    走 OpenAI 兼容服务时，这里就是 API 请求地址。接硅基流动可直接选择预设。
                  </p>
                    {customPresetId === 'siliconflow' && (
                      <div className="settings-stack-sm">
                        <a
                          href="https://docs.siliconflow.cn/cn/userguide/quickstart"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-link"
                      >
                        查看硅基流动快速上手与模型广场 →
                      </a>
                    </div>
                  )}
                </div>
                <div className="settings-field">
                  <label>请求地址（Base URL）</label>
                  <input
                    type="text"
                    value={apiKeys.CUSTOM_BASE_URL}
                    onChange={(e) => {
                      setApiKeys((k) => ({ ...k, CUSTOM_BASE_URL: e.target.value }));
                    }}
                    placeholder="https://your-api.com/v1"
                    className="settings-input settings-input-focusable"
                    autoComplete="off"
                  />
                  <p className="settings-desc settings-desc-compact">
                    输入 OpenAI 兼容格式的 API 地址，通常以 /v1 结尾。按硅基流动中文文档，推荐填写 https://api.siliconflow.cn/v1
                  </p>
                </div>
              </>
            )}
            <details className="settings-details settings-details-tight">
              <summary>高级：Base URL</summary>
              <div className="settings-details-content">
                {currentProviderId === 'custom' ? (
                  <p className="settings-desc">
                    自定义服务的请求地址已在上方主表单中配置，这里无需重复填写。
                  </p>
                ) : (
                <div className="settings-field">
                  <label>Base URL（通常自动填充，自定义时可修改）</label>
                  <input
                    type="text"
                    value={
                      currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_BASE_URL : 
                      currentProviderId === 'minimax' ? apiKeys.MINIMAX_BASE_URL :
                      currentProviderId === 'moonshot' ? apiKeys.MOONSHOT_BASE_URL :
                      currentProviderId === 'custom' ? apiKeys.CUSTOM_BASE_URL :
                      currentProviderId === 'google' ? apiKeys.GOOGLE_AI_BASE_URL :
                      currentProviderId === 'newapi' ? apiKeys.NEWAPI_BASE_URL :
                      apiKeys.DASHSCOPE_BASE_URL
                    }
                    onChange={(e) => {
                      let key: keyof SettingsApiKeysState;
                      if (currentProviderId === 'deepseek') key = 'DEEPSEEK_BASE_URL';
                      else if (currentProviderId === 'minimax') key = 'MINIMAX_BASE_URL';
                      else if (currentProviderId === 'moonshot') key = 'MOONSHOT_BASE_URL';
                      else if (currentProviderId === 'newapi') key = 'NEWAPI_BASE_URL';
                      else if (currentProviderId === 'custom') key = 'CUSTOM_BASE_URL';
                      else if (currentProviderId === 'google') key = 'GOOGLE_AI_BASE_URL';
                      else key = 'DASHSCOPE_BASE_URL';
                      setApiKeys((k) => ({ ...k, [key]: e.target.value }));
                    }}
                    placeholder={currentProviderId === 'custom' ? 'https://your-api.com/v1' : 'https://...'}
                    className="settings-input settings-input-focusable"
                    autoComplete="off"
                  />
                  {currentProviderId === 'custom' && (
                    <p className="settings-desc settings-desc-compact">
                      输入 OpenAI 兼容格式的 API 地址，通常以 /v1 结尾。按硅基流动中文文档，推荐填写 https://api.siliconflow.cn/v1
                    </p>
                  )}
                </div>
                )}
              </div>
            </details>
            <div className="settings-actions-row settings-stack-md">
              <button
                type="button"
                className="settings-btn"
                onClick={async () => {
                  const api = (window as any).electronAPI;
                  if (!api?.testAIConnection) return;
                  setTestConnectionStatus('testing');
                  setTestConnectionError('');
                  const providerId = currentProviderId;
                  const p = providers[providerId];
                  let testModel = apiKeys.OCT_MODEL || p?.defaultModel || 'qwen3.5-plus';
                  if (providerId === 'custom' && apiKeys.CUSTOM_MODEL) {
                    testModel = apiKeys.CUSTOM_MODEL;
                  }
                  if (providerId === 'newapi' && testModel === '__custom__' && apiKeys.CUSTOM_MODEL) {
                    testModel = apiKeys.CUSTOM_MODEL;
                  }
                  if (providerId === 'google' && testModel === '__custom__' && apiKeys.CUSTOM_MODEL) {
                    testModel = apiKeys.CUSTOM_MODEL;
                  }
                    const result = await api.testAIConnection({
                      OCT_PROVIDER: providerId,
                      OCT_MODEL: testModel,
                      DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY,
                      DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY,
                      MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY,
                      MOONSHOT_API_KEY: apiKeys.MOONSHOT_API_KEY,
                      CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY,
                      NEWAPI_API_KEY: apiKeys.NEWAPI_API_KEY,
                      GOOGLE_AI_API_KEY: apiKeys.GOOGLE_AI_API_KEY,
                      DASHSCOPE_BASE_URL: providerId === 'deepseek' || providerId === 'minimax' || providerId === 'custom' || providerId === 'google' || providerId === 'moonshot' || providerId === 'newapi' ? '' : (apiKeys.DASHSCOPE_BASE_URL || p?.baseUrl || ''),
                      DEEPSEEK_BASE_URL: providerId === 'deepseek' ? (apiKeys.DEEPSEEK_BASE_URL || p?.baseUrl || '') : '',
                      MINIMAX_BASE_URL: providerId === 'minimax' ? (apiKeys.MINIMAX_BASE_URL || p?.baseUrl || '') : '',
                      MOONSHOT_BASE_URL: providerId === 'moonshot' ? (apiKeys.MOONSHOT_BASE_URL || p?.baseUrl || '') : '',
                      NEWAPI_BASE_URL: providerId === 'newapi' ? (apiKeys.NEWAPI_BASE_URL || p?.baseUrl || '') : '',
                      CUSTOM_BASE_URL: providerId === 'custom' ? (apiKeys.CUSTOM_BASE_URL || p?.baseUrl || '') : '',
                      GOOGLE_AI_BASE_URL: providerId === 'google' ? (apiKeys.GOOGLE_AI_BASE_URL || p?.baseUrl || '') : '',
                    });
                  setTestConnectionStatus(result.success ? 'success' : 'error');
                  if (!result.success) setTestConnectionError(result.error || '');
                  setTimeout(() => setTestConnectionStatus('idle'), 3000);
                }}
                disabled={testConnectionStatus === 'testing'}
              >
                {testConnectionStatus === 'testing' ? '测试中...' : testConnectionStatus === 'success' ? '✓ 连接成功' : '测试连接'}
              </button>
              {testConnectionStatus === 'error' && testConnectionError && (
                <span className="settings-error-inline">{testConnectionError}</span>
              )}
            </div>

          </>
        )}
      </section>

      <section className="settings-section">
        <h3>2. 工具 AI 网关</h3>
        <p className="settings-desc">
          工具 AI 用于图片、向量、后台分析、生图和批量任务。当前这些能力仍在高级配置中分别设置；后续会收敛到一个 New API 令牌。
        </p>
        <div className="settings-note-card">
          推荐过渡方案：主对话直连百炼，工具能力逐步统一到 New API。这样能保留聊天速度，又方便以后做额度和收费。
        </div>
      </section>

      <details className="settings-details">
        <summary>高级：专项能力配置</summary>
        <div className="settings-details-content">
          <section className="settings-section settings-section-nested">
            <h3>内容创作 Agent</h3>
            <div className="settings-field">
              <label>真实化开关</label>
              <input
                type="text"
                value={apiKeys.SCRIPT_ADAPTER_REAL_AGENTS || ''}
                onChange={(e) => setApiKeys((k) => ({ ...k, SCRIPT_ADAPTER_REAL_AGENTS: e.target.value }))}
                placeholder="all"
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
              <p className="settings-desc settings-desc-compact">
                复制粘贴 <code>all</code> 后保存并重新连接，即启用内容创作工作台 5 个 Agent 的真实产物链路。留空或填 <code>off</code> 则回到 mock。
              </p>
            </div>
          </section>

          <section className="settings-section settings-section-nested">
            <h3>网络代理</h3>
            <div className="settings-field settings-field-offset">
              <label>HTTPS 代理（可选，仅 oct-gateway 出站）</label>
              <input
                type="text"
                value={apiKeys.HTTPS_PROXY || ''}
                onChange={(e) => setApiKeys((k) => ({ ...k, HTTPS_PROXY: e.target.value }))}
                placeholder="http://127.0.0.1:10809"
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
              <p className="settings-desc settings-desc-compact">
                访问 Gemini / Google 等境外接口时使用。填 V2rayN「本地 HTTP 代理」地址（常见 10809，以你本机为准）。留空则不走代理。保存后会写入配置并重启网关。
              </p>
            </div>
          </section>

          <section className="settings-section settings-section-nested">
            <h3>生图配置</h3>
            <p className="settings-desc">
              独立于聊天模型的生图 API 配置。默认不会复用聊天 Key，避免跨服务商串 key。
              只有打开下方“允许回退”开关时，才会在生图 Key 为空时尝试聊天 Key。
            </p>

            <div className="settings-field">
              <label>生图服务商</label>
              <select
                value={apiKeys.IMAGE_PROVIDER || 'minimax'}
                onChange={(e) => {
                  const provider = normalizeImageProvider(e.target.value);
                  setApiKeys((k) => {
                    const scoped = readScopedImageValues(k, provider);
                    return {
                      ...k,
                      IMAGE_PROVIDER: provider,
                      IMAGE_API_KEY: scoped.apiKey,
                      IMAGE_BASE_URL: scoped.baseUrl,
                      IMAGE_MODEL: scoped.model,
                    };
                  });
                }}
                className="settings-input settings-input-focusable"
              >
                <option value="minimax">MiniMax image-01（推荐）</option>
                <option value="openai">OpenAI / 其他 OpenAI 兼容（含手动填硅基 URL）</option>
                <option value="siliconflow">硅基流动 SiliconFlow（推荐硅基生图）</option>
              </select>
            </div>

            <div className="settings-field">
              <label>生图 API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.IMAGE_API_KEY ? 'text' : 'password'}
                  value={apiKeys.IMAGE_API_KEY || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setApiKeys((k) => {
                      const provider = normalizeImageProvider(k.IMAGE_PROVIDER);
                      return {
                        ...k,
                        IMAGE_API_KEY: value,
                        IMAGE_MINIMAX_API_KEY: provider === 'minimax' ? value : k.IMAGE_MINIMAX_API_KEY,
                        IMAGE_SILICONFLOW_API_KEY: provider === 'siliconflow' ? value : k.IMAGE_SILICONFLOW_API_KEY,
                        IMAGE_OPENAI_API_KEY: provider === 'openai' ? value : k.IMAGE_OPENAI_API_KEY,
                      };
                    });
                  }}
                  placeholder="建议单独填写生图服务商对应的 Key"
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, IMAGE_API_KEY: !s.IMAGE_API_KEY }))}
                >
                  {showApiKey.IMAGE_API_KEY ? '🙈' : '👁'}
                </button>
              </div>
              <p className="settings-desc settings-desc-compact">
                当前值会保存到所选生图服务商的独立配置中，不会覆盖其他生图服务商。
              </p>
            </div>

            <div className="settings-field">
              <label>生图 Base URL</label>
              <input
                type="text"
                value={apiKeys.IMAGE_BASE_URL || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setApiKeys((k) => {
                    const provider = normalizeImageProvider(k.IMAGE_PROVIDER);
                    return {
                      ...k,
                      IMAGE_BASE_URL: value,
                      IMAGE_MINIMAX_BASE_URL: provider === 'minimax' ? value : k.IMAGE_MINIMAX_BASE_URL,
                      IMAGE_SILICONFLOW_BASE_URL: provider === 'siliconflow' ? value : k.IMAGE_SILICONFLOW_BASE_URL,
                      IMAGE_OPENAI_BASE_URL: provider === 'openai' ? value : k.IMAGE_OPENAI_BASE_URL,
                    };
                  });
                }}
                placeholder={
                  apiKeys.IMAGE_PROVIDER === 'openai'
                    ? 'https://api.openai.com'
                    : apiKeys.IMAGE_PROVIDER === 'siliconflow'
                      ? 'https://api.siliconflow.cn/v1'
                      : 'https://api.minimax.chat'
                }
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
            </div>

            <div className="settings-field">
              <label>生图模型</label>
              <input
                type="text"
                value={apiKeys.IMAGE_MODEL || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setApiKeys((k) => {
                    const provider = normalizeImageProvider(k.IMAGE_PROVIDER);
                    return {
                      ...k,
                      IMAGE_MODEL: value,
                      IMAGE_MINIMAX_MODEL: provider === 'minimax' ? value : k.IMAGE_MINIMAX_MODEL,
                      IMAGE_SILICONFLOW_MODEL: provider === 'siliconflow' ? value : k.IMAGE_SILICONFLOW_MODEL,
                      IMAGE_OPENAI_MODEL: provider === 'openai' ? value : k.IMAGE_OPENAI_MODEL,
                    };
                  });
                }}
                placeholder={
                  apiKeys.IMAGE_PROVIDER === 'openai'
                    ? 'dall-e-3'
                    : apiKeys.IMAGE_PROVIDER === 'siliconflow'
                      ? 'Kwai-Kolors/Kolors'
                      : 'image-01'
                }
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
            </div>

            <div className="settings-field">
              <label>生图 Key 回退策略</label>
              <div className="settings-inline-row-between">
                <p className="settings-desc settings-desc-inline">
                  允许回退到聊天 Key（默认关闭，建议保持关闭）
                </p>
                <label className="toggle-wrap">
                  <input
                    type="checkbox"
                    checked={!!apiKeys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY}
                    onChange={(e) => setApiKeys((k) => ({
                      ...k,
                      IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: e.target.checked,
                    }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              <p className="settings-desc settings-desc-compact settings-desc-warning">
                开启后可能把聊天服务商的 Key 误用于生图服务商，只有临时兼容旧配置时再启用。
              </p>
            </div>

            <div className="settings-field">
              <label>图片尺寸</label>
              <select
                value={apiKeys.IMAGE_SIZE || '1024x1024'}
                onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_SIZE: e.target.value }))}
                className="settings-input settings-input-focusable"
              >
                <option value="1024x1024">1024×1024（方形 1:1）</option>
                <option value="1280x720">1280×720（横向 16:9）</option>
                <option value="720x1280">720×1280（竖向 9:16）</option>
                <option value="1024x768">1024×768（横向 4:3）</option>
                <option value="768x1024">768×1024（竖向 3:4）</option>
              </select>
            </div>
          </section>

          <VisionApiSection apiKeys={apiKeys} setApiKeys={setApiKeys} showApiKey={showApiKey} setShowApiKey={setShowApiKey} />

      <section className="settings-section settings-section-nested">
        <div className="settings-inline-row">
          <h3 className="settings-heading-inline">搜索引擎 API</h3>
          <button
            type="button"
            className="settings-link-btn"
            onClick={refetchApiKeys}
            disabled={apiKeysRefreshing}
            title="重新从配置文件加载"
          >
            {apiKeysRefreshing ? '加载中...' : '↻ 刷新'}
          </button>
        </div>
        <p className="settings-desc">配置搜索引擎 API Key，用于 AI 联网搜索。优先级：Brave → Tavily → DuckDuckGo（无需 Key）</p>
        {!apiKeysLoaded ? null : (
          <>
            <div className="settings-field">
              <label>Brave Search API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.BRAVE_SEARCH_API_KEY ? 'text' : 'password'}
                  value={apiKeys.BRAVE_SEARCH_API_KEY || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    searchKeysRef.current.BRAVE_SEARCH_API_KEY = val;
                    setApiKeys((k) => ({ ...k, BRAVE_SEARCH_API_KEY: val }));
                  }}
                  placeholder="BSA..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, BRAVE_SEARCH_API_KEY: !s.BRAVE_SEARCH_API_KEY }))}
                >
                  {showApiKey.BRAVE_SEARCH_API_KEY ? '🙈' : '👁'}
                </button>
              </div>
              <a href="https://api.search.brave.com/app/keys" target="_blank" rel="noopener noreferrer" className="settings-link">获取 Brave Search API Key →</a>
            </div>
            <div className="settings-field">
              <label>Tavily API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.TAVILY_API_KEY ? 'text' : 'password'}
                  value={apiKeys.TAVILY_API_KEY || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    searchKeysRef.current.TAVILY_API_KEY = val;
                    setApiKeys((k) => ({ ...k, TAVILY_API_KEY: val }));
                  }}
                  placeholder="tvly-..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, TAVILY_API_KEY: !s.TAVILY_API_KEY }))}
                >
                  {showApiKey.TAVILY_API_KEY ? '🙈' : '👁'}
                </button>
              </div>
              <a href="https://tavily.com/" target="_blank" rel="noopener noreferrer" className="settings-link">获取 Tavily API Key →</a>
            </div>
            <div className="settings-note-card">
              💡 <strong>DuckDuckGo</strong> 无需 API Key，作为免费降级方案自动启用
            </div>
          </>
        )}
      </section>
        </div>
      </details>
    </div>
  );
}
