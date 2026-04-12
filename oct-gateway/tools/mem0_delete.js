/**
 * mem0_delete — AI 删除 Mem0 记忆条目
 *
 * 使用场景：
 *   用户说"这条记忆是错的，删掉它" → AI 调用此工具
 *   AI 检测到矛盾记忆时主动清理旧条目
 *   用户要求"忘掉我说过的X" → 先 mem0_search 找到 id，再 mem0_delete
 *
 * 安全设计：
 *   - riskLevel: guarded（需要用户意图明确）
 *   - 删除前应先用 mem0_search 确认内容，再执行删除
 *   - 删除不可逆，操作前告知用户
 */

const mem0Client = require('../mem0_client');
const { createLogger } = require('../logger');
const log = createLogger('tool:mem0_delete');

module.exports = {
  name: 'mem0_delete',
  category: 'memory',
  riskLevel: 'guarded',
  displayName: '删除智能记忆',

  definition: {
    type: 'function',
    function: {
      name: 'mem0_delete',
      description:
        '删除 Mem0 记忆库中的指定记忆条目。' +
        '使用前必须先通过 mem0_search 找到记忆的 id，再调用此工具删除。' +
        '删除不可逆，执行前应告知用户将要删除的内容并获得确认。',
      parameters: {
        type: 'object',
        properties: {
          memory_id: {
            type: 'string',
            description: '要删除的记忆 ID（从 mem0_search 结果的 id 字段获取）',
          },
          reason: {
            type: 'string',
            description: '删除原因，例如"信息有误"、"用户要求"、"与新信息矛盾"',
          },
        },
        required: ['memory_id'],
      },
    },
  },

  execute: async (args) => {
    const memoryId = String(args.memory_id || '').trim();
    const reason   = String(args.reason || '未指定').trim();

    if (!memoryId) {
      return {
        success: false,
        data: null,
        error: 'memory_id 不能为空',
        hint: '请先用 mem0_search 找到要删除的记忆 id',
      };
    }

    const alive = await mem0Client.isAlive();
    if (!alive) {
      return {
        success: false,
        data: null,
        error: 'Mem0 服务未启动',
        hint: 'Mem0 记忆服务当前不可用',
      };
    }

    log.info('mem0_delete executing', { memoryId, reason });

    const result = await mem0Client.deleteMemory(memoryId);

    if (!result.ok) {
      return {
        success: false,
        data: null,
        error: result.error || '删除失败',
        hint: '请确认 memory_id 正确，或重试',
        memory_id: memoryId,
      };
    }

    log.info('mem0_delete ok', { memoryId, reason });

    return {
      success: true,
      data: { memory_id: memoryId, reason },
      error: null,
      hint: null,
      memory_id: memoryId,
      deleted: true,
    };
  },
};
