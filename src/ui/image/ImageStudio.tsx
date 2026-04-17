import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ImageResult {
  url: string;
  prompt: string;
  timestamp: number;
}

interface ImageStudioProps {
  onSendToChat: (text: string) => void;
  registerPromptInjector: (fn: (prompt: string) => void) => void;
  onInsertImageToChat: (imageUrl: string, prompt: string) => void;
  onClose: () => void;
  initialPrompt?: string;
}

const ASPECT_OPTIONS = [
  { value: '1:1', label: '方形 1:1' },
  { value: '16:9', label: '横向 16:9' },
  { value: '9:16', label: '竖向 9:16' },
  { value: '4:3', label: '横向 4:3' },
  { value: '3:4', label: '竖向 3:4' },
  { value: '3:2', label: '横向 3:2' },
  { value: '2:3', label: '竖向 2:3' },
];

const STYLE_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'photoreal', label: '写实' },
  { value: 'illustration', label: '插画' },
  { value: 'cinematic', label: '电影感' },
  { value: 'concept', label: '概念设计' },
];

export default function ImageStudio({
  onSendToChat,
  registerPromptInjector,
  onInsertImageToChat,
  onClose,
  initialPrompt,
}: ImageStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [stylePreset, setStylePreset] = useState('auto');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [seed, setSeed] = useState('');
  const [promptOptimizer, setPromptOptimizer] = useState(false);
  const [aigcWatermark, setAigcWatermark] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ImageResult | null>(null);
  const currentRequestId = useRef<string | null>(null);
  const promptRef = useRef('');

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    registerPromptInjector((optimized: string) => {
      setPrompt(optimized);
      setStatusMsg('已应用 AMY 优化后的提示词');
    });
  }, [registerPromptInjector]);

  useEffect(() => {
    const next = (initialPrompt || '').trim();
    if (!next) return;
    setPrompt(next);
  }, [initialPrompt]);

  const normalizedDimensions = useMemo(() => {
    const width = Number(customWidth);
    const height = Number(customHeight);
    const valid = Number.isFinite(width) && Number.isFinite(height)
      && width >= 512 && width <= 2048 && height >= 512 && height <= 2048
      && width % 8 === 0 && height % 8 === 0;
    return valid ? { width, height } : null;
  }, [customHeight, customWidth]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onImageResult?.((payload) => {
      if (payload?.requestId && currentRequestId.current && payload.requestId !== currentRequestId.current) {
        return;
      }

      if (payload?.status === 'generating') {
        setStatusMsg(payload?.message || '正在生成，请稍候...');
        return;
      }

      setIsGenerating(false);
      currentRequestId.current = null;

      if (payload?.error) {
        setStatusMsg(`生成失败：${payload.error}`);
        return;
      }

      if (payload?.imageUrl) {
        const promptText = payload.prompt || promptRef.current;
        const rawUrls = Array.isArray(payload?.imageUrls) && payload.imageUrls.length > 0
          ? payload.imageUrls
          : [payload.imageUrl];
        const urls = Array.from<string>(
          new Set(rawUrls.filter((url: unknown): url is string => typeof url === 'string' && !!url))
        );
        const timeBase = Date.now();
        const nextResults: ImageResult[] = urls.map((url: string, index: number) => ({
          url,
          prompt: promptText,
          timestamp: timeBase + index,
        }));
        setResults((prev) => [...nextResults, ...prev].slice(0, 12));
        setSelectedResult(nextResults[0] || null);
        setStatusMsg(urls.length > 1 ? `生成成功，共 ${urls.length} 张` : '生成成功');
        if (nextResults[0]) {
          onInsertImageToChat(nextResults[0].url, nextResults[0].prompt);
        }
      }
    });

    return () => {
      cleanup?.();
    };
  }, [onInsertImageToChat]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setStatusMsg('请输入提示词');
      return;
    }
    if (isGenerating) return;

    const requestId = `img_${Date.now()}`;
    currentRequestId.current = requestId;
    setIsGenerating(true);
    setStatusMsg('发送请求中...');

    const result = await window.electronAPI?.imageGenerate?.({
      requestId,
      prompt: trimmedPrompt,
      negativePrompt: negativePrompt.trim(),
      aspectRatio,
      width: normalizedDimensions?.width,
      height: normalizedDimensions?.height,
      seed: seed.trim() || undefined,
      promptOptimizer,
      aigcWatermark,
      stylePreset,
      quality,
    });

    if (!result?.success) {
      setIsGenerating(false);
      currentRequestId.current = null;
      setStatusMsg(result?.error || '发送失败');
    }
  }, [aigcWatermark, aspectRatio, isGenerating, negativePrompt, normalizedDimensions, prompt, promptOptimizer, quality, seed, stylePreset]);

  const handleOptimize = useCallback(() => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setStatusMsg('请先输入初始提示词');
      return;
    }
    onSendToChat(
      `请帮我优化以下生图提示词。只输出优化后的英文 prompt，不要解释，不要加引号，不要使用 markdown：\n\n生图提示词：${trimmedPrompt}`
    );
    setStatusMsg('已发送给 AMY 优化');
  }, [onSendToChat, prompt]);

  const handleOpenOriginal = useCallback(async (url: string) => {
    try {
      const result = await window.electronAPI?.openExternalUrl?.(url);
      if (result?.success) return;
    } catch {}
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleDownload = useCallback(async (url: string) => {
    const safePrompt = (promptRef.current || selectedResult?.prompt || 'image')
      .slice(0, 32)
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
    try {
      const result = await window.electronAPI?.downloadImage?.({
        url,
        suggestedName: `${safePrompt || 'oct-image'}-${Date.now()}.jpg`,
      });
      if (result?.success) {
        setStatusMsg('下载成功');
        return;
      }
      if (result?.error && result.error !== '已取消下载') {
        setStatusMsg(`下载失败：${result.error}`);
        return;
      }
      if (result?.error === '已取消下载') {
        setStatusMsg('已取消下载');
        return;
      }
    } catch {}

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safePrompt || 'oct-image'}-${Date.now()}.jpg`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
    setStatusMsg('已触发浏览器下载');
  }, [selectedResult]);

  const handleCopyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setStatusMsg('已复制原图链接');
      return;
    } catch {}

    const input = document.createElement('textarea');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    setStatusMsg('已复制原图链接');
  }, []);

  const thumbnailResults = selectedResult
    ? results.filter((item) => item.timestamp !== selectedResult.timestamp)
    : results;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>Image Studio</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
            独立文生图通道，不进入聊天上下文
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="返回聊天 (Esc)"
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          返回聊天
        </button>
      </div>

      <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle)' }}>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
          提示词
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="描述你想生成的画面，支持中英文"
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 96,
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={handleOptimize}
          style={{
            marginTop: 8,
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent-primary)',
            background: 'transparent',
            color: 'var(--accent-primary)',
            cursor: 'pointer',
          }}
        >
          让 AMY 优化提示词
        </button>

        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', margin: '12px 0 6px' }}>
          负向提示词
        </label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          placeholder="例如：blurry, ugly, watermark"
          style={{
            width: '100%',
            resize: 'vertical',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              画幅
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              {ASPECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              风格倾向
            </label>
            <select
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              {STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              质量
            </label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value === 'high' ? 'high' : 'standard')}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <option value="standard">标准</option>
              <option value="high">高质量</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              随机种子 Seed
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="留空则随机"
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 12px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={promptOptimizer} onChange={(e) => setPromptOptimizer(e.target.checked)} />
            自动优化提示词
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={aigcWatermark} onChange={(e) => setAigcWatermark(e.target.checked)} />
            添加水印
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {advancedOpen ? '收起高级尺寸' : '展开高级尺寸'}
          </button>
          {advancedOpen ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input
                type="text"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="自定义宽度 512-2048"
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="自定义高度 512-2048"
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ gridColumn: '1 / span 2', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                宽高需同时填写、范围 512-2048 且为 8 的倍数。不同供应商可能忽略该项。
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          当前只保留稳定的文生图主链路；图生图已暂时下线，避免不确定的风格偏移。
        </div>

        {statusMsg ? (
          <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {statusMsg}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '11px 0',
            borderRadius: 8,
            border: 'none',
            background: isGenerating ? 'var(--bg-surface)' : 'var(--accent-primary)',
            color: isGenerating ? 'var(--text-tertiary)' : 'var(--bg-base)',
            cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
        >
          {isGenerating ? '生成中...' : '开始生成'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {selectedResult ? (
          <div style={{ marginBottom: 12 }}>
            <img
              src={selectedResult.url}
              alt={selectedResult.prompt}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: '40vh',
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleDownload(selectedResult.url)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                下载
              </button>
              <button
                type="button"
                onClick={() => handleOpenOriginal(selectedResult.url)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                打开原图
              </button>
              <button
                type="button"
                onClick={() => handleCopyLink(selectedResult.url)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                复制链接
              </button>
              <button
                type="button"
                onClick={() => onInsertImageToChat(selectedResult.url, selectedResult.prompt)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--accent-primary)',
                  background: 'transparent',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                }}
              >
                插入聊天
              </button>
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}>
              {selectedResult.prompt}
            </div>
          </div>
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            padding: 24,
          }}>
            生成结果会显示在这里
          </div>
        )}

        {thumbnailResults.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {thumbnailResults.map((item) => (
              <div
                key={item.timestamp}
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: selectedResult?.timestamp === item.timestamp
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                }}
              >
                <img
                  src={item.url}
                  alt={item.prompt}
                  onClick={() => setSelectedResult(item)}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    objectFit: 'cover',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleDownload(item.url)}
                  title="下载图片"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    padding: '4px 6px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  下载
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
