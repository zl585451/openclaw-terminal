const shared = require('./shared');

module.exports = {
  name: 'tasks_read',
  definition: {
    type: 'function',
    function: {
      name: 'tasks_read',
      description: '读取本地任务看板数据（tasks + parking + intention），AI 通过此工具查看当前任务列表',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData } = shared;
    const data = loadTasksData();
    return { success: true, data };
  },
};
