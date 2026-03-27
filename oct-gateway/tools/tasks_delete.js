const shared = require('./shared');

module.exports = {
  name: 'tasks_delete',
  definition: {
    type: 'function',
    function: {
      name: 'tasks_delete',
      description: '删除指定任务',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
        },
        required: ['taskId'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData, log } = shared;
    const data = loadTasksData();
    const originalLen = data.tasks.length;
    data.tasks = data.tasks.filter(t => t.id !== args.taskId);
    if (data.tasks.length === originalLen) {
      return { success: false, error: '任务不存在' };
    }
    if (saveTasksData(data)) {
      log.info('tasks_delete', { taskId: args.taskId });
      return { success: true, message: '任务已删除' };
    }
    return { success: false, error: '保存失败' };
  },
};
