/** 从 AI 回复中提取 [THINK_MODE:xxx] 标记（兼容旧消息） */
export function detectThinkModeMarker(content: string): string | null {
  if (!content) return null;
  const m = content.match(/\[THINK_MODE:(\w+)\]/i);
  return m ? m[1].toLowerCase() : null;
}

/** 去除 AI 回复中的 [THINK_MODE:xxx] 标记（兼容旧消息） */
export function stripThinkModeMarker(content: string): string {
  return content.replace(/\n?\[THINK_MODE:\w+\]/gi, '').trim();
}
