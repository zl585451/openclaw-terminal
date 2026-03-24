const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASKS_FILE = path.join(__dirname, 'tasks_runtime.json');
const TASK_TIMEOUT_MS = 60000; // 60秒超时

// 任务状态枚举
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

// 读取所有任务
function readTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return {};
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

// 写入所有任务
function writeTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.error('[TaskQueue] 写入失败:', e.message);
  }
}

// 创建新任务
function createTask({ type, instruction, sessionKey, toolName, toolArgs }) {
  const tasks = readTasks();
  const taskId = `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  tasks[taskId] = {
    taskId,
    type,           // 任务类型：web_search / read_file / exec_command 等
    instruction,    // AMY 给 Worker 的指令（自然语言描述）
    toolName,       // 要调用的工具名
    toolArgs,       // 工具参数
    sessionKey,     // 属于哪个会话
    status: STATUS.PENDING,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    notified: false // AMY 是否已经告知用户
  };

  writeTasks(tasks);
  console.log(`[TaskQueue] 创建任务 ${taskId} | 类型: ${type}`);
  return taskId;
}

// 更新任务状态
function updateTask(taskId, updates) {
  const tasks = readTasks();
  if (!tasks[taskId]) return;
  tasks[taskId] = { ...tasks[taskId], ...updates };
  writeTasks(tasks);
}

// 获取单个任务
function getTask(taskId) {
  return readTasks()[taskId] || null;
}

// 获取某个 session 里已完成但未通知 AMY 的任务
function getPendingNotifyTasks(sessionKey) {
  const tasks = readTasks();
  return Object.values(tasks).filter(t =>
    t.sessionKey === sessionKey &&
    (t.status === STATUS.DONE || t.status === STATUS.FAILED || t.status === STATUS.TIMEOUT) &&
    !t.notified
  );
}

// 标记任务已通知
function markNotified(taskIds) {
  const tasks = readTasks();
  for (const taskId of taskIds) {
    if (tasks[taskId]) tasks[taskId].notified = true;
  }
  writeTasks(tasks);
}

// 检查并处理超时任务（Gateway 启动时调用一次）
function checkTimeouts() {
  const tasks = readTasks();
  const now = Date.now();
  let changed = false;

  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.status === STATUS.RUNNING && task.startedAt) {
      if (now - task.startedAt > TASK_TIMEOUT_MS) {
        tasks[taskId].status = STATUS.TIMEOUT;
        tasks[taskId].error = '任务超时（超过60秒未完成）';
        tasks[taskId].completedAt = now;
        console.warn(`[TaskQueue] 任务 ${taskId} 超时`);
        changed = true;
      }
    }
  }

  if (changed) writeTasks(tasks);
}

// 清理7天前的已完成任务
function cleanup() {
  const tasks = readTasks();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.notified && task.completedAt && task.completedAt < cutoff) {
      delete tasks[taskId];
      removed++;
    }
  }

  if (removed > 0) {
    writeTasks(tasks);
    console.log(`[TaskQueue] 清理了 ${removed} 个过期任务`);
  }
}

module.exports = {
  createTask, updateTask, getTask,
  getPendingNotifyTasks, markNotified,
  checkTimeouts, cleanup, STATUS
};
