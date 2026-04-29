'use strict';

/**
 * recall_tool_result 工具
 *
 * 模型可以通过 callId 取回之前被截断的工具结果完整内容。
 * 当模型在 context 里看到 "[工具结果已截断, callId=xxx]" 提示时，
 * 如果需要完整内容，就调用本工具。
 */

const { recallToolResult } = require('../runtime/toolResultArchive');

module.exports = {
  name: 'recall_tool_result',
  category: 'system',
  riskLevel: 'safe',
  displayName: '回读工具结果',

  definition: {
    type: 'function',
    function: {
      name: 'recall_tool_result',
      description: [
        '回读之前被截断的工具调用完整结果。',
        '当你在历史 tool 消息中看到「[工具结果已截断，callId=xxx]」提示时，',
        '需要完整原文时调用此工具。传入 callId 即可。',
        '注意：回读的内容也会在本次 context 中占用空间，只在确实需要细节时使用。',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          callId: {
            type: 'string',
            description: '要回读的工具调用 ID（从截断提示中获取）',
          },
          maxChars: {
            type: 'number',
            description: '可选，限制返回字符数（默认 8000，不要超过 20000）',
          },
        },
        required: ['callId'],
      },
    },
  },

  execute: async (args) => {
    const callId = args?.callId;
    if (!callId) {
      return { success: false, error: '必须提供 callId' };
    }

    const record = recallToolResult(callId);
    if (!record) {
      return {
        success: false,
        error: `未找到 callId=${callId} 的归档记录，可能已超出归档窗口`,
      };
    }

    const maxChars = Math.min(args?.maxChars || 8000, 20000);
    const fullContent = typeof record.result === 'string'
      ? record.result
      : JSON.stringify(record.result, null, 2);

    const truncated = fullContent.length > maxChars;
    const value = truncated
      ? fullContent.slice(0, maxChars) + `\n\n[...剩余 ${fullContent.length - maxChars} 字符，提高 maxChars 参数可获取更多]`
      : fullContent;

    return {
      success: true,
      callId,
      toolName: record.toolName,
      args: record.args,
      timestamp: record.timestamp,
      content: value,
      truncated,
      originalSize: fullContent.length,
    };
  },
};
