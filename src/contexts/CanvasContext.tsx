import React, { createContext, useContext, useState, useCallback } from 'react';

export type CanvasMode = 'markdown' | 'code' | 'html';

interface CanvasState {
  isOpen: boolean;
  content: string;
  mode: CanvasMode;
  title: string;
  language: string; // 代码模式下的语言（如 'typescript'）
}

interface CanvasContextValue extends CanvasState {
  openCanvas: (content: string, mode: CanvasMode, title?: string, language?: string) => void;
  closeCanvas: () => void;
  updateContent: (content: string) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CanvasState>({
    isOpen: false,
    content: '',
    mode: 'markdown',
    title: '',
    language: 'text',
  });

  const openCanvas = useCallback((content: string, mode: CanvasMode, title = '', language = 'text') => {
    setState({ isOpen: true, content, mode, title, language });
  }, []);

  const closeCanvas = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const updateContent = useCallback((content: string) => {
    setState(prev => ({ ...prev, content }));
  }, []);

  return (
    <CanvasContext.Provider value={{ ...state, openCanvas, closeCanvas, updateContent }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider');
  return ctx;
}