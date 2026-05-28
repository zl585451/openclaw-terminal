/**
 * 系统回复状态解析（纯函数）
 *
 * 从 🦞 开头的系统回复文本中提取结构化状态信息。
 * 不包含任何 setState 调用，由调用方负责状态更新。
 */

export interface SystemReplyStatus {
  modelName?: string;
  tokenIn?: number;
  ctxMax?: number;
  ctxUsed?: number;
  apiKeyInfo?: string;
  thinkMode?: string;
  runtimeMode?: string;
  compactions?: number;
  queueInfo?: string;
}

/**
 * 解析以 🦞 开头的系统回复文本，提取各类状态字段。
 * 仅当文本以 🦞 开头时才解析，否则返回空对象。
 */
export function parseSystemReplyStatus(text: string): SystemReplyStatus {
  if (!text || !text.startsWith('🦞')) {
    return {};
  }

  const result: SystemReplyStatus = {};

  const modelMatch = text.match(/Model:\s*(.+)/);
  const tokensMatch = text.match(/Tokens:\s*([\d.]+)k?\s*\/\s*([\d.]+)k/i);
  const ctxMatch1 = text.match(/Context:\s*([\d.]+)\s*\/\s*([\d.]+)k\s*\((\d+)%\)/i);
  const ctxMatch2 = text.match(/Context:\s*([\d.]+)k\s*tokens/i);

  if (modelMatch) result.modelName = modelMatch[1].trim();

  if (tokensMatch) {
    result.tokenIn = parseFloat(tokensMatch[1]) * 1000;
    result.ctxMax = parseFloat(tokensMatch[2]) * 1000;
  }

  if (ctxMatch1) {
    result.ctxUsed = parseFloat(ctxMatch1[1]) * 1000;
    result.ctxMax = parseFloat(ctxMatch1[2]) * 1000;
  } else if (ctxMatch2) {
    result.ctxUsed = parseFloat(ctxMatch2[1]) * 1000;
  }

  const apiKeyMatch = text.match(/api-key\s*\(([^)]+)\)/i);
  const thinkMatch = text.match(/(?:Reasoning|Think):\s*(\S+)/i);
  const runtimeMatch = text.match(/Runtime:\s*(\S+)/i);
  const compactMatch = text.match(/Compactions:\s*(\d+)/i);
  const queueMatch = text.match(/Queue:\s*(.+)/i);

  if (apiKeyMatch) result.apiKeyInfo = `api-key (${apiKeyMatch[1]})`;
  if (thinkMatch) result.thinkMode = thinkMatch[1];
  if (runtimeMatch) result.runtimeMode = runtimeMatch[1];
  if (compactMatch) result.compactions = parseInt(compactMatch[1], 10);
  if (queueMatch) result.queueInfo = queueMatch[1].trim();

  return result;
}
