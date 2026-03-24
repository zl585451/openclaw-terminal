const shared = require('./shared');

module.exports = {
  name: 'task_list',
  definition: {
    type: 'function',
    function: {
      name: 'task_list',
      description: '列出所有任务和停车场内容',
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
