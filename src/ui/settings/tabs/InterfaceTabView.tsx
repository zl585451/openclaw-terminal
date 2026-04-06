import type { Dispatch, SetStateAction } from 'react';
import type { Settings, StreamSpeed, TtsProvider, TypingSoundMode } from '../../../contexts/SettingsContext';
import { allThemes, type ThemeId } from '../../../themes/themes';
import { FONT_SIZE_OPTIONS, MINIMAX_TTS_VOICE_OPTIONS } from '../constants';

export interface InterfaceTabViewProps {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  local: Settings;
  setLocal: Dispatch<SetStateAction<Settings>>;
  fontSize: string;
  setFontSize: (v: string) => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  maxHistory: number;
  setMaxHistory: (v: number) => void;
  aiName: string;
  setAiName: (v: string) => void;
  userName: string;
  setUserName: (v: string) => void;
  personaStyle: 'neutral' | 'warm' | 'companion';
  setPersonaStyle: (v: 'neutral' | 'warm' | 'companion') => void;
  ttsPreviewStatus: 'idle' | 'playing' | 'error' | 'success';
  ttsPreviewError: string;
  onPreviewTts: () => void;
  minimaxTtsAvailable: boolean;
  minimaxVoiceId: string;
  setMinimaxVoiceId: (v: string) => void;
}

export function InterfaceTabView({
  themeId,
  setTheme,
  local,
  setLocal,
  fontSize,
  setFontSize,
  autoScroll,
  setAutoScroll,
  maxHistory,
  setMaxHistory,
  aiName,
  setAiName,
  userName,
  setUserName,
  personaStyle,
  setPersonaStyle,
  ttsPreviewStatus,
  ttsPreviewError,
  onPreviewTts,
  minimaxTtsAvailable,
  minimaxVoiceId,
  setMinimaxVoiceId,
}: InterfaceTabViewProps) {
  return (
    <div className="settings-tab-content">
      <section className="settings-section">
        <h3>AI 人格</h3>
        <div className="settings-desc" style={{ marginBottom: 12 }}>
          发布版默认建议保持中性可配置。这里定义当前用户自己的 AI 名称、称呼和语气。
        </div>
        <div className="settings-row">
          <label>AI 名称</label>
          <input
            className="settings-input settings-input-focusable"
            value={aiName}
            maxLength={24}
            onChange={(e) => setAiName(e.target.value)}
            placeholder="例如 OpenClaw / AMY"
          />
        </div>
        <div className="settings-row">
          <label>用户称呼</label>
          <input
            className="settings-input settings-input-focusable"
            value={userName}
            maxLength={24}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="例如 用户 / 小王 / 少爷"
          />
        </div>
        <div className="settings-row">
          <label>风格预设</label>
          <select value={personaStyle} onChange={(e) => setPersonaStyle(e.target.value as 'neutral' | 'warm' | 'companion')}>
            <option value="neutral">克制专业</option>
            <option value="warm">温暖可靠（推荐）</option>
            <option value="companion">更有陪伴感</option>
          </select>
        </div>
      </section>
      <section className="settings-section">
        <h3>界面主题</h3>
        <div className="settings-desc" style={{ marginBottom: 12 }}>选择你喜欢的配色方案</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(allThemes) as ThemeId[]).map((key) => {
            const theme = allThemes[key];
            const active = themeId === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                aria-pressed={active}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  borderRadius: 9999,
                  border: active ? '1px solid var(--border-focus)' : '1px solid var(--border-light)',
                  background: active ? 'var(--accent-primary-muted)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: theme.preview.accent,
                    boxShadow: theme.isDark ? '0 0 10px var(--accent-primary-glow)' : 'none',
                  }}
                />
                <span style={{ opacity: active ? 1 : 0.9 }}>{theme.name}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="settings-section">
        <h3>基础设置</h3>
        <div className="settings-row">
          <label>流式速度</label>
          <select value={local.streamSpeed} onChange={(e) => setLocal((s) => ({ ...s, streamSpeed: e.target.value as StreamSpeed }))}>
            <option value="fast">快速（更利落）</option>
            <option value="medium">从容（推荐）</option>
            <option value="slow">细读（更有节奏）</option>
          </select>
        </div>
        <div className="settings-row">
          <label>打字音效</label>
          <select value={local.typingSound} onChange={(e) => setLocal((s) => ({ ...s, typingSound: e.target.value as TypingSoundMode }))}>
            <option value="off">关闭</option>
            <option value="typewriter">键盘 (清脆)</option>
            <option value="soft">轻柔 (气泡)</option>
            <option value="bubble">水泡 (低频)</option>
          </select>
        </div>
        <div className="settings-row">
          <label>回复朗读</label>
          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={local.ttsPlayback}
              onChange={(e) => setLocal((s) => ({ ...s, ttsPlayback: e.target.checked }))}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-row">
          <label>朗读服务</label>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <select
              value={local.ttsProvider}
              onChange={(e) => setLocal((s) => ({ ...s, ttsProvider: e.target.value as TtsProvider }))}
            >
              <option value="auto">自动：优先云端，失败回退本地</option>
              {minimaxTtsAvailable && <option value="minimax">MiniMax 云端朗读</option>}
              <option value="browser">浏览器本地朗读</option>
              <option value="dashscope">DashScope 云端朗读</option>
            </select>
            <span className="settings-desc" style={{ margin: 0, textAlign: 'right', maxWidth: 360 }}>
              MiniMax 更像正式语音助手，浏览器本地朗读最稳，自动适合日常使用。
            </span>
          </div>
        </div>
        {minimaxTtsAvailable ? (
          <div className="settings-row">
            <label>云端音色</label>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <select
                value={minimaxVoiceId}
                onChange={(e) => setMinimaxVoiceId(e.target.value)}
              >
                {MINIMAX_TTS_VOICE_OPTIONS.map((voice) => (
                  <option key={voice.value} value={voice.value}>{voice.label}</option>
                ))}
              </select>
              <span className="settings-desc" style={{ margin: 0, textAlign: 'right', maxWidth: 360 }}>
                检测到可用的 MiniMax 云端 TTS 能力。当前音色仅在选择 MiniMax 或自动回退到 MiniMax 时生效。
              </span>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <label>云端音色</label>
            <span className="settings-desc" style={{ margin: 0, textAlign: 'right', maxWidth: 360 }}>
              当前未检测到可用的 MiniMax 云端 TTS 能力，已自动隐藏专属音色配置，不会产生额外系统负担。
            </span>
          </div>
        )}
        <div className="settings-row">
          <label>试听音色</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="settings-btn" onClick={onPreviewTts} disabled={ttsPreviewStatus === 'playing'}>
              {ttsPreviewStatus === 'playing' ? '试听中...' : '播放试听'}
            </button>
            <span className="settings-desc" style={{ margin: 0 }}>
              {ttsPreviewStatus === 'success'
                ? '试听请求已发出，请检查系统音量与输出设备'
                : ttsPreviewStatus === 'error'
                ? (ttsPreviewError || '试听失败')
                : '使用当前朗读服务和默认音色播放一句测试语音'}
            </span>
          </div>
        </div>
      </section>
      <section className="settings-section">
        <h3>界面</h3>
        <div className="settings-row">
          <label>字体大小</label>
          <select value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="settings-select">
            {FONT_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <label>自动滚动</label>
          <label className="toggle-wrap">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-row">
          <label>消息历史上限</label>
          <select value={maxHistory} onChange={(e) => setMaxHistory(Number(e.target.value))} className="settings-select">
            <option value={50}>50 条</option>
            <option value={100}>100 条</option>
            <option value={200}>200 条</option>
          </select>
        </div>
      </section>
    </div>
  );
}
