import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

const MUSIC_STUDIO_DIR = 'MUSIC_STUDIO_DIR_PLACEHOLDER';
const MUSIC_HISTORY_FILE = 'MUSIC_HISTORY_FILE_PLACEHOLDER';

export function registerMediaHandlers(_deps: IpcDeps) {
  const readAppConfig = () => (globalThis as any).readAppConfig?.() ?? {};
  const pushUiLog = (line: string) => (globalThis as any).mainWindow?.webContents.send('openclaw-log-lines', [line]);
  const getMiniMaxEndpoints = (cfg: Record<string, any>) => {
    const configuredBase = String(cfg.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || '').trim();
    const httpBase = configuredBase || 'https://api.minimaxi.com/v1';
    const normalized = httpBase.replace(/\/$/, '');
    let wsBase = '';
    try {
      const url = new URL(normalized);
      wsBase = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws/v1/t2a_v2`;
    } catch {
      wsBase = 'wss://api.minimaxi.com/ws/v1/t2a_v2';
    }
    return { httpBase: normalized, wsBase };
  };
  const synthesizeMiniMaxViaWebSocket = (globalThis as any).synthesizeMiniMaxViaWebSocket;

  ipcMain.handle('tts-speak', async (_: unknown, payload: { text: string; providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax' }) => {
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    const providerPreference = payload?.providerPreference || 'auto';
    if (!text) {
      return { success: false, error: 'TTS text is empty' };
    }

    const cfg = readAppConfig();
    const dashscopeApiKey = String(cfg.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
    const minimaxApiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
    const minimaxVoiceId = String(cfg.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse').trim() || 'male-qn-qingse';
    const dashscopeBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const { wsBase: minimaxWsUrl } = getMiniMaxEndpoints(cfg);
    const currentProviderId = String(cfg.OCT_PROVIDER || '').trim();

    const providers: Array<'minimax' | 'dashscope'> =
      providerPreference === 'browser' ? []
      : providerPreference === 'minimax' ? ['minimax']
      : providerPreference === 'dashscope' ? ['dashscope']
      : currentProviderId === 'minimax' ? ['minimax']
      : currentProviderId === 'bailian' || currentProviderId === 'bailian-coding' ? ['dashscope']
      : [];

    const errors: string[] = [];

    for (const provider of providers) {
      try {
        if (provider === 'minimax') {
          if (!minimaxApiKey) {
            errors.push('MiniMax API Key not configured');
            continue;
          }
          pushUiLog(`[MiniMax TTS] start provider=MiniMax model=speech-2.8-hd voice=${minimaxVoiceId} chars=${text.length}`);
          if (synthesizeMiniMaxViaWebSocket) {
            try {
              const audioBuffer = await synthesizeMiniMaxViaWebSocket({
                wsUrl: minimaxWsUrl,
                apiKey: minimaxApiKey,
                text,
                voiceId: minimaxVoiceId,
              });
              pushUiLog(`[MiniMax TTS] success provider=MiniMax model=speech-2.8-hd voice=${minimaxVoiceId} chars=${text.length} bytes=${audioBuffer.length}`);
              return {
                success: true,
                provider: 'minimax',
                audioBase64: audioBuffer.toString('base64'),
                mimeType: 'audio/mpeg',
              };
            } catch (err: any) {
              pushUiLog(`[MiniMax TTS][ERR] ${err?.message || 'unknown error'}`);
              errors.push(`MiniMax WebSocket TTS failed: ${err?.message || 'unknown error'}`);
              if (providerPreference === 'minimax') {
                break;
              }
              continue;
            }
          } else {
            errors.push('MiniMax TTS not available in this build');
            continue;
          }
        }

        if (!dashscopeApiKey) {
          errors.push('DashScope API Key not configured');
          continue;
        }
        pushUiLog(`[DashScope TTS] start provider=DashScope voice=longxiaochun chars=${text.length}`);
        const res = await fetch(`${dashscopeBaseUrl.replace(/\/$/, '')}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dashscopeApiKey}`,
          },
          body: JSON.stringify({
            model: 'cosyvoice-v1',
            voice: 'longxiaochun',
            input: text,
            response_format: 'mp3',
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          pushUiLog(`[DashScope TTS][ERR] ${res.status} ${errText.slice(0, 160)}`);
          errors.push(`DashScope TTS API error ${res.status}: ${errText}`);
          continue;
        }
        const buf = await res.arrayBuffer();
        pushUiLog(`[DashScope TTS] success provider=DashScope voice=longxiaochun chars=${text.length} bytes=${buf.byteLength}`);
        return {
          success: true,
          provider: 'dashscope',
          audioBase64: Buffer.from(buf).toString('base64'),
          mimeType: 'audio/mpeg',
        };
      } catch (e: any) {
        errors.push(`${provider} TTS request failed: ${e?.message || 'unknown error'}`);
      }
    }

    return { success: false, error: errors.join(' | ') || (providerPreference === 'browser' ? 'Browser TTS handled in renderer' : 'No matching cloud TTS capability for current provider') };
  });

  ipcMain.handle('music-history-load', async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const app = require('electron').app;
      const musicStudioDir = path.join(app.getPath('userData'), 'music-studio');
      const musicHistoryFile = path.join(musicStudioDir, 'history.json');

      if (!fs.existsSync(musicStudioDir)) {
        fs.mkdirSync(musicStudioDir, { recursive: true });
      }
      if (!fs.existsSync(musicHistoryFile)) return { success: true, clips: [] };

      const raw = JSON.parse(fs.readFileSync(musicHistoryFile, 'utf-8'));
      const history = Array.isArray(raw) ? raw : [];

      const clips = history.flatMap((item: any) => {
        const filePath = path.join(musicStudioDir, item.filename);
        if (!fs.existsSync(filePath)) return [];
        return [{ ...item, filePath }];
      });
      return { success: true, clips };
    } catch (e: any) {
      return { success: false, error: e?.message || '音乐历史读取失败', clips: [] };
    }
  });

  ipcMain.handle('music-history-delete', async (_: unknown, id: string) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const app = require('electron').app;
      const musicStudioDir = path.join(app.getPath('userData'), 'music-studio');
      const musicHistoryFile = path.join(musicStudioDir, 'history.json');

      if (!fs.existsSync(musicStudioDir)) return { success: true };
      if (!fs.existsSync(musicHistoryFile)) return { success: true };

      const raw = JSON.parse(fs.readFileSync(musicHistoryFile, 'utf-8'));
      const history = Array.isArray(raw) ? raw : [];

      const item = history.find((h: any) => h.id === id);
      if (item) {
        const filePath = path.join(musicStudioDir, item.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      const nextHistory = history.filter((h: any) => h.id !== id);
      fs.writeFileSync(musicHistoryFile, JSON.stringify(nextHistory, null, 2), 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || '删除失败' };
    }
  });

  ipcMain.handle('music-generate', async (_, payload: {
    title?: string;
    model?: string;
    prompt?: string;
    lyrics?: string;
    instrumental?: boolean;
    lyricsOptimizer?: boolean;
    sampleRate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav';
  }) => {
    const cfg = readAppConfig();
    const fs = require('fs');
    const path = require('path');
    const app = require('electron').app;

    const apiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
    const baseUrl = String(cfg.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').trim().replace(/\/$/, '');
    const model = String(payload?.model || 'music-2.6').trim() || 'music-2.6';
    const title = String(payload?.title || '').trim();
    const prompt = String(payload?.prompt || '').trim();
    const lyrics = String(payload?.lyrics || '').trim();
    const instrumental = !!payload?.instrumental;
    const lyricsOptimizer = !!payload?.lyricsOptimizer;
    const sampleRate = Number(payload?.sampleRate) || 44100;
    const bitrate = Number(payload?.bitrate) || 256000;
    const format = payload?.format === 'wav' ? 'wav' : 'mp3';

    if (!apiKey) {
      return { success: false, error: 'MiniMax API Key 未配置，请先在设置中填写 Token Plan API Key。' };
    }
    if (!prompt) {
      return { success: false, error: '请先填写音乐描述。' };
    }
    if (!instrumental && !lyrics && !lyricsOptimizer) {
      return { success: false, error: '当前是人声歌曲模式，请填写歌词，或开启"自动生成歌词"。' };
    }

    pushUiLog(`[MiniMax Music] start model=${model} instrumental=${instrumental} lyricsOptimizer=${lyricsOptimizer} promptChars=${prompt.length} lyricsChars=${lyrics.length}`);

    try {
      const res = await fetch(`${baseUrl}/music_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          lyrics,
          lyrics_optimizer: lyricsOptimizer,
          is_instrumental: instrumental,
          output_format: 'hex',
          audio_setting: {
            sample_rate: sampleRate,
            bitrate,
            format,
          },
        }),
        signal: AbortSignal.timeout(240000),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errMsg = data?.base_resp?.status_msg || text || `HTTP ${res.status}`;
        pushUiLog(`[MiniMax Music][ERR] ${res.status} ${String(errMsg).slice(0, 200)}`);
        return { success: false, error: `MiniMax Music API 返回 ${res.status}: ${String(errMsg).slice(0, 300)}` };
      }

      const audioHex = String(data?.data?.audio || '').trim();
      if (!audioHex) {
        const statusMsg = data?.base_resp?.status_msg || '未返回音频数据';
        pushUiLog(`[MiniMax Music][ERR] empty audio payload msg=${String(statusMsg).slice(0, 160)}`);
        return { success: false, error: `MiniMax Music 未返回音频数据：${statusMsg}` };
      }

      const audioBuffer = Buffer.from(audioHex, 'hex');
      const musicDuration = Number(data?.extra_info?.music_duration) || 0;
      const musicSampleRate = Number(data?.extra_info?.music_sample_rate) || sampleRate;
      const musicBitrate = Number(data?.extra_info?.bitrate) || bitrate;
      const musicSize = Number(data?.extra_info?.music_size) || audioBuffer.length;
      const traceId = String(data?.trace_id || '').trim();
      const clipId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const filename = `${clipId}.${format === 'wav' ? 'wav' : 'mp3'}`;

      const musicStudioDir = path.join(app.getPath('userData'), 'music-studio');
      if (!fs.existsSync(musicStudioDir)) {
        fs.mkdirSync(musicStudioDir, { recursive: true });
      }
      const filePath = path.join(musicStudioDir, filename);
      fs.writeFileSync(filePath, audioBuffer);

      const entry = {
        id: clipId,
        title: title || `track_${clipId}`,
        prompt,
        lyrics,
        instrumental,
        model,
        traceId,
        durationMs: musicDuration,
        sampleRate: musicSampleRate,
        bitrate: musicBitrate,
        sizeBytes: musicSize,
        mimeType,
        filename,
        createdAt: Date.now(),
      };

      if (!fs.existsSync(path.join(musicStudioDir, 'history.json'))) {
        fs.writeFileSync(path.join(musicStudioDir, 'history.json'), JSON.stringify([], null, 2), 'utf-8');
      }
      const historyRaw = JSON.parse(fs.readFileSync(path.join(musicStudioDir, 'history.json'), 'utf-8'));
      const history = Array.isArray(historyRaw) ? historyRaw : [];
      const nextHistory = [entry, ...history.filter((item: any) => item.id !== entry.id)].slice(0, 8);
      fs.writeFileSync(path.join(musicStudioDir, 'history.json'), JSON.stringify(nextHistory, null, 2), 'utf-8');

      const keepFiles = new Set(nextHistory.map((item: any) => item.filename));
      for (const existing of fs.readdirSync(musicStudioDir)) {
        if (existing === 'history.json') continue;
        if (!keepFiles.has(existing)) {
          try {
            fs.unlinkSync(path.join(musicStudioDir, existing));
          } catch {}
        }
      }

      pushUiLog(`[MiniMax Music] success model=${model} durationMs=${musicDuration} bytes=${audioBuffer.length} trace=${traceId || 'n/a'}`);

      return {
        success: true,
        clipId,
        filePath,
        mimeType,
        model,
        traceId,
        durationMs: musicDuration,
        sampleRate: musicSampleRate,
        bitrate: musicBitrate,
        sizeBytes: musicSize,
      };
    } catch (e: any) {
      pushUiLog(`[MiniMax Music][ERR] ${e?.message || String(e)}`);
      return { success: false, error: e?.message || 'MiniMax Music 请求失败' };
    }
  });

  ipcMain.handle('lyrics-generate', async (_, payload: {
    prompt?: string;
    title?: string;
  }) => {
    const cfg = readAppConfig();
    const apiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
    const baseUrl = String(cfg.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').trim().replace(/\/$/, '');
    const prompt = String(payload?.prompt || '').trim();
    const title = String(payload?.title || '').trim();

    if (!apiKey) {
      return { success: false, error: 'MiniMax API Key 未配置，请先在设置中填写 Token Plan API Key。' };
    }

    pushUiLog(`[MiniMax Lyrics] start promptChars=${prompt.length} titleChars=${title.length}`);

    try {
      const res = await fetch(`${baseUrl}/lyrics_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          mode: 'write_full_song',
          prompt,
          ...(title ? { title } : {}),
        }),
        signal: AbortSignal.timeout(120000),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errMsg = data?.base_resp?.status_msg || text || `HTTP ${res.status}`;
        pushUiLog(`[MiniMax Lyrics][ERR] ${res.status} ${String(errMsg).slice(0, 200)}`);
        return { success: false, error: `MiniMax Lyrics API 返回 ${res.status}: ${String(errMsg).slice(0, 300)}` };
      }

      const generatedLyrics = String(data?.lyrics || '').trim();
      const songTitle = String(data?.song_title || title || '').trim();
      const styleTags = String(data?.style_tags || '').trim();

      if (!generatedLyrics) {
        const statusMsg = data?.base_resp?.status_msg || '未返回歌词';
        pushUiLog(`[MiniMax Lyrics][ERR] empty lyrics msg=${String(statusMsg).slice(0, 160)}`);
        return { success: false, error: `MiniMax Lyrics 未返回歌词：${statusMsg}` };
      }

      pushUiLog(`[MiniMax Lyrics] success title=${songTitle || 'n/a'} styleTagsChars=${styleTags.length} lyricsChars=${generatedLyrics.length}`);
      return {
        success: true,
        title: songTitle,
        styleTags,
        lyrics: generatedLyrics,
      };
    } catch (e: any) {
      pushUiLog(`[MiniMax Lyrics][ERR] ${e?.message || String(e)}`);
      return { success: false, error: e?.message || 'MiniMax Lyrics 请求失败' };
    }
  });
}