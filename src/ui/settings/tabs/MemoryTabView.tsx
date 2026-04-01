import type { Dispatch, SetStateAction } from 'react';

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
  return (
    <div className="settings-tab-content">
      <div className="settings-guide-card" style={{ marginBottom: 20 }}>
        <h4>Nocturne 记忆系统 使用说明</h4>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-code)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 12 }}><strong>什么是记忆系统？</strong></p>
          <p style={{ marginBottom: 16, paddingLeft: 12 }}>记忆系统可以让 AI 「记住」你的个人信息、偏好、习惯等，让对话更加个性化和智能。例如：你的名字、职业、常用工具等。</p>

          <p style={{ marginBottom: 12 }}><strong>快速开始（3 步）：</strong></p>
          <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li>点击下方「安装 Python 依赖」（首次使用需要）</li>
            <li>点击「▶ 启动 Dashboard」启动记忆管理界面</li>
            <li>在打开的网页中添加你的个人记忆</li>
          </ol>

          <p style={{ marginBottom: 12 }}><strong>系统要求：</strong></p>
          <p style={{ paddingLeft: 12 }}>Python 3.10 或更高版本</p>
        </div>
      </div>

      <section className="settings-section" style={{ marginBottom: 24 }}>
        <h3>AI.library 知识库（插件）</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-code)', marginBottom: 12, lineHeight: 1.6 }}>
          与 Nocturne（端口 <strong>8000</strong>）并行；知识库服务默认 <strong>8001</strong>。开启「随 OCT 启动」后，打开应用会自动拉起 <code>api_server.py</code>，Gateway 会收到检索结果。
        </p>
        {aiLibStatus && (
          <div style={{ marginBottom: 12, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-code)' }}>
            <p style={{ margin: '0 0 6px' }}>
              服务：<span style={{ color: aiLibStatus.healthy ? 'var(--status-success)' : 'var(--text-tertiary)' }}>
                {aiLibStatus.healthy ? '✅ /health 正常' : '— 未就绪'}
              </span>
              {' · '}
              端口占用：{aiLibStatus.portInUse ? '是' : '否'}
              {' · '}
              OCT 托管进程：{aiLibStatus.managed ? '是' : '否'}
            </p>
            {aiLibStatus.resolvedGatewayUrl ? (
              <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>Gateway 使用：{aiLibStatus.resolvedGatewayUrl}</p>
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
            className="settings-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="例如 E:\AI.library（需含 api_server.py）"
            value={aiLibPath}
            onChange={(e) => setAiLibPath(e.target.value)}
          />
        </div>
        <div className="settings-row">
          <label>端口</label>
          <input
            type="number"
            className="settings-input"
            style={{ width: 100 }}
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

      {nocturneStatus?.available ? (
        <section className="settings-section">
          <h3>记忆系统控制台</h3>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-code)' }}>
            <p style={{ margin: '0 0 6px', color: 'var(--accent-primary)' }}>
              后端状态：{nocturneDetail?.backendAlive ? '✅ http://localhost:8000 可访问' : '❌ 不可用'}
            </p>
            <p style={{ margin: '0 0 6px', color: 'var(--accent-primary)' }}>
              前端状态：{nocturneDetail?.frontendAlive ? '✅ http://localhost:3000 可访问' : '❌ 不可用'}
            </p>
            <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>
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
                    api.getNocturneStatus().then((r2: any) => setNocturneDetail(r2)).catch(() => {});
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
                api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch(() => {});
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

          <div className="settings-btn-row" style={{ marginTop: 12 }}>
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
                const workModeContent = `少爷的工作团队分工：
AMY（行政助理）：日常对话、信息整理、记忆管理、任务分发、提示词优化。处理80%的日常问题。
Cursor（执行总监）：所有代码编写、文件修改、项目实现。AMY生成提示词，少爷交给Cursor执行。
Claude（技术顾问/总策划）：复杂架构决策、技术路线规划、高级问题咨询。费用较高，只在必要时使用。

判断标准：
- 日常问题、信息查询、文档整理 → AMY直接解决
- 代码编写、文件修改 → AMY生成Cursor提示词
- 架构设计、技术选型、复杂bug → 提醒少爷咨询Claude
- 需要咨询Claude时，AMY先帮少爷整理问题、优化提示词、提炼关键信息，减少token消耗`;
                const claudeRoutingContent = `当少爷需要咨询Claude时，AMY的工作流程：
1. 先理解少爷的问题
2. 整理成结构化的提示词（背景+问题+已尝试的方案+期望结果）
3. 精简掉不必要的细节，控制在500字以内
4. 告知少爷：是否需要附图、哪些截图最关键
5. 输出一段可以直接复制给Claude的提示词

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
                    alert('已写入 AMY 工作模式记忆：core://agent/work_mode、core://agent/claude_routing');
                    api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch(() => {});
                  } else {
                    alert('写入失败：' + (r1?.error || r2?.error || '未知错误'));
                  }
                } catch (e: any) {
                  alert('写入失败：' + (e?.message || String(e)));
                }
                setAmyWorkModeWriting(false);
              }}
            >
              {amyWorkModeWriting ? '写入中...' : '写入 AMY 工作模式记忆'}
            </button>
          </div>
          {nocturneSetupError && <p className="settings-error">{nocturneSetupError}</p>}

          {(nocturneDetail?.coreMemoryUris?.length ?? 0) > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ marginBottom: 8, fontSize: 'var(--text-code)', color: 'var(--accent-primary)' }}>核心记忆 URI</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {nocturneDetail?.coreMemoryUris?.map((uri) => (
                  <li key={uri} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, wordBreak: 'break-all' }}>{uri}</code>
                    <button
                      type="button"
                      className="settings-btn"
                      style={{ padding: '4px 10px', fontSize: 'var(--text-sm)' }}
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
              <div className="settings-btn-row" style={{ marginTop: 8 }}>
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
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
              <button type="button" className="settings-btn" style={{ marginBottom: 8 }} onClick={() => setMemoryReadContent(null)}>关闭</button>
              <pre style={{ margin: 0 }}>{memoryReadContent}</pre>
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
