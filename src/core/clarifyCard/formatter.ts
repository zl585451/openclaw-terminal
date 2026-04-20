import type { ClarifyReply } from './types';

/**
 * 把卡片回执格式化成 AMY 可读的文本。
 * 设计原则：格式简单稳定，AMY 通过固定前缀 [澄清回执] 识别。
 */
export function formatClarifyReply(reply: ClarifyReply): string {
  const displayTitle = reply.cardTitle?.trim() || '澄清';

  if (reply.skipped) {
    return `[澄清跳过] ${displayTitle}`;
  }

  const lines: string[] = [`[澄清回执] ${displayTitle}`];
  for (const f of reply.fields) {
    const value = Array.isArray(f.value) ? f.value.join('、') : f.value;
    const customMark = f.isCustom ? ' (自填)' : '';
    lines.push(`${f.label}：${value}${customMark}`);
  }
  return lines.join('\n');
}
