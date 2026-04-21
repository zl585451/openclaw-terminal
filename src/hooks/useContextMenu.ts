import { useState, useCallback } from 'react';
import type { ContextMenuState } from '../components/ContextMenu';

export interface UseContextMenuReturn {
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  onContextMenu: (e: React.MouseEvent, msgId: number, text: string) => void;
  onCopy: (text: string) => void;
  onResend: (text: string) => void;
  onDelete: (msgId: number, onDelete: (msgId: number) => void) => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent, msgId: number, text: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msgId, text });
  }, []);

  const onCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) { /* intentional: 右键菜单关闭时的权限异常可忽略 */ }
    setContextMenu(null);
  }, []);

  const onResend = useCallback((_text: string) => {
    setContextMenu(null);
    // Caller should handle injectInputText
  }, []);

  const onDelete = useCallback((msgId: number, onDelete: (msgId: number) => void) => {
    onDelete(msgId);
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    setContextMenu,
    onContextMenu,
    onCopy,
    onResend,
    onDelete,
  };
}
