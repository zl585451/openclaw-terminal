const shared = require('./shared');

module.exports = {
  name: 'tasks_update',
  definition: {
    type: 'function',
    function: {
      name: 'tasks_update',
      description: '更新任务状态（完成/未完成/内容/优先级）',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
          done: { type: 'boolean', description: '是否完成' },
          content: { type: 'string', description: '新内容（可选）' },
          priority: { type: 'string', description: '新优先级（可选）', enum: ['p0', 'p1', 'p2'] },
        },
        required: ['taskId'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData, log } = shared;
    const data = loadTasksData();
    const idx = data.tasks.findIndex(t => t.id === args.taskId);
    if (idx === -1) return { success: false, error: '任务不存在' };

    const updates = {};
    if (args.done !== undefined) updates.done = args.done;
    if (args.content) updates.content = args.content.trim();
    if (args.priority) updates.priority = args.priority;

    data.tasks[idx] = { ...data.tasks[idx], ...updates };
    if (saveTasksData(data)) {
      log.info('tasks_update', { taskId: args.taskId, updates });
      return { success: true, message: '任务已更新' };
    }
    return { success: false, error: '保存失败' };
  },
};
