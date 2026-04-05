import type { Dispatch, SetStateAction } from 'react';
import type { Settings, StreamSpeed, TypingSoundMode } from '../../../contexts/SettingsContext';
import { allThemes, type ThemeId } from '../../../themes/themes';
import { FONT_SIZE_OPTIONS } from '../constants';

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
}: InterfaceTabViewProps) {
  return (
    <div className="settings-tab-content">
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
