import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

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

export type SettingsApiKeysState = {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  IMAGE_PROVIDER: string;
  IMAGE_API_KEY: string;
  IMAGE_BASE_URL: string;
  IMAGE_MODEL: string;
  IMAGE_SIZE: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  CUSTOM_MODEL: string; // 自定义模型名称
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  CUSTOM_BASE_URL: string; // 自定义 Base URL
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
  VISION_API_KEY: string;
  VISION_BASE_URL: string;
  VISION_MODEL: string;
};

export type ProviderEntry = {
  id: string;
  name: string;
  baseUrl: string;
  keyLink: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: Array<{ id: string; label: string; tools: boolean; thinking: boolean; custom?: boolean }>;
  allowCustomModel?: boolean;
};

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

      <div className="settings-field" style={{ marginBottom: 10 }}>
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
          <p className="settings-desc" style={{ fontSize: 12, marginTop: 4 }}>
            <a href={activePreset.keyLink} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              获取 API Key →
            </a>
            {activePreset.modelHint && <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{activePreset.modelHint}</span>}
          </p>
        )}
      </div>

      <div className="settings-field" style={{ marginBottom: 10 }}>
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

      <div className="settings-field" style={{ marginBottom: 10 }}>
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
        <p className="settings-desc" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
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

  return (
    <div className="settings-tab-content">
      <div className="settings-guide-card">
        <h4>配置步骤</h4>
        <ol>
          <li>若曾安装 Nocturne，先点击「修复配置」</li>
          <li>在右侧面板点击「▶ 启动」启动 Gateway</li>
          <li>填写下方 API Key，点击「保存并重新连接」</li>
        </ol>
      </div>

      <section className="settings-section">
        <h3>1. Gateway 连接</h3>
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
              <summary>如何获取 Token？</summary>
              <div className="settings-details-content">
                <p style={{ marginBottom: 12 }}><strong>方法：在终端运行命令</strong></p>
                <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>openclaw dashboard --no-open</span>
                  <button
                    type="button"
                    className="settings-copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText('openclaw dashboard --no-open');
                      const btn = document.activeElement as HTMLButtonElement;
                      const orig = btn.textContent;
                      btn.textContent = '已复制 ✓';
                      setTimeout(() => { btn.textContent = orig; }, 1500);
                    }}
                  >
                    复制
                  </button>
                </div>
                <p style={{ marginBottom: 8 }}>命令执行后会输出类似这样的网址：</p>
                <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                  http://127.0.0.1:18789/dashboard#token=<span style={{ color: 'var(--status-warning)' }}>xxxxx-xxxxx-xxxxx</span>&amp;...
                </div>
                <p><strong>复制黄色高亮部分的 token 值</strong>（#token= 后面到 &amp; 之前的内容），粘贴到上方输入框即可。</p>
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
      </section>

      <section className="settings-section">
        <h3>2. AI 服务商与模型</h3>
        <p className="settings-desc">选择服务商、填入 API Key、选择模型，即可开始对话</p>
        {!apiKeysLoaded ? null : (
          <>
            <div className="settings-field">
              <label>AI 服务商</label>
              <select
                value={currentProviderId}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = providers[id];
                  setApiKeys((k) => ({
                    ...k,
                    OCT_PROVIDER: id,
                    OCT_MODEL: p?.defaultModel || k.OCT_MODEL,
                    DASHSCOPE_BASE_URL: id === 'deepseek' || id === 'minimax' || id === 'custom' ? k.DASHSCOPE_BASE_URL : (p?.baseUrl || ''),
                    DEEPSEEK_BASE_URL: id === 'deepseek' ? (p?.baseUrl || '') : k.DEEPSEEK_BASE_URL,
                    MINIMAX_BASE_URL: id === 'minimax' ? (p?.baseUrl || '') : k.MINIMAX_BASE_URL,
                    CUSTOM_BASE_URL: id === 'custom' ? (p?.baseUrl || '') : k.CUSTOM_BASE_URL,
                  }));
                }}
                className="settings-input settings-input-focusable"
                style={{ maxWidth: '100%' }}
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
                  type={showApiKey.DASHSCOPE_API_KEY || showApiKey.DEEPSEEK_API_KEY || showApiKey.MINIMAX_API_KEY || showApiKey.CUSTOM_API_KEY ? 'text' : 'password'}
                  value={
                    currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_API_KEY : 
                    currentProviderId === 'minimax' ? apiKeys.MINIMAX_API_KEY :
                    currentProviderId === 'custom' ? apiKeys.CUSTOM_API_KEY : 
                    apiKeys.DASHSCOPE_API_KEY
                  }
                  onChange={(e) => {
                    let key: keyof SettingsApiKeysState;
                    if (currentProviderId === 'deepseek') key = 'DEEPSEEK_API_KEY';
                    else if (currentProviderId === 'minimax') key = 'MINIMAX_API_KEY';
                    else if (currentProviderId === 'custom') key = 'CUSTOM_API_KEY';
                    else key = 'DASHSCOPE_API_KEY';
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
                    let key: string;
                    if (currentProviderId === 'deepseek') key = 'DEEPSEEK_API_KEY';
                    else if (currentProviderId === 'minimax') key = 'MINIMAX_API_KEY';
                    else if (currentProviderId === 'custom') key = 'CUSTOM_API_KEY';
                    else key = 'DASHSCOPE_API_KEY';
                    setShowApiKey((s) => ({ ...s, [key]: !s[key as keyof typeof s] }));
                  }}
                >
                  {currentProviderId === 'deepseek' 
                    ? (showApiKey.DEEPSEEK_API_KEY ? '🙈' : '👁') 
                    : currentProviderId === 'minimax'
                    ? (showApiKey.MINIMAX_API_KEY ? '🙈' : '👁')
                    : currentProviderId === 'custom'
                    ? (showApiKey.CUSTOM_API_KEY ? '🙈' : '👁')
                    : (showApiKey.DASHSCOPE_API_KEY ? '🙈' : '👁')}
                </button>
              </div>
              {currentProvider?.keyLink && (
                <a href={currentProvider.keyLink} target="_blank" rel="noopener noreferrer" className="settings-link">获取 API Key →</a>
              )}
              {currentProviderId === 'minimax' && (
                <p className="settings-desc" style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }}>
                  MiniMax M2.7 现在建议使用 Token Plan 专属 API Key，通常以 <code>sk-cp-</code> 开头；大陆区 Base URL 保持 <code>https://api.minimaxi.com/v1</code> 即可。
                </p>
              )}
            </div>
            <div className="settings-field">
              <label>当前模型</label>
              <select
                value={apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus'}
                onChange={(e) => {
                  const modelId = e.target.value;
                  setApiKeys((k) => ({ 
                    ...k, 
                    OCT_MODEL: modelId,
                    // 如果选择了自定义模型，使用已保存的自定义模型名称
                    CUSTOM_MODEL: modelId === '__custom__' ? (k.CUSTOM_MODEL || '') : k.CUSTOM_MODEL
                  }));
                }}
                className="settings-input settings-input-focusable"
                style={{ maxWidth: '100%' }}
              >
                {(currentProvider?.models || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label} {m.tools ? '🔧' : ''} {m.thinking ? '🧠' : ''}</option>
                ))}
                {(!currentProvider?.models?.length) && (
                  <option value="qwen3.5-plus">Qwen 3.5 Plus</option>
                )}
              </select>
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
                    // 如果当前是自定义模式，同步更新 OCT_MODEL
                    OCT_MODEL: k.OCT_MODEL === '__custom__' ? e.target.value : k.OCT_MODEL
                  }))}
                  placeholder="例如：gpt-4o-mini, claude-3-5-sonnet, gemini-pro..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <p className="settings-desc" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                  输入任意 OpenAI 兼容格式的模型名称
                </p>
                {currentProviderId === 'custom' && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {SILICONFLOW_MODEL_EXAMPLES.map((model) => (
                        <button
                          key={model}
                          type="button"
                          className="settings-chip-btn"
                          onClick={() => setApiKeys((k) => ({
                            ...k,
                            CUSTOM_MODEL: model,
                            OCT_MODEL: k.OCT_MODEL === '__custom__' ? model : k.OCT_MODEL,
                          }))}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                    <p className="settings-desc" style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }}>
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
                  <p className="settings-desc" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                    走 OpenAI 兼容服务时，这里就是 API 请求地址。接硅基流动可直接选择预设。
                  </p>
                    {customPresetId === 'siliconflow' && (
                      <div style={{ marginTop: 8 }}>
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
                  <p className="settings-desc" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                    输入 OpenAI 兼容格式的 API 地址，通常以 /v1 结尾。按硅基流动中文文档，推荐填写 https://api.siliconflow.cn/v1
                  </p>
                </div>
              </>
            )}
            <section className="settings-section" style={{ marginTop: 18 }}>
              <h3>3. 生图配置</h3>
              <p className="settings-desc">
                独立于聊天模型的生图 API 配置。留空「生图 API Key」时会复用聊天 Key（硅基流动选官方入口时 Key 在上方「API Key」里，与 DASHSCOPE 字段同源）。
                硅基流动请选「硅基流动」或选 OpenAI 兼容且 Base URL 填 <code>api.siliconflow.cn</code>。
              </p>

              <div className="settings-field">
                <label>生图服务商</label>
                <select
                  value={apiKeys.IMAGE_PROVIDER || 'minimax'}
                  onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_PROVIDER: e.target.value }))}
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
                    onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_API_KEY: e.target.value }))}
                    placeholder="留空则复用当前聊天服务商的 Key"
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
              </div>

              <div className="settings-field">
                <label>生图 Base URL</label>
                <input
                  type="text"
                  value={apiKeys.IMAGE_BASE_URL || ''}
                  onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_BASE_URL: e.target.value }))}
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
                  onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_MODEL: e.target.value }))}
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
            <details className="settings-details" style={{ marginTop: 8 }}>
              <summary>高级：Base URL</summary>
              <div className="settings-details-content" style={{ marginTop: 8 }}>
                {currentProviderId === 'custom' ? (
                  <p className="settings-desc" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
                      currentProviderId === 'custom' ? apiKeys.CUSTOM_BASE_URL :
                      apiKeys.DASHSCOPE_BASE_URL
                    }
                    onChange={(e) => {
                      let key: keyof SettingsApiKeysState;
                      if (currentProviderId === 'deepseek') key = 'DEEPSEEK_BASE_URL';
                      else if (currentProviderId === 'minimax') key = 'MINIMAX_BASE_URL';
                      else if (currentProviderId === 'custom') key = 'CUSTOM_BASE_URL';
                      else key = 'DASHSCOPE_BASE_URL';
                      setApiKeys((k) => ({ ...k, [key]: e.target.value }));
                    }}
                    placeholder={currentProviderId === 'custom' ? 'https://your-api.com/v1' : 'https://...'}
                    className="settings-input settings-input-focusable"
                    autoComplete="off"
                  />
                  {currentProviderId === 'custom' && (
                    <p className="settings-desc" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                      输入 OpenAI 兼容格式的 API 地址，通常以 /v1 结尾。按硅基流动中文文档，推荐填写 https://api.siliconflow.cn/v1
                    </p>
                  )}
                </div>
                )}
              </div>
            </details>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
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
                    const result = await api.testAIConnection({
                      OCT_PROVIDER: providerId,
                      OCT_MODEL: apiKeys.OCT_MODEL || p?.defaultModel || 'qwen3.5-plus',
                      DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY,
                      DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY,
                      MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY,
                      CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY,
                      DASHSCOPE_BASE_URL: providerId === 'deepseek' || providerId === 'minimax' || providerId === 'custom' ? '' : (apiKeys.DASHSCOPE_BASE_URL || p?.baseUrl || ''),
                      DEEPSEEK_BASE_URL: providerId === 'deepseek' ? (apiKeys.DEEPSEEK_BASE_URL || p?.baseUrl || '') : '',
                      MINIMAX_BASE_URL: providerId === 'minimax' ? (apiKeys.MINIMAX_BASE_URL || p?.baseUrl || '') : '',
                      CUSTOM_BASE_URL: providerId === 'custom' ? (apiKeys.CUSTOM_BASE_URL || p?.baseUrl || '') : '',
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
                <span style={{ fontSize: 12, color: 'var(--status-error)' }}>{testConnectionError}</span>
              )}
            </div>

            <VisionApiSection apiKeys={apiKeys} setApiKeys={setApiKeys} showApiKey={showApiKey} setShowApiKey={setShowApiKey} />
          </>
        )}
      </section>

      <section className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>3. 搜索引擎 API</h3>
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
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              💡 <strong>DuckDuckGo</strong> 无需 API Key，作为免费降级方案自动启用
            </div>
          </>
        )}
      </section>
    </div>
  );
}
