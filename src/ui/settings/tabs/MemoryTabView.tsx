import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import type { NocturneMemoryItem, NocturneReadResult } from '../../../types/electronAPI';

export type NocturneStatusBrief = { available: boolean; path: string } | null;

export type NocturneDetailState = {
  available: boolean;
  path: string;
  backendAlive?: boolean;
  frontendAlive?: boolean;
  domains?: Array<{ domain: string }>;
  coreMemoryUris?: string[];
} | null;

export type AiLibStatusState = {
  healthy: boolean;
  managed: boolean;
  portInUse: boolean;
  resolvedGatewayUrl: string;
} | null;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMemoryItem(value: unknown): value is NocturneMemoryItem {
  return !!value && typeof value === 'object';
}

function getMemoryItemContent(item: NocturneMemoryItem): string {
  return item.node?.content ?? item.content ?? '';
}

function formatSingleMemoryContent(uri: string, result: NocturneReadResult): string {
  const data = result.data;
  if (typeof data === 'string') return `[${uri}]\n\n${data || '（空）'}`;
  if (isMemoryItem(data)) {
    const node = data.node || data;
    const content = node.content ?? JSON.stringify(data);
    return `[${uri}]\n\n${content || '（空）'}`;
  }
  return `[${uri}]\n\n${data ? JSON.stringify(data) : '（空）'}`;
}

function formatBootMemoryContent(data: NocturneReadResult['data']): string {
  if (!Array.isArray(data)) return JSON.stringify(data);
  const parts = data.map((item) => {
    const u = item.uri || '';
    const c = getMemoryItemContent(item);
    return `[${u}]\n${c}`;
  });
  return parts.join('\n\n---\n\n') || '（无内容）';
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

export interface MemoryTabViewProps {
  nocturneStatus: NocturneStatusBrief;
  nocturneDetail: NocturneDetailState;
  setNocturneDetail: Dispatch<SetStateAction<NocturneDetailState>>;
  nocturneDashboardStatus: { backendRunning: boolean; frontendRunning: boolean } | null;
  setNocturneDashboardStatus: Dispatch<SetStateAction<{ backendRunning: boolean; frontendRunning: boolean } | null>>;
  nocturneStarting: boolean;
  setNocturneStarting: (v: boolean) => void;
  nocturneSetupStatus: 'idle' | 'loading' | 'success' | 'error';
  setNocturneSetupStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'success' | 'error'>>;
  nocturneSetupError: string;
  setNocturneSetupError: (v: string) => void;
  restartingBackend: boolean;
  setRestartingBackend: (v: boolean) => void;
  memoryReadContent: string | null;
  setMemoryReadContent: Dispatch<SetStateAction<string | null>>;
  memoryReadLoading: boolean;
  setMemoryReadLoading: (v: boolean) => void;
  amyWorkModeWriting: boolean;
  setAmyWorkModeWriting: (v: boolean) => void;
  aiLibAutoStart: boolean;
  setAiLibAutoStart: (v: boolean) => void;
  aiLibPath: string;
  setAiLibPath: (v: string) => void;
  aiLibPort: number;
  setAiLibPort: (v: number) => void;
  aiLibStatus: AiLibStatusState;
  setAiLibStatus: Dispatch<SetStateAction<AiLibStatusState>>;
  aiLibSaving: boolean;
  setAiLibSaving: (v: boolean) => void;
}

export function MemoryTabView({
  nocturneStatus,
  nocturneDetail,
  setNocturneDetail,
  nocturneDashboardStatus,
  setNocturneDashboardStatus,
  nocturneStarting,
  setNocturneStarting,
  nocturneSetupStatus,
  setNocturneSetupStatus,
  nocturneSetupError,
  setNocturneSetupError,
  restartingBackend,
  setRestartingBackend,
  memoryReadContent,
  setMemoryReadContent,
  memoryReadLoading,
  setMemoryReadLoading,
  amyWorkModeWriting,
  setAmyWorkModeWriting,
  aiLibAutoStart,
  setAiLibAutoStart,
  aiLibPath,
  setAiLibPath,
  aiLibPort,
  setAiLibPort,
  aiLibStatus,
  setAiLibStatus,
  aiLibSaving,
  setAiLibSaving,
}: MemoryTabViewProps) {
  const { settings } = useSettings();
  const assistantName = settings.aiName || 'OpenClaw';
  const userName = settings.userName || '用户';
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
        <h4>Nocturne 记忆系统 使用说明</h4>
        <div className="settings-description-flow">
          <p className="settings-guide-copy"><strong>什么是记忆系统？</strong></p>
          <p className="settings-guide-copy-lg">记忆系统可以让 AI 「记住」你的个人信息、偏好、习惯等，让对话更加个性化和智能。例如：你的名字、职业、常用工具等。</p>

          <p className="settings-guide-copy"><strong>快速开始（3 步）：</strong></p>
          <ol className="settings-guide-list">
            <li>点击下方「安装 Python 依赖」（首次使用需要）</li>
            <li>点击「▶ 启动 Dashboard」启动记忆管理界面</li>
            <li>在打开的网页中添加你的个人记忆</li>
          </ol>

          <p className="settings-guide-copy"><strong>系统要求：</strong></p>
          <p className="settings-guide-indent">Python 3.10 或更高版本</p>
        </div>
      </div>

      <section className="settings-section settings-section-spaced">
        <h3>AI.library 知识库（插件）</h3>
        <p className="settings-description-code">
          与 Nocturne（端口 <strong>8000</strong>）并行；知识库服务默认 <strong>8001</strong>。开启「随 OCT 启动」后，打开应用会自动拉起 <code>api_server.py</code>，Gateway 会收到检索结果。
        </p>
        {aiLibStatus && (
          <div className="settings-status-card settings-status-card-tight">
            <p className="settings-status-line">
              服务：<span className={aiLibStatus.healthy ? 'settings-status-success' : 'settings-status-muted'}>
                {aiLibStatus.healthy ? '✅ /health 正常' : '— 未就绪'}
              </span>
              {' · '}
              端口占用：{aiLibStatus.portInUse ? '是' : '否'}
              {' · '}
              OCT 托管进程：{aiLibStatus.managed ? '是' : '否'}
            </p>
            {aiLibStatus.resolvedGatewayUrl ? (
              <p className="settings-status-line-muted">Gateway 使用：{aiLibStatus.resolvedGatewayUrl}</p>
            ) : null}
          </div>
        )}
        <div className="settings-row">
          <label>随 OCT 自动启动</label>
          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={aiLibAutoStart}
              onChange={(e) => setAiLibAutoStart(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-row">
          <label>项目根目录</label>
          <input
            type="text"
            className="settings-input settings-input-grow"
            placeholder="例如 E:\AI.library（需含 api_server.py）"
            value={aiLibPath}
            onChange={(e) => setAiLibPath(e.target.value)}
          />
        </div>
        <div className="settings-row">
          <label>端口</label>
          <input
            type="number"
            className="settings-input settings-input-port"
            min={1024}
            max={65535}
            value={aiLibPort}
            onChange={(e) => setAiLibPort(Number(e.target.value) || 8001)}
          />
        </div>
        <div className="settings-btn-row">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            disabled={aiLibSaving}
            onClick={async () => {
              const api = window.electronAPI;
              if (!api?.saveAiLibraryPlugin || !api.getAiLibraryPlugin) return;
              setAiLibSaving(true);
              try {
                const r = await api.saveAiLibraryPlugin({
                  OCT_AI_LIBRARY_AUTO_START: aiLibAutoStart,
                  OCT_AI_LIBRARY_PATH: aiLibPath.trim(),
                  OCT_AI_LIBRARY_PORT: aiLibPort,
                });
                if (!r?.success) {
                  alert('保存失败：' + (r?.error || '未知错误'));
                } else {
                  const r2 = await api.getAiLibraryPlugin();
                  if (r2?.success && r2.data) {
                    setAiLibStatus({
                      healthy: !!r2.data.healthy,
                      managed: !!r2.data.managed,
                      portInUse: !!r2.data.portInUse,
                      resolvedGatewayUrl: String(r2.data.resolvedGatewayUrl || ''),
                    });
                  }
                }
              } finally {
                setAiLibSaving(false);
              }
            }}
          >
            {aiLibSaving ? '保存中…' : '保存并应用'}
          </button>
        </div>
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
                const preset = VECTOR_PROVIDER_PRESETS[vectorProvider];
                const nextBaseUrl = vectorProvider === 'custom' ? vectorBaseUrl : preset.baseUrl;
                const nextModel = vectorProvider === 'bailian' ? preset.model : vectorModel;
                const nextDimensions = vectorProvider === 'custom' ? vectorDimensions : preset.dimensions;
                const r = await api.saveMemoryVectorRecallConfig({
                  enabled: vectorEnabled,
                  provider: vectorProvider,
                  baseUrl: nextBaseUrl,
                  apiKey: vectorApiKey,
                  model: nextModel,
                  dimensions: nextDimensions,
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

      {nocturneStatus?.available ? (
        <section className="settings-section">
          <h3>记忆系统控制台</h3>
          <div className="settings-status-card settings-status-card-spaced">
            <p className="settings-status-line-primary">
              后端状态：{nocturneDetail?.backendAlive ? '✅ http://localhost:8000 可访问' : '❌ 不可用'}
            </p>
            <p className="settings-status-line-primary">
              前端状态：{nocturneDetail?.frontendAlive ? '✅ http://localhost:3000 可访问' : '❌ 不可用'}
            </p>
            <p className="settings-status-line-muted">
              已加载记忆：{nocturneDetail?.domains?.length ?? 0} 个 domain
            </p>
          </div>

          <div className="settings-btn-row">
            <button
              type="button"
              className={`settings-btn ${nocturneDashboardStatus?.backendRunning ? 'settings-btn-danger' : 'settings-btn-primary'}`}
              onClick={async () => {
                const api = window.electronAPI;
                if (!api) return;
                if (nocturneDashboardStatus?.backendRunning) {
                  if (!api.stopNocturneDashboard) return;
                  await api.stopNocturneDashboard();
                  setNocturneDashboardStatus({ backendRunning: false, frontendRunning: false });
                  setNocturneDetail((d) => d ? { ...d, backendAlive: false, frontendAlive: false } : null);
                } else {
                  if (!api.startNocturneDashboard) return;
                  setNocturneStarting(true);
                  const r = await api.startNocturneDashboard();
                  setNocturneStarting(false);
                  if (r.success) {
                    setNocturneDashboardStatus({ backendRunning: true, frontendRunning: true });
                    api.getNocturneStatus?.().then((r2) => setNocturneDetail(r2)).catch((err: unknown) => {
                      const msg = getErrorMessage(err);
                      console.warn('[MemoryTabView] Dashboard 启动后状态刷新失败', msg);
                      setRefreshWarning(`Dashboard 启动后状态刷新失败：${msg}`);
                    });
                  } else {
                    alert('启动失败：' + (r.error || '未知错误'));
                  }
                }
              }}
              disabled={nocturneStarting}
            >
              {nocturneStarting ? '启动中...' : nocturneDashboardStatus?.backendRunning ? '■ 停止 Dashboard' : '▶ 启动 Dashboard'}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={async () => {
                const api = window.electronAPI;
                if (!api?.restartNocturneBackend) return;
                setRestartingBackend(true);
                await api.restartNocturneBackend();
                await new Promise((r) => setTimeout(r, 2000));
                api.getNocturneStatus?.().then((r) => setNocturneDetail(r)).catch((err: unknown) => {
                  const msg = getErrorMessage(err);
                  console.warn('[MemoryTabView] 重启后端后状态刷新失败', msg);
                  setRefreshWarning(`重启后端后状态刷新失败：${msg}`);
                });
                setRestartingBackend(false);
              }}
              disabled={restartingBackend}
            >
              {restartingBackend ? '重启中...' : '仅重启后端'}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={() => window.electronAPI?.openNocturneManagement?.()}
            >
              打开管理界面
            </button>
          </div>

          <div className="settings-btn-row settings-btn-row-spaced">
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                setNocturneSetupStatus('loading');
                setNocturneSetupError('');
                window.electronAPI?.setupNocturneMemory?.().then((r) => {
                  if (r.success) setNocturneSetupStatus('success');
                  else { setNocturneSetupStatus('error'); setNocturneSetupError(r.error || '未知错误'); }
                }).catch((err: unknown) => { setNocturneSetupStatus('error'); setNocturneSetupError(getErrorMessage(err)); });
              }}
              disabled={nocturneSetupStatus === 'loading'}
            >
              {nocturneSetupStatus === 'loading' ? '安装中...' : nocturneSetupStatus === 'success' ? '依赖已安装 ✓' : '安装 Python 依赖'}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                window.electronAPI?.seedNocturneMemories?.().then((r) => {
                  alert(r.success ? '初始化成功！' + (r.output || '') : '初始化失败：' + (r.error || ''));
                });
              }}
            >
              初始化预设记忆
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={amyWorkModeWriting}
              onClick={async () => {
                const api = window.electronAPI;
                if (!api?.nocturneCreate) return;
                setAmyWorkModeWriting(true);
                const workModeContent = `${userName} 的工作团队分工：
${assistantName}（行政助理）：日常对话、信息整理、记忆管理、任务分发、提示词优化。处理80%的日常问题。
Cursor（执行总监）：所有代码编写、文件修改、项目实现。${assistantName} 生成提示词，${userName} 交给 Cursor 执行。
Claude（技术顾问/总策划）：复杂架构决策、技术路线规划、高级问题咨询。费用较高，只在必要时使用。

判断标准：
- 日常问题、信息查询、文档整理 → ${assistantName} 直接解决
- 代码编写、文件修改 → ${assistantName} 生成 Cursor 提示词
- 架构设计、技术选型、复杂 bug → 提醒 ${userName} 咨询 Claude
- 需要咨询 Claude 时，${assistantName} 先帮 ${userName} 整理问题、优化提示词、提炼关键信息，减少 token 消耗`;
                const claudeRoutingContent = `当 ${userName} 需要咨询 Claude 时，${assistantName} 的工作流程：
1. 先理解 ${userName} 的问题
2. 整理成结构化的提示词（背景+问题+已尝试的方案+期望结果）
3. 精简掉不必要的细节，控制在500字以内
4. 告知 ${userName}：是否需要附图、哪些截图最关键
5. 输出一段可以直接复制给 Claude 的提示词

格式模板：
【背景】OCT项目，[简短背景]
【问题】[核心问题一句话]
【已知】[已尝试的方案]
【期望】[想要的结果]
【文件】[如需附上的关键代码片段]`;
                try {
                  const r1 = await api.nocturneCreate('core://agent/work_mode', workModeContent, 0, '工作模式、分工、角色、顾问、Claude、Cursor');
                  const r2 = await api.nocturneCreate('core://agent/claude_routing', claudeRoutingContent, 1, '咨询Claude、问题整理、提示词优化、token节省');
                  if (r1?.ok && r2?.ok) {
                    alert(`已写入 ${assistantName} 工作模式记忆：core://agent/work_mode、core://agent/claude_routing`);
                    api.getNocturneStatus?.().then((r) => setNocturneDetail(r)).catch((err: unknown) => {
                      const msg = getErrorMessage(err);
                      console.warn('[MemoryTabView] 写入工作模式记忆后状态刷新失败', msg);
                      setRefreshWarning(`写入工作模式记忆后状态刷新失败：${msg}`);
                    });
                  } else {
                    alert('写入失败：' + (r1?.error || r2?.error || '未知错误'));
                  }
                } catch (e: unknown) {
                  alert('写入失败：' + getErrorMessage(e));
                }
                setAmyWorkModeWriting(false);
              }}
            >
              {amyWorkModeWriting ? '写入中...' : `写入 ${assistantName} 工作模式记忆`}
            </button>
          </div>
          {nocturneSetupError && <p className="settings-error">{nocturneSetupError}</p>}

          {(nocturneDetail?.coreMemoryUris?.length ?? 0) > 0 && (
            <div className="settings-uri-section">
              <h4 className="settings-uri-title">核心记忆 URI</h4>
              <ul className="settings-uri-list">
                {nocturneDetail?.coreMemoryUris?.map((uri) => (
                  <li key={uri} className="settings-uri-item">
                    <code className="settings-uri-code">{uri}</code>
                    <button
                      type="button"
                      className="settings-btn settings-small-btn"
                      onClick={async () => {
                        const api = window.electronAPI;
                        if (!api?.nocturneRead) return;
                        setMemoryReadLoading(true);
                        setMemoryReadContent(null);
                        try {
                          const r = await api.nocturneRead(uri);
                          if (r?.ok && r?.data) {
                            setMemoryReadContent(formatSingleMemoryContent(uri, r));
                          } else {
                            setMemoryReadContent('读取失败：' + (r?.error || '未知错误'));
                          }
                        } catch (e: unknown) {
                          setMemoryReadContent('错误：' + getErrorMessage(e));
                        }
                        setMemoryReadLoading(false);
                      }}
                      disabled={memoryReadLoading}
                    >
                      查看
                    </button>
                  </li>
                ))}
              </ul>
              <div className="settings-btn-row settings-btn-row-tight">
                <button
                  type="button"
                  className="settings-btn"
                  onClick={async () => {
                    const api = window.electronAPI;
                    if (!api?.nocturneRead) return;
                    setMemoryReadLoading(true);
                    setMemoryReadContent(null);
                    try {
                      const r = await api.nocturneRead('system://boot');
                      if (r?.ok && Array.isArray(r?.data)) {
                        setMemoryReadContent(formatBootMemoryContent(r.data));
                      } else {
                        setMemoryReadContent(r?.ok ? JSON.stringify(r.data) : '失败：' + (r?.error || ''));
                      }
                    } catch (e: unknown) {
                      setMemoryReadContent('错误：' + getErrorMessage(e));
                    }
                    setMemoryReadLoading(false);
                  }}
                  disabled={memoryReadLoading}
                >
                  刷新核心记忆
                </button>
              </div>
            </div>
          )}
          {memoryReadContent !== null && (
            <div className="settings-status-card settings-preview-panel">
              <button type="button" className="settings-btn settings-preview-close" onClick={() => setMemoryReadContent(null)}>关闭</button>
              <pre className="settings-preview-pre">{memoryReadContent}</pre>
            </div>
          )}
        </section>
      ) : (
        <section className="settings-section">
          <h3>记忆系统不可用</h3>
          <p className="settings-desc">
            未检测到 Nocturne 记忆模块。请确保项目 resources/nocturne_memory 目录存在。
          </p>
        </section>
      )}
    </div>
  );
}
