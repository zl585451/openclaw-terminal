import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  BEGINNER_PROVIDER_CARD_SUBTITLE,
  BEGINNER_PROVIDER_IDS,
  getFirstRecommendedModel,
  getRecommendedModels,
  isBeginnerProviderId,
} from '../../../hooks/settings/recommendedModels';
import type { BeginnerProviderId } from '../../../hooks/settings/recommendedModels';
import type { SettingsMode } from '../../../hooks/settings/useApiKeys';
import { humanizeAiConnectionError } from '../../../utils/aiConnectionErrors';
import { detectProviderFromKey } from '../../../utils/providerUtils';
import type { ProviderEntry, SettingsApiKeysState } from './ConnectionTabView';
import { getChatProviderApiKeyField, getChatProviderApiKeyValue, isChatProviderKeyVisible } from '../providerViewHelpers';

function buildProviderPatch(
  prev: SettingsApiKeysState,
  providerId: BeginnerProviderId,
  keyValue?: string,
  modelId?: string,
): SettingsApiKeysState {
  const next = { ...prev, OCT_PROVIDER: providerId };
  if (modelId) next.OCT_MODEL = modelId;
  if (providerId === 'deepseek') {
    next.DEEPSEEK_BASE_URL = prev.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    if (keyValue !== undefined) next.DEEPSEEK_API_KEY = keyValue;
  } else if (providerId === 'minimax') {
    next.MINIMAX_BASE_URL = prev.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
    if (keyValue !== undefined) next.MINIMAX_API_KEY = keyValue;
  } else {
    next.DASHSCOPE_BASE_URL = prev.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
    if (keyValue !== undefined) next.DASHSCOPE_API_KEY = keyValue;
  }
  return next;
}

type BeginnerProps = {
  apiKeysLoaded: boolean;
  apiKeys: SettingsApiKeysState;
  setApiKeys: Dispatch<SetStateAction<SettingsApiKeysState>>;
  showApiKey: Record<string, boolean>;
  setShowApiKey: Dispatch<SetStateAction<Record<string, boolean>>>;
  providers: Record<string, ProviderEntry>;
  currentProviderId: string;
  currentProvider: ProviderEntry | undefined;
  setSettingsMode: Dispatch<SetStateAction<SettingsMode>>;
  saveGatewayAndReconnect: () => Promise<boolean>;
  testConnectionStatus: 'idle' | 'testing' | 'success' | 'error';
  testConnectionError: string;
  setTestConnectionStatus: Dispatch<SetStateAction<'idle' | 'testing' | 'success' | 'error'>>;
  setTestConnectionError: Dispatch<SetStateAction<string>>;
};

export function ConnectionTabViewBeginner({
  apiKeysLoaded,
  apiKeys,
  setApiKeys,
  showApiKey,
  setShowApiKey,
  providers,
  currentProviderId,
  currentProvider,
  setSettingsMode,
  saveGatewayAndReconnect,
  testConnectionStatus,
  testConnectionError,
  setTestConnectionStatus,
  setTestConnectionError,
}: BeginnerProps) {
  const initialProviderId: BeginnerProviderId = isBeginnerProviderId(currentProviderId) ? currentProviderId : 'bailian-coding';
  const [selectedProviderId, setSelectedProviderId] = useState<BeginnerProviderId>(initialProviderId);
  const [recommendedIndex, setRecommendedIndex] = useState(0);
  const [detectionMessage, setDetectionMessage] = useState('');
  const [advancedSuggestion, setAdvancedSuggestion] = useState<{ providerId: string; reason: string } | null>(null);
  const [rollbackAvailable, setRollbackAvailable] = useState(false);

  const selectedProvider = (providers[selectedProviderId] || currentProvider) as ProviderEntry | undefined;
  const recommendedModels = useMemo(() => getRecommendedModels(selectedProviderId), [selectedProviderId]);
  const recommendedModel = recommendedModels[recommendedIndex] || selectedProvider?.defaultModel || '';
  const keyFieldVisible = isChatProviderKeyVisible(showApiKey, selectedProviderId);
  const currentKey = getChatProviderApiKeyValue(apiKeys, selectedProviderId);

  useEffect(() => {
    if (isBeginnerProviderId(currentProviderId)) setSelectedProviderId(currentProviderId);
  }, [currentProviderId]);

  useEffect(() => {
    setRecommendedIndex(0);
  }, [selectedProviderId]);

  useEffect(() => {
    try {
      setRollbackAvailable(!!window.localStorage.getItem('OCT_LAST_GOOD_CONFIG'));
    } catch {
      setRollbackAvailable(false);
    }
  }, []);

  const updateProvider = (providerId: BeginnerProviderId, keyValue?: string, modelId?: string) => {
    setSelectedProviderId(providerId);
    setApiKeys((prev) => buildProviderPatch(prev, providerId, keyValue, modelId || getFirstRecommendedModel(providerId) || prev.OCT_MODEL));
  };

  const handleKeyChange = (value: string) => {
    const detection = detectProviderFromKey(value);
    setAdvancedSuggestion(null);
    if (detection.confidence === 'high' && detection.providerId && isBeginnerProviderId(detection.providerId)) {
      setDetectionMessage(`检测到：${providers[detection.providerId]?.name || detection.providerId}`);
      updateProvider(detection.providerId, value);
      return;
    }
    if (detection.confidence === 'high' && detection.providerId) {
      setDetectionMessage(`检测到：${detection.providerId}`);
      setAdvancedSuggestion({ providerId: detection.providerId, reason: detection.reason });
    } else if (detection.confidence === 'medium' && detection.providerId) {
      setDetectionMessage(`我们猜是：${detection.providerId}`);
      if (!isBeginnerProviderId(detection.providerId)) {
        setAdvancedSuggestion({ providerId: detection.providerId, reason: detection.reason });
      }
    } else {
      setDetectionMessage(detection.reason);
    }
    setApiKeys((prev) => buildProviderPatch(prev, selectedProviderId, value, prev.OCT_MODEL || getFirstRecommendedModel(selectedProviderId)));
  };

  const handleSaveAndTest = async () => {
    if (!currentKey.trim()) {
      setTestConnectionStatus('error');
      setTestConnectionError('请先粘贴 API Key。');
      return;
    }
    setApiKeys((prev) => ({ ...buildProviderPatch(prev, selectedProviderId, currentKey, recommendedModel), OCT_SETTINGS_MODE: 'beginner' }));
    const ok = await saveGatewayAndReconnect();
    if (!ok) {
      setTestConnectionStatus('error');
      setTestConnectionError('连接配置保存失败，请稍后重试。');
      return;
    }

    const api = (window as any).electronAPI;
    if (!api?.testAIConnection) return;
    setTestConnectionStatus('testing');
    setTestConnectionError('');

    const provider = providers[selectedProviderId];
    const result = await api.testAIConnection({
      OCT_PROVIDER: selectedProviderId,
      OCT_MODEL: recommendedModel || provider?.defaultModel || '',
      DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY,
      DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY,
      MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY,
      CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY,
      GOOGLE_AI_API_KEY: apiKeys.GOOGLE_AI_API_KEY,
      DASHSCOPE_BASE_URL: selectedProviderId === 'bailian-coding' ? (apiKeys.DASHSCOPE_BASE_URL || provider?.baseUrl || '') : '',
      DEEPSEEK_BASE_URL: selectedProviderId === 'deepseek' ? (apiKeys.DEEPSEEK_BASE_URL || provider?.baseUrl || '') : '',
      MINIMAX_BASE_URL: selectedProviderId === 'minimax' ? (apiKeys.MINIMAX_BASE_URL || provider?.baseUrl || '') : '',
      CUSTOM_BASE_URL: '',
      GOOGLE_AI_BASE_URL: '',
    });

    if (result?.success) {
      setTestConnectionStatus('success');
      try {
        window.localStorage.setItem(
          'OCT_LAST_GOOD_CONFIG',
          JSON.stringify({ ...apiKeys, OCT_PROVIDER: selectedProviderId, OCT_MODEL: recommendedModel, OCT_SETTINGS_MODE: 'beginner' }),
        );
        setRollbackAvailable(true);
      } catch {}
    } else {
      setTestConnectionStatus('error');
      setTestConnectionError(humanizeAiConnectionError(result?.error || '', selectedProviderId));
    }
    setTimeout(() => setTestConnectionStatus('idle'), 3000);
  };

  const handleRollback = () => {
    try {
      const raw = window.localStorage.getItem('OCT_LAST_GOOD_CONFIG');
      if (!raw) return;
      const snapshot = JSON.parse(raw) as SettingsApiKeysState;
      setApiKeys(snapshot);
      setSettingsMode(snapshot.OCT_SETTINGS_MODE === 'advanced' ? 'advanced' : 'beginner');
      setRollbackAvailable(true);
      if (isBeginnerProviderId(snapshot.OCT_PROVIDER)) {
        setSelectedProviderId(snapshot.OCT_PROVIDER);
      }
    } catch {}
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-guide-card">
        <h4>新手快速开始</h4>
        <ol>
          <li>先选一家你准备使用的 AI 服务商</li>
          <li>粘贴 API Key，我们会尽量帮你识别</li>
          <li>点击「保存并测试连接」即可开始使用</li>
        </ol>
      </div>

      <section className="settings-section">
        <div className="settings-inline-row-between">
          <h3>2. AI 服务商与模型</h3>
          <button type="button" className="settings-link-btn" onClick={() => setSettingsMode('advanced')}>
            高级设置
          </button>
        </div>
        <p className="settings-desc">只保留最常见的三家服务商，先让你尽快配通。</p>
        {!apiKeysLoaded ? (
          <p className="settings-loading">加载中...</p>
        ) : (
          <>
            <div className="settings-provider-cards">
              {BEGINNER_PROVIDER_IDS.map((id) => {
                const provider = providers[id];
                const active = selectedProviderId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`settings-provider-card ${active ? 'active' : ''}`}
                    onClick={() => updateProvider(id)}
                  >
                    <span className="settings-provider-card-title">{provider?.name || id}</span>
                    <span className="settings-provider-card-subtitle">{BEGINNER_PROVIDER_CARD_SUBTITLE[id]}</span>
                  </button>
                );
              })}
            </div>

            <div className="settings-field">
              <label>API Key</label>
              <div className="settings-input-row">
                <input
                  type={keyFieldVisible ? 'text' : 'password'}
                  value={currentKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={selectedProvider?.keyPlaceholder || 'sk-xxxxxxxxxxxxxxxx'}
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => {
                    const field = getChatProviderApiKeyField(selectedProviderId);
                    setShowApiKey((s) => ({ ...s, [field]: !s[field as keyof typeof s] }));
                  }}
                >
                  {keyFieldVisible ? '🙈' : '👁'}
                </button>
              </div>
              {selectedProvider?.keyLink && (
                <a href={selectedProvider.keyLink} target="_blank" rel="noopener noreferrer" className="settings-link">
                  获取 API Key →
                </a>
              )}
              {detectionMessage && <p className="settings-desc settings-desc-compact">{detectionMessage}</p>}
              {advancedSuggestion && (
                <div className="settings-note-card settings-note-card-warning">
                  检测到这枚 Key 更适合在高级设置里配置：{advancedSuggestion.reason}
                  <div className="settings-btn-row-tight">
                    <button type="button" className="settings-link-btn" onClick={() => setSettingsMode('advanced')}>
                      切到高级设置
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="settings-field">
              <label>推荐模型</label>
              <div className="settings-inline-row-between settings-model-inline">
                <div className="settings-note-card settings-note-card-inline">
                  {recommendedModel || selectedProvider?.defaultModel || '未提供推荐模型'}
                </div>
                {recommendedModels.length > 1 && (
                  <button
                    type="button"
                    className="settings-link-btn"
                    onClick={() => {
                      const nextIndex = (recommendedIndex + 1) % recommendedModels.length;
                      setRecommendedIndex(nextIndex);
                      setApiKeys((prev) => ({ ...prev, OCT_MODEL: recommendedModels[nextIndex] }));
                    }}
                  >
                    换一个
                  </button>
                )}
              </div>
            </div>

            <div className="settings-actions-row settings-stack-md">
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={handleSaveAndTest}
                disabled={testConnectionStatus === 'testing'}
              >
                {testConnectionStatus === 'testing'
                  ? '测试中...'
                  : testConnectionStatus === 'success'
                    ? '✓ 连接成功'
                    : '保存并测试连接'}
              </button>
              {rollbackAvailable && (
                <button type="button" className="settings-btn" onClick={handleRollback}>
                  回滚到上次可用配置
                </button>
              )}
            </div>
            {testConnectionStatus === 'error' && testConnectionError && (
              <div className="settings-error-inline">{testConnectionError}</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
