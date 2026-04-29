import { useState, useCallback, useEffect } from 'react';
import type { UploadedFile } from '../ui/chat/chatTypes';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      res(dataUrl.includes(',') ? dataUrl.split(',')[1]! : '');
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function fileToUploadedFile(file: File): Promise<UploadedFile> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeType = file.type || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');

  const filePath = (file as File & { path?: string }).path;
  if (filePath) {
    return {
      name: file.name,
      size: file.size,
      ext,
      mimeType,
      isText: false,
      content: null,
      base64: isImage ? await readFileAsBase64(file) : undefined,
      path: filePath,
    };
  }

  const textExts = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'html', 'css', 'sql', 'xml', 'yaml', 'yml'];
  const isText = textExts.includes(ext);
  let content: string | null = null;
  if (isText) content = await file.text();
  const base64 = await readFileAsBase64(file);
  return { name: file.name, size: file.size, ext, mimeType, isText, content, base64 };
}

export interface UseFileAttachmentReturn {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  imagePreview: string | null;
  setImagePreview: React.Dispatch<React.SetStateAction<string | null>>;
  isDragging: boolean;
  setDragging: (v: boolean) => void;
  screenshotFlash: boolean;
  handleScreenshot: () => void;
  handleFileAttach: (files: File[]) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
}

export function useFileAttachment(): UseFileAttachmentReturn {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [isDragging, setDragging] = useState(false);

  const handleScreenshot = useCallback(async () => {
    const req = typeof (window as any).require === 'function' ? (window as any).require : null;
    if (!req) return;
    await ipcRenderer.invoke('minimize-for-capture');
    await new Promise((r) => setTimeout(r, 600));
    try {
      const { desktopCapturer } = req('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const source = sources[0];
      if (!source) throw new Error('No screen source');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSourceId: source.id, chromeMediaSource: 'desktop' } } as any,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      await new Promise((r) => { video.onloadeddata = r; });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            } catch (_) { /* intentional: 用户取消文件选择不是错误 */ }
          }
          resolve();
        }, 'image/png');
      });
      const dataUrl = canvas.toDataURL('image/png');
      setImagePreview(dataUrl);
    } catch (e) {
      console.error('Screenshot failed:', e);
    } finally {
      await ipcRenderer.invoke('restore-after-capture');
      setScreenshotFlash(true);
      setTimeout(() => setScreenshotFlash(false), 1500);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleScreenshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleScreenshot]);

  useEffect(() => {
    const onTrigger = () => handleScreenshot();
    ipcRenderer.on('screenshot-trigger', onTrigger);
    return () => { ipcRenderer.removeListener('screenshot-trigger', onTrigger); };
  }, [handleScreenshot]);

  const handleFileAttach = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const converted = await Promise.all(files.map(fileToUploadedFile));
      setUploadedFiles((prev) => [...prev, ...converted]);
    } catch (e) {
      console.error('[ChatTab] File attach failed:', e);
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const r = new FileReader();
          r.onload = () => setImagePreview(r.result as string);
          r.readAsDataURL(blob);
        }
        break;
      }
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setUploadedFiles([]);
    setImagePreview(null);
  }, []);

  return {
    uploadedFiles,
    setUploadedFiles,
    imagePreview,
    setImagePreview,
    isDragging,
    setDragging,
    screenshotFlash,
    handleScreenshot,
    handleFileAttach,
    handlePaste,
    removeFile,
    clearFiles,
  };
}
