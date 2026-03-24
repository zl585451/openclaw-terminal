const shared = require('./shared');

module.exports = {
  name: 'parking_add',
  definition: {
    type: 'function',
    function: {
      name: 'parking_add',
      description: '添加项目到停车场（待后续处理的备忘事项）',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '备忘内容' },
        },
        required: ['content'],
      },
    },
  },
  execute: async (args) => {
    const { loadTasksData, saveTasksData, getOnTaskBoardUpdate, log } = shared;
    const data = loadTasksData();
    const newItem = {
      id: `${Date.now()}`,
      content: (args.content || '').trim(),
      createdAt: new Date().toISOString(),
    };
    data.parking.push(newItem);
    if (saveTasksData(data)) {
      log.info('parking_add', { itemId: newItem.id, content: newItem.content });
      log.debug('parking_add saved counts', { tasks: data.tasks?.length || 0, parking: data.parking?.length || 0 });
      const cb = getOnTaskBoardUpdate();
      if (cb) cb();
      return { success: true, itemId: newItem.id, message: `已添加到停车场: ${newItem.content}` };
    }
    return { success: false, error: '保存失败' };
  },
};
