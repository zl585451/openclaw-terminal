import { useState, type Dispatch, type SetStateAction } from 'react';
import { useSettings } from '../../../contexts/SettingsContext';

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
              const api = (window as any).electronAPI;
              if (!api?.saveAiLibraryPlugin) return;
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
                const api = (window as any).electronAPI;
                if (!api) return;
                if (nocturneDashboardStatus?.backendRunning) {
                  await api.stopNocturneDashboard();
                  setNocturneDashboardStatus({ backendRunning: false, frontendRunning: false });
                  setNocturneDetail((d) => d ? { ...d, backendAlive: false, frontendAlive: false } : null);
                } else {
                  setNocturneStarting(true);
                  const r = await api.startNocturneDashboard();
                  setNocturneStarting(false);
                  if (r.success) {
                    setNocturneDashboardStatus({ backendRunning: true, frontendRunning: true });
                    api.getNocturneStatus().then((r2: any) => setNocturneDetail(r2)).catch((err: unknown) => {
                      const msg = err instanceof Error ? err.message : String(err);
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
                const api = (window as any).electronAPI;
                if (!api?.restartNocturneBackend) return;
                setRestartingBackend(true);
                await api.restartNocturneBackend();
                await new Promise((r) => setTimeout(r, 2000));
                api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch((err: unknown) => {
                  const msg = err instanceof Error ? err.message : String(err);
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
              onClick={() => (window as any).electronAPI?.openNocturneManagement?.()}
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
                (window as any).electronAPI?.setupNocturneMemory?.().then((r: { success: boolean; error?: string }) => {
                  if (r.success) setNocturneSetupStatus('success');
                  else { setNocturneSetupStatus('error'); setNocturneSetupError(r.error || '未知错误'); }
                }).catch((err: Error) => { setNocturneSetupStatus('error'); setNocturneSetupError(err.message); });
              }}
              disabled={nocturneSetupStatus === 'loading'}
            >
              {nocturneSetupStatus === 'loading' ? '安装中...' : nocturneSetupStatus === 'success' ? '依赖已安装 ✓' : '安装 Python 依赖'}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                (window as any).electronAPI?.seedNocturneMemories?.().then((r: { success: boolean; error?: string; output?: string }) => {
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
                const api = (window as any).electronAPI;
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
                    api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch((err: unknown) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      console.warn('[MemoryTabView] 写入工作模式记忆后状态刷新失败', msg);
                      setRefreshWarning(`写入工作模式记忆后状态刷新失败：${msg}`);
                    });
                  } else {
                    alert('写入失败：' + (r1?.error || r2?.error || '未知错误'));
                  }
                } catch (e: any) {
                  alert('写入失败：' + (e?.message || String(e)));
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
                        const api = (window as any).electronAPI;
                        if (!api?.nocturneRead) return;
                        setMemoryReadLoading(true);
                        setMemoryReadContent(null);
                        try {
                          const r = await api.nocturneRead(uri);
                          if (r?.ok && r?.data) {
                            const node = (r.data as any)?.node || r.data;
                            const content = node?.content ?? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
                            setMemoryReadContent(`[${uri}]\n\n${content || '（空）'}`);
                          } else {
                            setMemoryReadContent('读取失败：' + (r?.error || '未知错误'));
                          }
                        } catch (e: any) {
                          setMemoryReadContent('错误：' + (e?.message || String(e)));
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
                    const api = (window as any).electronAPI;
                    if (!api?.nocturneRead) return;
                    setMemoryReadLoading(true);
                    setMemoryReadContent(null);
                    try {
                      const r = await api.nocturneRead('system://boot');
                      if (r?.ok && Array.isArray(r?.data)) {
                        const parts = (r.data as any[]).map((item: any) => {
                          const u = item?.uri || '';
                          const c = item?.node?.content ?? item?.content ?? '';
                          return `[${u}]\n${c}`;
                        });
                        setMemoryReadContent(parts.join('\n\n---\n\n') || '（无内容）');
                      } else {
                        setMemoryReadContent(r?.ok ? JSON.stringify(r.data) : '失败：' + (r?.error || ''));
                      }
                    } catch (e: any) {
                      setMemoryReadContent('错误：' + (e?.message || String(e)));
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
