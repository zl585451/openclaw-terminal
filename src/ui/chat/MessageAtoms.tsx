import React, { useState } from 'react';

export function MsgCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (_) { /* intentional: 保护区内的保守兜底,不主动传播 */ }
  };
  return (
    <button type="button" className="msg-copy-btn" onClick={handleCopy} title={copied ? '已复制' : '复制'}>
      {copied ? '✓' : '⎘'}
    </button>
  );
}

/** 打字机光标：单独组件避免随内容重渲染导致闪烁 */
export const TypewriterCursor = React.memo(function TypewriterCursor({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="cursor-blink">▋</span>;
});
