const taskQueue = require('./task_queue');
const toolLoader = require('./tool_loader');

// 执行单个任务
async function executeTask(taskId) {
  const task = taskQueue.getTask(taskId);
  if (!task) return;

  // 标记为运行中
  taskQueue.updateTask(taskId, {
    status: taskQueue.STATUS.RUNNING,
    startedAt: Date.now()
  });

  console.log(`[Worker] 开始执行任务 ${taskId} | 工具: ${task.toolName}`);

  // 超时保护
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('执行超时')), 58000)
  );

  try {
    const result = await Promise.race([
      toolLoader.executeTool(task.toolName, task.toolArgs),
      timeoutPromise
    ]);

    taskQueue.updateTask(taskId, {
      status: taskQueue.STATUS.DONE,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      completedAt: Date.now()
    });

    console.log(`[Worker] 任务 ${taskId} 完成 ✅`);

  } catch (e) {
    const isTimeout = e.message === '执行超时';
    taskQueue.updateTask(taskId, {
      status: isTimeout ? taskQueue.STATUS.TIMEOUT : taskQueue.STATUS.FAILED,
      error: e.message,
      completedAt: Date.now()
    });

    console.error(`[Worker] 任务 ${taskId} ${isTimeout ? '超时' : '失败'}: ${e.message}`);
  }
}

// 派发任务（异步，不阻塞调用方）
function dispatch(taskId) {
  // setImmediate 确保当前回复先发出去，再开始执行任务
  setImmediate(() => {
    executeTask(taskId).catch(e => {
      console.error(`[Worker] 未捕获异常 ${taskId}:`, e.message);
      taskQueue.updateTask(taskId, {
        status: taskQueue.STATUS.FAILED,
        error: `未捕获异常: ${e.message}`,
        completedAt: Date.now()
      });
    });
  });
}

module.exports = { dispatch };
