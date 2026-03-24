const shared = require('./shared');

module.exports = {
  name: 'tasks_add',
  definition: {
    type: 'function',
    function: {
      name: 'tasks_add',
      description: '添加新任务到任务看板',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '任务内容' },
          priority: { type: 'string', description: '优先级: p0(紧急), p1(重要), p2(普通)', enum: ['p0', 'p1', 'p2'] },
        },
        required: ['content'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData, log } = shared;
    const data = loadTasksData();
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: (args.content || '').trim(),
      priority: args.priority || 'p2',
      done: false,
      source: 'amy',
      createdAt: new Date().toISOString(),
    };
    data.tasks.push(newTask);
    if (saveTasksData(data)) {
      const icon = newTask.priority === 'p0' ? '🔴' : newTask.priority === 'p1' ? '🟡' : '🟢';
      log.info('tasks_add', { icon, taskId: newTask.id, content: newTask.content });
      return { success: true, taskId: newTask.id, message: `任务已添加: ${icon} ${newTask.content}` };
    }
    return { success: false, error: '保存失败' };
  },
};
