import React, { useEffect, useMemo, useState } from 'react';
import '../styles/SoundTab.css';

type MusicClip = {
  id: string;
  title: string;
  prompt: string;
  lyrics: string;
  instrumental: boolean;
  audioSrc: string;   // file:// URL
  filePath: string;   // 本地绝对路径（用于下载）
  mimeType: string;
  model: string;
  traceId?: string;
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  sizeBytes?: number;
  createdAt: number;
};

const PROMPT_PRESETS = [
  '电影感钢琴与弦乐，缓慢推进，深夜城市灯光，克制但有希望',
  'lofi hip hop，雨夜，温暖电钢，轻鼓点，适合专注工作',
  '独立流行，女声，透明感，海边日落，副歌有记忆点',
  '电子氛围，未来感，低频脉冲，冷色霓虹，适合片头',
];

const STYLE_TAGS = ['gabber', 'a major', 'male rock vocals', 'dirty south', 'gospel rock', 'chill r&b'];

const VOICE_PRESETS = [
  {
    id: 'male',
    label: '男声',
    prompt: '华语流行，男声，低沉温暖，近距离演唱，钢琴与柔和弦乐，深夜雨城，慢速推进，副歌打开',
  },
  {
    id: 'female',
    label: '女声',
    prompt: '独立流行，女声，清透带气声，温暖电钢与柔和鼓点，海边黄昏，克制主歌，副歌有记忆点',
  },
  {
    id: 'duet',
    label: '对唱',
    prompt: '华语流行对唱，男女双人和声，钢琴与弦乐，电影感，情绪递进，副歌有呼应与合唱层次',
  },
  {
    id: 'instrumental',
    label: '纯音乐',
    prompt: '电影感钢琴与弦乐，纯音乐，无人声，缓慢推进，深夜城市灯光，克制但有希望',
  },
];

const LYRIC_PRESET = `[Verse]
窗边的霓虹还没睡
心事像潮水慢慢堆
我把沉默折成一页
放进凌晨两点的风里

[Chorus]
如果夜晚也会发光
就让我们逆着人海歌唱
把没说出口的愿望
都写进这一段回响`;

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '--:--';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '--';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function filePathToUrl(filePath: string): string {
  // Windows 路径转 file:// URL（正斜杠）
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

const SoundTab: React.FC = () => {
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]);
  const [lyrics, setLyrics] = useState(LYRIC_PRESET);
  const [title, setTitle] = useState('Midnight Neon');
  const [mode, setMode] = useState<'simple' | 'advanced'>('advanced');
  const [advancedSection, setAdvancedSection] = useState<'audio' | 'lyrics' | 'styles'>('lyrics');
  const [instrumental, setInstrumental] = useState(false);
  const [selectedVoicePresets, setSelectedVoicePresets] = useState<string[]>([]);
  const [format, setFormat] = useState<'mp3' | 'wav'>('mp3');
  const [model, setModel] = useState<'music-2.6' | 'music-2.5+' | 'music-2.5'>('music-2.6');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [error, setError] = useState('');
  const [clips, setClips] = useState<MusicClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'player' | 'history'>('player');
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) || clips[0] || null,
    [clips, activeClipId],
  );

  const lyricsOptimizer = mode === 'simple';

  useEffect(() => {
    (window as any).electronAPI?.getApiKeys?.()
      ?.then((result: any) => {
        const key = String(result?.data?.MINIMAX_API_KEY || '').trim();
        setApiKeyConfigured(!!key);
      })
      .catch(() => setApiKeyConfigured(null));

    window.electronAPI?.musicHistoryLoad?.()
      .then((result) => {
        if (!result?.success || !Array.isArray(result.clips)) return;
        const loadedClips = result.clips.map((clip) => ({
          id: clip.id,
          title: clip.title,
          prompt: clip.prompt,
          lyrics: clip.lyrics,
          instrumental: clip.instrumental,
          audioSrc: filePathToUrl(clip.filePath),
          filePath: clip.filePath,
          mimeType: clip.mimeType,
          model: clip.model,
          traceId: clip.traceId,
          durationMs: clip.durationMs,
          sampleRate: clip.sampleRate,
          bitrate: clip.bitrate,
          sizeBytes: clip.sizeBytes,
          createdAt: clip.createdAt,
        } as MusicClip));
        setClips(loadedClips);
        setActiveClipId(loadedClips[0]?.id || null);
      })
      .catch(() => {});
  }, []);

  const appendPromptFragment = (base: string, fragment: string) => {
    const current = base.trim();
    if (!current) return fragment;
    if (current.includes(fragment)) return current;
    return `${current}，${fragment}`;
  };

  const removePromptFragment = (base: string, fragment: string) =>
    base
      .replace(`，${fragment}`, '')
      .replace(`${fragment}，`, '')
      .replace(fragment, '')
      .replace(/，{2,}/g, '，')
      .replace(/^，|，$/g, '')
      .trim();

  const applyVoicePreset = (presetId: string) => {
    const preset = VOICE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setPrompt((prev) => appendPromptFragment(prev, preset.prompt));
    setSelectedVoicePresets((prev) => (prev.includes(presetId) ? prev : [...prev, presetId]));
    setInstrumental(presetId === 'instrumental');
  };

  const removeVoicePreset = (presetId: string) => {
    const preset = VOICE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setPrompt((prev) => removePromptFragment(prev, preset.prompt));
    setSelectedVoicePresets((prev) => prev.filter((id) => id !== presetId));
    if (presetId === 'instrumental') {
      setInstrumental(false);
    }
  };

  const handleGenerateLyrics = async () => {
    setIsGeneratingLyrics(true);
    setError('');
    try {
      const result = await window.electronAPI?.lyricsGenerate?.({
        prompt: prompt.trim(),
        title: title.trim(),
      });
      if (!result?.success || !result.lyrics) {
        setError(result?.error || '自动生成歌词失败');
        return;
      }
      if (result.title) {
        setTitle(result.title);
      }
      if (result.styleTags) {
        setPrompt(result.styleTags);
      }
      setLyrics(result.lyrics);
      setInstrumental(false);
      setMode('advanced');
      setAdvancedSection('lyrics');
    } catch (err: any) {
      setError(err?.message || '自动生成歌词请求失败');
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const handleGenerate = async () => {
    const nextPrompt = prompt.trim();
    const nextLyrics = lyrics.trim();
    if (!nextPrompt) {
      setError('先写一点音乐描述，我们才能开始生成。');
      return;
    }
    if (!instrumental && !nextLyrics && !lyricsOptimizer) {
      setError('Advanced 模式下如果不是纯音乐，需要填写歌词。');
      return;
    }

    setIsGenerating(true);
    setError('');
    try {
      const result = await (window as any).electronAPI?.musicGenerate?.({
        title: title.trim(),
        model,
        prompt: nextPrompt,
        lyrics: lyricsOptimizer ? '' : nextLyrics,
        instrumental,
        lyricsOptimizer,
        sampleRate: 44100,
        bitrate: 256000,
        format,
      });

      if (!result?.success || !result?.filePath) {
        setError(result?.error || '音乐生成失败');
        return;
      }

      const mimeType = result.mimeType || (format === 'wav' ? 'audio/wav' : 'audio/mpeg');
      const filePath: string = result.filePath || '';
      const audioSrc = filePath ? filePathToUrl(filePath) : '';

      const clip: MusicClip = {
        id: result.clipId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: title.trim() || `Untitled Track ${clips.length + 1}`,
        prompt: nextPrompt,
        lyrics: lyricsOptimizer ? '' : nextLyrics,
        instrumental,
        audioSrc,
        filePath,
        mimeType,
        model: result.model || model,
        traceId: result.traceId,
        durationMs: result.durationMs,
        sampleRate: result.sampleRate,
        bitrate: result.bitrate,
        sizeBytes: result.sizeBytes,
        createdAt: Date.now(),
      };

      setClips((prev) => [clip, ...prev].slice(0, 8));
      setActiveClipId(clip.id);
      setRightTab('player');
    } catch (err: any) {
      setError(err?.message || '音乐生成请求失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteClip = async (id: string) => {
    await (window as any).electronAPI?.musicHistoryDelete?.(id);
    setClips((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeClipId === id) {
        setActiveClipId(next[0]?.id || null);
        if (next.length === 0) setRightTab('player');
      }
      return next;
    });
  };

  return (
    <div className="sound-tab">
      <section className="music-hero-card">
        <div className="music-hero-main">
          <div className="music-hero-topline">
            <p className="music-kicker">MiniMax Music Studio</p>
            <div className="music-hero-badges">
              <span className="music-header-pill">Audio</span>
              <span className="music-header-pill">Lyrics</span>
              <span className="music-header-pill">Styles</span>
            </div>
          </div>
          <div className="music-hero-copyblock">
            <h2>像 Suno 一样，先写感觉，再决定要不要展开细调。</h2>
            <p className="music-hero-copy">
              `Simple` 负责快速出歌，`Advanced` 再展开歌词、风格和输出参数。两套流程共用同一个试听区和最近作品区。
            </p>
          </div>
        </div>
        <div className="music-status-stack">
          <div className={`music-status-pill ${apiKeyConfigured ? 'ok' : 'warn'}`}>
            {apiKeyConfigured ? 'MiniMax Key 已配置' : '等待 MiniMax Key'}
          </div>
          <div className="music-status-meta">模型默认：music-2.6</div>
          <div className="music-status-meta">Simple 自动补歌词，Advanced 自定义歌词</div>
        </div>
      </section>

      <div className="music-studio-grid">
        <section className="music-compose-card">
          <div className="music-card-header">
            <span className="music-card-eyebrow">Compose</span>
            <span className="music-card-hint">先描述感觉，再决定要不要细调</span>
          </div>
          <div className="music-compose-scroll">
            <div className="music-mode-switch" role="tablist" aria-label="compose mode">
              <button
                type="button"
                className={`music-mode-tab ${mode === 'simple' ? 'active' : ''}`}
                onClick={() => setMode('simple')}
              >
                Simple
              </button>
              <button
                type="button"
                className={`music-mode-tab ${mode === 'advanced' ? 'active' : ''}`}
                onClick={() => setMode('advanced')}
              >
                Advanced
              </button>
            </div>

            <label className="music-field">
              <span>曲目标题</span>
              <input
                className="music-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给这首歌起个名字"
              />
            </label>

            {mode === 'simple' ? (
              <div className="music-simple-panel">
                <label className="music-field music-field-tight">
                  <span>Song Description</span>
                  <textarea
                    className="music-textarea music-textarea-simple"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="例如：Operatic death metal song about drowning in daylight"
                  />
                </label>

                <div className="music-voice-presets">
                  {VOICE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`music-chip ${selectedVoicePresets.includes(preset.id) ? 'music-chip-active' : ''}`}
                      onClick={() => applyVoicePreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {selectedVoicePresets.length > 0 ? (
                  <div className="music-selected-pills">
                    {selectedVoicePresets.map((presetId) => {
                      const preset = VOICE_PRESETS.find((item) => item.id === presetId);
                      if (!preset) return null;
                      return (
                        <button
                          key={`selected_${preset.id}`}
                          type="button"
                          className="music-selected-pill"
                          onClick={() => removeVoicePreset(preset.id)}
                        >
                          {preset.label}
                          <span>×</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="music-simple-actions">
                  <button
                    type="button"
                    className="music-pill-btn"
                    onClick={() => {
                      setMode('advanced');
                      setAdvancedSection('audio');
                    }}
                  >
                    + Audio
                  </button>
                  <button
                    type="button"
                    className="music-pill-btn"
                    onClick={() => {
                      setMode('advanced');
                      setAdvancedSection('lyrics');
                    }}
                  >
                    + Lyrics
                  </button>
                  <button
                    type="button"
                    className={`music-pill-toggle ${instrumental ? 'active' : ''}`}
                    onClick={() => setInstrumental((prev) => !prev)}
                  >
                    {instrumental ? 'Instrumental On' : 'Instrumental'}
                  </button>
                  <button
                    type="button"
                    className="music-pill-btn"
                    onClick={handleGenerateLyrics}
                    disabled={instrumental || isGeneratingLyrics}
                  >
                    {isGeneratingLyrics ? '写词中...' : 'Auto Lyrics'}
                  </button>
                </div>

                <div className="music-simple-inspo">
                  <div className="music-subtitle">Inspiration</div>
                  <div className="music-preset-row">
                    {STYLE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="music-chip"
                        onClick={() => setPrompt((prev) => (prev.includes(tag) ? prev : `${prev}${prev ? '，' : ''}${tag}`))}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <div className="music-note-inline">MiniMax 当前公开接口没有单独时长参数，常见结果约 30-90 秒。</div>
                  <div className="music-note-inline">官方文档说明只有 `output_format: url` 时链接有效期为 24 小时；我们当前默认走本地保存，不依赖这个时效。</div>
                </div>
              </div>
            ) : (
              <div className="music-advanced-panel">
                <div className="music-advanced-nav">
                  <button
                    type="button"
                    className={`music-advanced-nav-item ${advancedSection === 'audio' ? 'active' : ''}`}
                    onClick={() => setAdvancedSection('audio')}
                  >
                    <span>+</span>
                    <strong>Audio</strong>
                  </button>
                  <button
                    type="button"
                    className={`music-advanced-nav-item ${advancedSection === 'lyrics' ? 'active' : ''}`}
                    onClick={() => setAdvancedSection('lyrics')}
                  >
                    <span>+</span>
                    <strong>Lyrics</strong>
                  </button>
                  <button
                    type="button"
                    className={`music-advanced-nav-item ${advancedSection === 'styles' ? 'active' : ''}`}
                    onClick={() => setAdvancedSection('styles')}
                  >
                    <span>+</span>
                    <strong>Styles</strong>
                  </button>
                </div>

                <div className="music-advanced-stack">
                  <section className={`music-card-block ${advancedSection === 'audio' ? 'active' : ''}`}>
                    <div className="music-card-block-header">
                      <span>Audio</span>
                      <span className="music-card-block-meta">模型与输出格式</span>
                    </div>
                    <div className="music-advanced-grid">
                      <label className="music-field music-field-tight">
                        <span>音乐描述</span>
                        <textarea
                          className="music-textarea music-textarea-compact"
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="更具体地描述风格、情绪、场景、配器和节奏。"
                        />
                      </label>
                      <div className="music-settings-column">
                        <div className="music-toggle-row">
                          <button
                            type="button"
                            className={`music-toggle ${instrumental ? 'active' : ''}`}
                            onClick={() => setInstrumental((prev) => !prev)}
                          >
                            {instrumental ? '纯音乐' : '人声歌曲'}
                          </button>
                        </div>
                        <div className="music-voice-presets music-voice-presets-stack">
                          {VOICE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`music-chip ${selectedVoicePresets.includes(preset.id) ? 'music-chip-active' : ''}`}
                              onClick={() => applyVoicePreset(preset.id)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        {selectedVoicePresets.length > 0 ? (
                          <div className="music-selected-pills">
                            {selectedVoicePresets.map((presetId) => {
                              const preset = VOICE_PRESETS.find((item) => item.id === presetId);
                              if (!preset) return null;
                              return (
                                <button
                                  key={`advanced_selected_${preset.id}`}
                                  type="button"
                                  className="music-selected-pill"
                                  onClick={() => removeVoicePreset(preset.id)}
                                >
                                  {preset.label}
                                  <span>×</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <select className="music-select" value={model} onChange={(e) => setModel(e.target.value as 'music-2.6' | 'music-2.5+' | 'music-2.5')}>
                          <option value="music-2.6">music-2.6</option>
                          <option value="music-2.5+">music-2.5+</option>
                          <option value="music-2.5">music-2.5</option>
                        </select>
                        <select className="music-select" value={format} onChange={(e) => setFormat(e.target.value as 'mp3' | 'wav')}>
                          <option value="mp3">MP3</option>
                          <option value="wav">WAV</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  <section className={`music-card-block ${advancedSection === 'lyrics' ? 'active' : ''}`}>
                    <div className="music-card-block-header">
                      <span>Lyrics</span>
                      <div className="music-inline-actions">
                        <button
                          type="button"
                          className="music-icon-btn"
                          onClick={() => setLyrics(LYRIC_PRESET)}
                          disabled={instrumental}
                        >
                          填入示例
                        </button>
                        <button
                          type="button"
                          className="music-icon-btn accent"
                          onClick={handleGenerateLyrics}
                          disabled={instrumental || isGeneratingLyrics}
                        >
                          {isGeneratingLyrics ? '写词中...' : '自动写词'}
                        </button>
                      </div>
                    </div>
                    <label className="music-field music-field-tight">
                      <span>{instrumental ? '纯音乐模式下歌词会被忽略' : 'Write some lyrics or leave blank for instrumental'}</span>
                      <textarea
                        className="music-textarea music-textarea-lyrics"
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        placeholder="支持 [Verse] / [Chorus] / [Bridge] 等结构标签"
                        disabled={instrumental}
                      />
                    </label>
                    <div className="music-note-inline">支持结构标签：`[Verse]`、`[Chorus]`、`[Bridge]` 等，歌词越完整，时长通常越稳定。</div>
                  </section>

                  <section className={`music-card-block ${advancedSection === 'styles' ? 'active' : ''}`}>
                    <div className="music-card-block-header">
                      <span>Styles</span>
                      <button
                        type="button"
                        className="music-icon-btn accent"
                        onClick={() => setPrompt(PROMPT_PRESETS[0])}
                      >
                        推荐风格
                      </button>
                    </div>
                    <div className="music-style-copy">{prompt}</div>
                    <div className="music-note-inline">建议提示词结构：曲风 + 人声类型 + 情绪 + 配器 + 场景 + 副歌要求。</div>
                    <div className="music-preset-row">
                      {STYLE_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="music-chip"
                          onClick={() => setPrompt((prev) => (prev.includes(tag) ? prev : `${prev}${prev ? '，' : ''}${tag}`))}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="music-card-block music-card-block-collapsed">
                    <div className="music-card-block-header">
                      <span>More Options</span>
                      <span className="music-card-block-meta">当前官方公开接口没有单独时长 / 男声女声参数，我们通过提示词预设来控制</span>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {error ? <div className="music-error-box">{error}</div> : null}
          </div>

          <div className="music-compose-footer">
            <div className="music-generate-row">
              <button
                type="button"
                className="music-generate-btn"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? '生成中，请等音乐落地...' : 'Create'}
              </button>
              <span className="music-generate-hint">
                {mode === 'simple'
                  ? instrumental
                    ? 'Simple 模式：按描述直接生成纯音乐'
                    : 'Simple 模式：按描述自动补歌词'
                  : instrumental
                    ? 'Advanced 模式：按描述生成纯音乐'
                    : 'Advanced 模式：按自定义歌词生成'}
              </span>
            </div>
          </div>
        </section>

        <section className="music-result-card">
          <div className="music-card-header">
            <div className="music-mode-switch" role="tablist">
              <button
                type="button"
                className={`music-mode-tab ${rightTab === 'player' ? 'active' : ''}`}
                onClick={() => setRightTab('player')}
              >
                Now Playing
              </button>
              <button
                type="button"
                className={`music-mode-tab ${rightTab === 'history' ? 'active' : ''}`}
                onClick={() => setRightTab('history')}
              >
                History{clips.length > 0 ? ` (${clips.length})` : ''}
              </button>
            </div>
            <span className="music-card-hint">
              {rightTab === 'player' ? '生成成功后可直接试听和下载' : '点击曲目切换播放，× 删除'}
            </span>
          </div>

          {rightTab === 'history' ? (
            <div className="music-history-panel">
              {clips.length > 0 ? (
                <div className="music-history-list">
                  {clips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`music-history-item ${clip.id === activeClip?.id ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="music-history-item-main"
                        onClick={() => { setActiveClipId(clip.id); setRightTab('player'); }}
                      >
                        <div>
                          <strong>{clip.title}</strong>
                          <span>{clip.model} · {formatDuration(clip.durationMs)}</span>
                        </div>
                        <span className="music-history-type">{clip.instrumental ? '纯音乐' : '歌曲'}</span>
                      </button>
                      <button
                        type="button"
                        className="music-history-delete"
                        title="删除"
                        onClick={() => handleDeleteClip(clip.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="music-history-empty">还没有生成过作品。</div>
              )}
            </div>
          ) : activeClip ? (
            <div className="music-player-shell">
              <div className="music-cover-art">
                <div className="music-cover-ring" />
                <div className="music-cover-core">
                  <span>{activeClip.title.slice(0, 2).toUpperCase()}</span>
                </div>
              </div>

              <div className="music-track-meta">
                <h3>{activeClip.title}</h3>
                <p>{activeClip.prompt}</p>
                <div className="music-meta-grid">
                  <span>{activeClip.model}</span>
                  <span>{formatDuration(activeClip.durationMs)}</span>
                  <span>{formatBytes(activeClip.sizeBytes)}</span>
                  <span>{activeClip.instrumental ? 'Instrumental' : 'Vocal'}</span>
                </div>
              </div>

              <audio key={activeClip.id} controls className="music-audio-player" src={activeClip.audioSrc} />

              <div className="music-result-actions">
                {activeClip.audioSrc ? (
                  <a className="music-primary-link" href={activeClip.audioSrc} download={`${activeClip.title}.${activeClip.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`} target="_blank" rel="noreferrer">
                    下载音频
                  </a>
                ) : null}
                {activeClip.traceId ? <span className="music-trace-id">trace: {activeClip.traceId}</span> : null}
              </div>

              {!activeClip.instrumental && activeClip.lyrics ? (
                <div className="music-lyrics-preview">
                  <div className="music-subtitle">Lyrics</div>
                  <pre>{activeClip.lyrics}</pre>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="music-empty-state">
              <div className="music-empty-orb" />
              <h3>第一首歌还没开始生成</h3>
              <p>Simple 用一句话快速出歌，Advanced 再写歌词和风格。生成成功后，这里会出现播放器、时长和下载入口。</p>
            </div>
          )}
        </section>
      </div>

    </div>
  );
};

export default SoundTab;
