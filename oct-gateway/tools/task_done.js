const shared = require('./shared');

module.exports = {
  name: 'task_done',
  definition: {
    type: 'function',
    function: {
      name: 'task_done',
      description: '将指定任务标记为完成（按标题匹配）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
        },
        required: ['title'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData } = shared;
    const title = (args.title || '').trim();
    if (!title) return { success: false, error: '任务标题不能为空' };
    const data = loadTasksData();
    const idx = data.tasks.findIndex(t => (t.content || '').trim() === title);
    if (idx === -1) return { success: false, error: `未找到任务: ${title}` };
    data.tasks[idx].done = true;
    if (saveTasksData(data)) {
      return { success: true, message: `任务已完成: ${title}` };
    }
    return { success: false, error: '保存失败' };
  },
};
