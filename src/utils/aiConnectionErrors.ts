export function humanizeAiConnectionError(raw: string, providerId?: string): string {
  const text = String(raw || '').trim();
  if (!text) return '连接测试失败，请稍后重试。';

  const lower = text.toLowerCase();
  if (providerId === 'minimax' && !lower.includes('sk-cp-') && (lower.includes('token plan') || lower.includes('api key'))) {
    return 'MiniMax 需要 Token Plan API Key（以 sk-cp- 开头），普通按量 Key 不能用。';
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'API Key 无效或权限不足。百炼 Coding Plan 需要 sk-sp- 前缀的 Key；MiniMax 需要 sk-cp- 前缀的 Token Plan Key。';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return '连接超时。如果你使用 Google 或 OpenAI，可能需要在高级设置里填写 HTTPS 代理地址。';
  }
  if (lower.includes('404') && lower.includes('model')) {
    return '模型不存在。请点击“换一个”尝试其他推荐模型。';
  }
  return text.slice(0, 200);
}
