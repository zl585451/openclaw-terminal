/**
 * memory_recall 工具
 * 按日期+关键词检索原始对话日志
 */
const memory = require('../memory');

function nodeContent(result) {
  return result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
}

function nodeChildren(result) {
  return result?.data?.node?.children || result?.data?.children || result?.node?.children || result?.children || [];
}

function uriFromChild(child) {
  if (child?.uri) return child.uri;
  if (child?.path) return `core://${child.path}`;
  return '';
}

module.exports = {
  name: 'memory_recall',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '回忆原始对话',
  definition: {
    type: 'function',
    function: {
      name: 'memory_recall',
      description: '按日期检索某一天的原始对话记录。用于当摘要信息不足时查询具体对话细节。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期 YYYY-MM-DD，例如 2026-04-20',
          },
          keyword: {
            type: 'string',
            description: '可选关键词过滤，只返回包含该词的对话轮',
          },
          limit: {
            type: 'number',
            description: '最多返回轮数，默认 5',
          },
        },
        required: ['date'],
      },
    },
  },
  execute: async (args) => {
    const date = String(args.date || '').trim();
    const keyword = String(args.keyword || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(20, Number(args.limit) || 5));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: '日期格式错误，应为 YYYY-MM-DD' };
    }

    const browseResult = await memory.readMemory(`core://logs/raw/${date}`, { treat404AsDebug: true });
    const children = nodeChildren(browseResult);
    if (!browseResult.ok || children.length === 0) {
      return { success: true, data: { turns: [], message: `${date} 无对话记录` } };
    }

    const turns = [];
    for (const child of children) {
      const uri = uriFromChild(child);
      if (!uri) continue;
      const r = await memory.readMemory(uri, { treat404AsDebug: true });
      if (!r.ok) continue;
      try {
        const turn = JSON.parse(nodeContent(r) || '{}');
        if (keyword) {
          const text = `${turn.user || ''} ${turn.assistant || ''}`.toLowerCase();
          if (!text.includes(keyword)) continue;
        }
        turns.push({
          uri,
          ts: turn.ts,
          user: String(turn.user || '').slice(0, 500),
          assistant: String(turn.assistant || '').slice(0, 500),
          tools: turn.tools || [],
        });
        if (turns.length >= limit) break;
      } catch {}
    }

    return {
      success: true,
      data: {
        date,
        keyword: keyword || null,
        returned: turns.length,
        turns,
      },
    };
  },
};
