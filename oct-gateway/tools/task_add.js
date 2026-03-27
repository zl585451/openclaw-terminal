const shared = require('./shared');

module.exports = {
  name: 'task_add',
  definition: {
    type: 'function',
    function: {
      name: 'task_add',
      description: '添加任务到任务看板',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          priority: { type: 'string', description: '优先级', enum: ['P0', 'P1', 'P2', ''] },
        },
        required: ['title'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData, getOnTaskBoardUpdate, log } = shared;
    const title = (args.title || '').trim();
    if (!title) return { success: false, error: '任务标题不能为空' };
    let pr = (args.priority || '').toUpperCase();
    if (pr !== 'P0' && pr !== 'P1' && pr !== 'P2') pr = 'P2';
    const data = loadTasksData();
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: title,
      priority: pr.toLowerCase(),
      done: false,
      source: 'amy',
      createdAt: new Date().toISOString(),
    };
    data.tasks.push(newTask);
    if (saveTasksData(data)) {
      log.debug('task_add saved counts', { tasks: data.tasks?.length || 0, parking: data.parking?.length || 0 });
      const cb = getOnTaskBoardUpdate();
      if (cb) cb();
      return { success: true, taskId: newTask.id, message: `任务已添加: ${title}` };
    }
    return { success: false, error: '保存失败' };
  },
};
