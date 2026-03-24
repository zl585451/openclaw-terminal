const config = require('./config');
const taskQueue = require('./task_queue');
const worker = require('./worker');

// 后台任务触发词 → 工具映射
const TASK_TOOL_MAP = {
  '搜索': { toolName: 'web_search', extractArgs: (msg) => ({ query: msg }) },
  '查一下': { toolName: 'web_search', extractArgs: (msg) => ({ query: msg }) },
  '查找': { toolName: 'web_search', extractArgs: (msg) => ({ query: msg }) },
  '读取文件': { toolName: 'read_file', extractArgs: (msg) => {
    const match = msg.match(/读取文件[：:]\s*(.+)/);
    return { path: match ? match[1].trim() : '' };
  }},
  '执行': { toolName: 'exec_command', extractArgs: (msg) => {
    const match = msg.match(/执行[：:]\s*(.+)/);
    return { command: match ? match[1].trim() : '' };
  }},
};

function tryDispatchAsTask(userMessage, sessionKey) {
  const ASYNC_TRIGGERS = [
    '后台', '帮我查', '帮我搜', '查一下', '搜索一下',
    '顺便', '同时', '另外帮我', '后台执行', '读取文件'
  ];

  const triggered = ASYNC_TRIGGERS.some(t => userMessage.includes(t));
  if (!triggered) return null;

  for (const [keyword, toolConfig] of Object.entries(TASK_TOOL_MAP)) {
    if (userMessage.includes(keyword)) {
      try {
        const toolArgs = toolConfig.extractArgs(userMessage);
        const taskId = taskQueue.createTask({
          type: keyword,
          instruction: userMessage,
          toolName: toolConfig.toolName,
          toolArgs,
          sessionKey
        });
        worker.dispatch(taskId);
        return taskId;
      } catch (e) {
        console.error('[Orchestrator] 任务派发失败:', e.message);
      }
    }
  }
  return null;
}

function getCompletedTasksContext(sessionKey) {
  const doneTasks = taskQueue.getPendingNotifyTasks(sessionKey);
  if (doneTasks.length === 0) return null;

  const lines = doneTasks.map(task => {
    if (task.status === 'done') {
      return `✅ 后台任务完成（${task.type}）：\n${task.result}`;
    } else {
      return `❌ 后台任务失败（${task.type}）：${task.error}`;
    }
  });

  taskQueue.markNotified(doneTasks.map(t => t.taskId));

  return `\n\n---\n## 📬 后台任务结果\n${lines.join('\n\n')}`;
}

// 意图分类规则（关键词匹配，轻量快速，不消耗额外 token）
const INTENT_RULES = [
  {
    intent: 'code',
    agent: 'Coder',
    keywords: ['写代码', '帮我写', 'cursor提示词', 'bug', '报错', '怎么实现',
               '代码', '函数', '接口', '组件', '脚本', 'python', 'javascript',
               'typescript', '修复', '重构'],
    description: '代码生成/调试任务'
  },
  {
    intent: 'write',
    agent: 'Writer',
    keywords: ['写文章', '写脚本', '写文案', '帮我写一篇', '内容创作',
               '标题', '视频脚本', '小红书', '抖音文案', '推广文'],
    description: '内容创作任务'
  },
  {
    intent: 'research',
    agent: 'Researcher',
    keywords: ['调研', '整理资料', '帮我找', '搜集', '分析一下',
               '对比', '总结一下', '报告'],
    description: '信息研究任务'
  }
];

// 简单对话判断（这些直接跳过分析，AMY 自己回复）
const DIRECT_PATTERNS = [
  /^(你好|hi|hello|在吗|早|晚安|累了|谢谢|好的|嗯|哦|明白|知道了)/i,
  /^.{0,15}$/, // 15字以内的短消息，直接对话
];

/**
 * 分析用户消息意图
 * @returns { intent, agent, shouldDelegate, description }
 */
function analyzeIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { intent: 'chat', agent: 'AMY', shouldDelegate: false };
  }

  const msg = userMessage.trim();

  // 短消息或对话模式 → 直接回复
  for (const pattern of DIRECT_PATTERNS) {
    if (pattern.test(msg)) {
      return { intent: 'chat', agent: 'AMY', shouldDelegate: false };
    }
  }

  // 关键词匹配专业任务
  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      if (msg.includes(keyword)) {
        return {
          intent: rule.intent,
          agent: rule.agent,
          shouldDelegate: true,
          description: rule.description
        };
      }
    }
  }

  // 默认：AMY 直接处理
  return { intent: 'general', agent: 'AMY', shouldDelegate: false };
}

/**
 * 主入口：处理一条用户消息
 * 现阶段：只分析和记录，不实际切换 Agent
 * 未来：shouldDelegate=true 时路由到对应 Agent
 */
async function dispatch(userMessage, sessionKey) {
  const analysis = analyzeIntent(userMessage);

  // 尝试异步任务派发
  const taskId = tryDispatchAsTask(userMessage, sessionKey);

  if (taskId) {
    console.log(`[Orchestrator] 已派发后台任务 ${taskId}`);
    analysis.backgroundTaskId = taskId;
    analysis.hasBackgroundTask = true;
  }

  if (analysis.shouldDelegate) {
    console.log(`[Orchestrator] 专业任务 → 建议派给 ${analysis.agent}`);
  } else {
    console.log(`[Orchestrator] 常规消息 → AMY 直接处理 (intent: ${analysis.intent})`);
  }

  return {
    ...analysis,
    sessionKey,
    timestamp: Date.now()
  };
}

module.exports = { dispatch, analyzeIntent, getCompletedTasksContext };
