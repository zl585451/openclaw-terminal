import { useState, useRef, useCallback, useEffect } from 'react';
import type { TtsProvider } from '../contexts/SettingsContext';
import { extractAssistantCotAndMain } from '../utils/cotExtract';
import { stripMarkdown } from '../utils/stripMarkdown';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export interface TtsSettings {
  ttsPlayback: boolean;
  ttsProvider: TtsProvider;
}

export interface TtsPlaybackMessage {
  id: number;
  content: string;
}

export function useTtsPlayback(settings: TtsSettings) {
  const [ttsError, setTtsError] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!settings.ttsPlayback && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setSpeakingMessageId(null);
    }
    if (!settings.ttsPlayback && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      setSpeakingMessageId(null);
    }
  }, [settings.ttsPlayback]);

  const stopTts = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
    }
    setSpeakingMessageId(null);
  }, []);

  const playBrowserTTS = useCallback(async (text: string, msgId: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('当前环境不支持浏览器本地朗读');
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
      }
      setSpeakingMessageId(null);
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
      }
      setTtsError('浏览器本地朗读失败');
      setSpeakingMessageId(null);
    };
    speechUtteranceRef.current = utterance;
    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  }, []);

  const playTTSForMessage = useCallback(
    async (msg: TtsPlaybackMessage) => {
      if (!settings.ttsPlayback || !msg.content) return;
      const { mainContent } = extractAssistantCotAndMain(msg.content || '');
      const plain = stripMarkdown(mainContent || msg.content);
      const truncated =
        plain.length > 200 ? plain.slice(0, 200) + '...详细内容请查看聊天窗口' : plain;
      if (!truncated.trim()) return;
      setTtsError('');
      if (settings.ttsProvider === 'browser') {
        try {
          await playBrowserTTS(truncated, msg.id);
        } catch (err: any) {
          setTtsError(err?.message || '浏览器本地朗读失败');
        }
        return;
      }
      setSpeakingMessageId(msg.id);
      const result = await ipcRenderer.invoke('tts-speak', {
        text: truncated,
        providerPreference: settings.ttsProvider,
      });
      if (!result?.success || !result.audioBase64) {
        if (settings.ttsProvider === 'auto') {
          try {
            await playBrowserTTS(truncated, msg.id);
            setTtsError('云端朗读不可用，已回退到本地朗读');
            return;
          } catch {
            /* fall through */
          }
        }
        const error = result?.error || '语音朗读失败';
        setTtsError(error);
        ipcRenderer.invoke('show-notification', {
          title: '语音朗读失败',
          body: String(error).slice(0, 120),
        });
        setSpeakingMessageId(null);
        return;
      }
      const audio = new Audio('data:audio/mp3;base64,' + result.audioBase64);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingMessageId(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setTtsError('音频播放失败，请检查系统音量与输出设备');
        setSpeakingMessageId(null);
        audioRef.current = null;
      };
      audio.play().catch((err: any) => {
        setTtsError(err?.message || '音频播放被系统阻止');
        setSpeakingMessageId(null);
      });
    },
    [settings.ttsPlayback, settings.ttsProvider, playBrowserTTS]
  );

  return {
    speakingMessageId,
    ttsError,
    playTTSForMessage,
    stopTts,
  };
}
