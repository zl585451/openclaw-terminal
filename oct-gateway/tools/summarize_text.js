'use strict';

const { summarize } = require('../services/summarizer');

module.exports = {
  name: 'summarize_text',
  category: 'system',
  riskLevel: 'safe',
  displayName: '文本摘要',
  timeoutMs: 60000,

  definition: {
    type: 'function',
    function: {
      name: 'summarize_text',
      description: '把长文本压缩成指定长度的摘要。适用场景：大段文字压缩、对话历史压缩、长文档要点提取。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要摘要的原文，单次最多 8000 字符。' },
          targetLength: { type: 'number', description: '目标字数，默认 500。' },
          purpose: {
            type: 'string',
            enum: ['general', 'tool_result', 'chapter', 'scroll'],
            description: '摘要用途，会影响摘要重点。',
          },
          preserveKeywords: {
            type: 'array',
            items: { type: 'string' },
            description: '必须保留的关键词列表。',
          },
        },
        required: ['text'],
      },
    },
  },

  execute: async (args) => {
    const text = args?.text;
    if (!text || typeof text !== 'string') {
      return { success: false, error: '必须提供 text 参数' };
    }
    if (text.length > 8000) {
      return {
        success: false,
        error: `文本超过 8000 字符(${text.length})，请先切分后再摘要。`,
      };
    }

    try {
      const result = await summarize(text, {
        purpose: args?.purpose || 'general',
        targetLength: args?.targetLength || 500,
        preserveKeywords: args?.preserveKeywords,
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  },
};
