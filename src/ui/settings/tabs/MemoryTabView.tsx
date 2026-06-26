import { useEffect, useState } from 'react';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type VectorProvider = 'bailian' | 'volcengine' | 'custom';

const VECTOR_PROVIDER_PRESETS: Record<VectorProvider, {
  label: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}> = {
  bailian: {
    label: '百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'text-embedding-v4',
    dimensions: 1024,
  },
  volcengine: {
    label: '火山',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    dimensions: 1024,
  },
  custom: {
    label: '自定义',
    baseUrl: '',
    model: '',
    dimensions: 1024,
  },
};

export function MemoryTabView() {
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [summarizerEnabled, setSummarizerEnabled] = useState(true);
  const [summarizerBaseUrl, setSummarizerBaseUrl] = useState('');
  const [summarizerApiKey, setSummarizerApiKey] = useState('');
  const [summarizerModel, setSummarizerModel] = useState('');
  const [summarizerSaving, setSummarizerSaving] = useState(false);
  const [summarizerStatus, setSummarizerStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [summarizerError, setSummarizerError] = useState('');
  const [vectorEnabled, setVectorEnabled] = useState(false);
  const [vectorProvider, setVectorProvider] = useState<VectorProvider>('bailian');
  const [vectorBaseUrl, setVectorBaseUrl] = useState(VECTOR_PROVIDER_PRESETS.bailian.baseUrl);
  const [vectorApiKey, setVectorApiKey] = useState('');
  const [vectorModel, setVectorModel] = useState(VECTOR_PROVIDER_PRESETS.bailian.model);
  const [vectorDimensions, setVectorDimensions] = useState(1024);
  const [vectorSaving, setVectorSaving] = useState(false);
  const [vectorStatus, setVectorStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [vectorError, setVectorError] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getMemorySummarizerConfig) return;
    api.getMemorySummarizerConfig()
      .then((r) => {
        if (!r?.success || !r.data) return;
        setSummarizerEnabled(r.data.enabled !== false);
        setSummarizerBaseUrl(String(r.data.baseUrl || ''));
        setSummarizerApiKey(String(r.data.apiKey || ''));
        setSummarizerModel(String(r.data.model || ''));
      })
      .catch((err: unknown) => {
        const msg = getErrorMessage(err);
        console.warn('[MemoryTabView] 摘要模型配置读取失败', msg);
        setRefreshWarning(`摘要模型配置读取失败：${msg}`);
      });
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getMemoryVectorRecallConfig) return;
    api.getMemoryVectorRecallConfig()
      .then((r) => {
        if (!r?.success || !r.data) return;
        const provider = (['bailian', 'volcengine', 'custom'].includes(r.data.provider)
          ? r.data.provider
          : 'bailian') as VectorProvider;
        setVectorEnabled(r.data.enabled === true);
        setVectorProvider(provider);
        setVectorBaseUrl(String(r.data.baseUrl || VECTOR_PROVIDER_PRESETS[provider].baseUrl));
        setVectorApiKey(String(r.data.apiKey || ''));
        setVectorModel(String(r.data.model || VECTOR_PROVIDER_PRESETS[provider].model));
        setVectorDimensions(Number(r.data.dimensions || VECTOR_PROVIDER_PRESETS[provider].dimensions));
      })
      .catch((err: unknown) => {
        const msg = getErrorMessage(err);
        console.warn('[MemoryTabView] 向量召回配置读取失败', msg);
        setRefreshWarning(`向量召回配置读取失败：${msg}`);
      });
  }, []);

  const applyVectorProvider = (provider: VectorProvider) => {
    const preset = VECTOR_PROVIDER_PRESETS[provider];
    setVectorProvider(provider);
    if (provider !== 'custom') {
      setVectorBaseUrl(preset.baseUrl);
      setVectorModel(preset.model);
      setVectorDimensions(preset.dimensions);
    }
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-guide-card settings-guide-card-spaced">
        <h4>Memory v2 使用说明</h4>
        <div className="settings-description-flow">
          <p className="settings-guide-copy"><strong>现在的默认记忆链路：</strong></p>
          <p className="settings-guide-copy-lg">
            OCT 默认使用本地文件后端。原始对话写入 <code>~/.openclaw/memory/turns</code>，
            显式记忆写入 <code>notes</code>，三级摘要写入 <code>summaries</code>。
          </p>

          <p className="settings-guide-copy"><strong>体感上的变化：</strong></p>
          <ol className="settings-guide-list">
            <li>启动时不再依赖外部 Python / Dashboard 服务</li>
            <li>对话原文会直接落本地，离线也更稳</li>
            <li>向量召回默认更克制，只索引更值得长期记住的内容</li>
          </ol>

          <p className="settings-guide-copy"><strong>说明：</strong></p>
          <p className="settings-guide-indent">
            这一页保留的是 Memory v2 的有效配置。
          </p>
        </div>
      </div>

      <section className="settings-section">
        <h3>Memory v2 本地存储</h3>
        <p className="settings-desc">
          当前默认使用 Memory v2 文件后端，不再需要单独的记忆服务或管理面板。
        </p>
      </section>

      <section className="settings-section settings-section-spaced">
        <h3>摘要模型配置</h3>
        <p className="settings-description-code">
          用于 L2/L1/L0 三级摘要的独立模型，兼容 OpenAI Chat Completions 协议；不影响主对话模型。
        </p>
        <div className="settings-row">
          <label>启用摘要系统</label>
          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={summarizerEnabled}
              onChange={(e) => setSummarizerEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-field">
          <label>Base URL</label>
          <input
            type="text"
            className="settings-input settings-input-focusable"
            placeholder="https://openrouter.ai/api/v1"
            value={summarizerBaseUrl}
            onChange={(e) => setSummarizerBaseUrl(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>API Key</label>
          <input
            type="password"
            className="settings-input settings-input-focusable"
            placeholder="sk-..."
            value={summarizerApiKey}
            onChange={(e) => setSummarizerApiKey(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>模型</label>
          <input
            type="text"
            className="settings-input settings-input-focusable"
            placeholder="anthropic/claude-3.5-sonnet"
            value={summarizerModel}
            onChange={(e) => setSummarizerModel(e.target.value)}
          />
        </div>
        <div className="settings-btn-row">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            disabled={summarizerSaving}
            onClick={async () => {
              const api = window.electronAPI;
              if (!api?.saveMemorySummarizerConfig) return;
              setSummarizerSaving(true);
              setSummarizerStatus('idle');
              setSummarizerError('');
              try {
                const r = await api.saveMemorySummarizerConfig({
                  enabled: summarizerEnabled,
                  baseUrl: summarizerBaseUrl,
                  apiKey: summarizerApiKey,
                  model: summarizerModel,
                });
                if (!r?.success) {
                  setSummarizerStatus('error');
                  setSummarizerError(r?.error || '未知错误');
                } else {
                  setSummarizerStatus('success');
                }
              } catch (err: unknown) {
                setSummarizerStatus('error');
                setSummarizerError(getErrorMessage(err));
              } finally {
                setSummarizerSaving(false);
              }
            }}
          >
            {summarizerSaving ? '保存中...' : '保存并重启 Gateway'}
          </button>
          {summarizerStatus === 'success' && (
            <span className="settings-status-success settings-inline-row">已保存</span>
          )}
          {summarizerStatus === 'error' && (
            <span className="settings-error-inline">保存失败：{summarizerError}</span>
          )}
        </div>
      </section>

      <section className="settings-section settings-section-spaced">
        <h3>向量召回配置</h3>
        <p className="settings-description-code">
          用于“主动想起以前聊过的事”。推荐百炼，填 Key 后保存，再用 <code>/recall test 记忆系统</code> 测试。
        </p>
        <div className="settings-row">
          <label>启用向量召回</label>
          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={vectorEnabled}
              onChange={(e) => setVectorEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-field">
          <label>供应商</label>
          <select
            className="settings-input settings-input-focusable"
            value={vectorProvider}
            onChange={(e) => applyVectorProvider(e.target.value as VectorProvider)}
          >
            <option value="bailian">百炼 text-embedding-v4</option>
            <option value="volcengine">火山 Ark Embedding</option>
            <option value="custom">自定义 OpenAI 兼容</option>
          </select>
        </div>
        <div className="settings-field">
          <label>API Key</label>
          <input
            type="password"
            className="settings-input settings-input-focusable"
            placeholder={vectorProvider === 'bailian' ? 'sk-...' : '填入供应商 API Key'}
            value={vectorApiKey}
            onChange={(e) => setVectorApiKey(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>Base URL</label>
          <input
            type="text"
            className="settings-input settings-input-focusable"
            value={vectorBaseUrl}
            onChange={(e) => setVectorBaseUrl(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>模型</label>
          <input
            type="text"
            className="settings-input settings-input-focusable"
            placeholder={vectorProvider === 'volcengine' ? '例如 doubao-embedding-text-240715' : 'text-embedding-v4'}
            value={vectorModel}
            onChange={(e) => setVectorModel(e.target.value)}
          />
        </div>
        <div className="settings-row">
          <label>向量维度</label>
          <input
            type="number"
            className="settings-input settings-input-port"
            min={1}
            max={4096}
            value={vectorDimensions}
            onChange={(e) => setVectorDimensions(Number(e.target.value) || 1024)}
          />
        </div>
        <div className="settings-btn-row">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            disabled={vectorSaving}
            onClick={async () => {
              const api = window.electronAPI;
              if (!api?.saveMemoryVectorRecallConfig) return;
              setVectorSaving(true);
              setVectorStatus('idle');
              setVectorError('');
              try {
                const r = await api.saveMemoryVectorRecallConfig({
                  enabled: vectorEnabled,
                  provider: vectorProvider,
                  baseUrl: vectorBaseUrl,
                  apiKey: vectorApiKey,
                  model: vectorModel,
                  dimensions: vectorDimensions,
                  threshold: 0.75,
                  topK: 3,
                });
                if (!r?.success) {
                  setVectorStatus('error');
                  setVectorError(r?.error || '未知错误');
                } else {
                  setVectorStatus('success');
                }
              } catch (err: unknown) {
                setVectorStatus('error');
                setVectorError(getErrorMessage(err));
              } finally {
                setVectorSaving(false);
              }
            }}
          >
            {vectorSaving ? '保存中...' : '保存并重启 Gateway'}
          </button>
          {vectorStatus === 'success' && (
            <span className="settings-status-success settings-inline-row">已保存</span>
          )}
          {vectorStatus === 'error' && (
            <span className="settings-error-inline">保存失败：{vectorError}</span>
          )}
        </div>
      </section>

      {refreshWarning && (
        <div className="settings-banner-warning" role="alert">
          <span>{refreshWarning}</span>
          <button
            type="button"
            className="settings-banner-close"
            onClick={() => setRefreshWarning(null)}
            aria-label="关闭警告"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
