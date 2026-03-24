const shared = require('./shared');

module.exports = {
  name: 'task_delete',
  definition: {
    type: 'function',
    function: {
      name: 'task_delete',
      description: '删除指定任务（按标题匹配）',
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
    const before = data.tasks.length;
    data.tasks = data.tasks.filter(t => (t.content || '').trim() !== title);
    if (data.tasks.length === before) return { success: false, error: `未找到任务: ${title}` };
    if (saveTasksData(data)) {
      return { success: true, message: `任务已删除: ${title}` };
    }
    return { success: false, error: '保存失败' };
  },
};
