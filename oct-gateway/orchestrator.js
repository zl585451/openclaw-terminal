const config = require('./config');
const taskQueue = require('./task_queue');
const worker = require('./worker');

// 后台任务触发词 → 工具映射（邮件规则放前面，优先于泛化的「查一下」）
const TASK_TOOL_MAP = {
  '查验证码': {
    toolName: 'email_reader',
    extractArgs: () => ({ vaultRef: '163_邮箱', action: 'find_code', count: 10 })
  },
  '查一下邮件': {
    toolName: 'email_reader',
    extractArgs: () => ({ vaultRef: '163_邮箱', action: 'get_latest', count: 5 })
  },
  '查邮件': {
    toolName: 'email_reader',
    extractArgs: (msg) => {
      const refMatch = msg.match(/((?:\d+|\w+)\s*邮箱|\w+mail)/i);
      const vaultRef = refMatch
        ? refMatch[0].trim().toLowerCase().replace(/\s+/g, '_')
        : '163_邮箱';
      let action = 'get_latest';
      if (msg.includes('验证码')) action = 'find_code';
      return { vaultRef, action, count: 5 };
    }
  },
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

function tryDispatchAsTask(userMessage, sessionKey, onToolEvent) {
  if (config.ENABLE_BACKGROUND_TASK_DISPATCH !== true) return null;

  const ASYNC_TRIGGERS = [
    '后台', '帮我查', '帮我搜', '查一下', '搜索一下',
    '顺便', '同时', '另外帮我', '后台执行', '读取文件',
    '查邮件', '查验证码', '查一下邮件', '有没有邮件'
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
        worker.dispatch(taskId, onToolEvent);
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

const CANVAS_TRIGGER_RULES = [
  {
    artifactType: 'echart',
    keywords: ['柱状图', '折线图', '散点图', '饼图', '雷达图', '数据图表', '可视化图表',
               '趋势图', '对比图', '分布图', '数据分析图', '图表展示', '数据可视化'],
    reason: '用户要求数据图表，使用 ECharts 渲染',
  },
  {
    artifactType: 'react-flow',
    keywords: [
      '架构图', '结构图', '模块关系', '依赖图', '节点图', '交互图', '结构关系图', '组件关系', '系统架构',
      '生成图', '画出结构', '详细结构', '内部结构', '组成结构', '子系统', '层级图', '层次图',
      '画一下', '画个图', '画出来', '可视化结构', '结构是什么', '结构分析',
    ],
    reason: '用户要求复杂结构图，使用 React Flow 渲染',
  },
  {
    artifactType: 'diagram',
    keywords: ['流程图', '时序图', '状态图', '关系图', '示意图', '画个图', '画图'],
    reason: '用户明确要求图示表达',
  },
  {
    artifactType: 'document',
    keywords: ['梳理方案', '整理成文档', '输出成文档', '做个方案', '写个提纲', '整理结构', '生成prd', 'PRD'],
    reason: '用户明确要求结构化文档',
  },
  {
    artifactType: 'ui-draft',
    keywords: ['页面草图', '界面草图', 'ui草图', '页面结构', '信息架构', '布局草图', '线框图'],
    reason: '用户明确要求界面或信息架构草图',
  },
  {
    artifactType: 'code',
    keywords: ['组件草稿', '代码草稿', '生成组件', '搭个组件'],
    reason: '用户明确要求代码型产物',
  },
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

function analyzeCanvasIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { shouldUseCanvas: false };
  }

  const msg = userMessage.trim();
  for (const pattern of DIRECT_PATTERNS) {
    if (pattern.test(msg)) {
      return { shouldUseCanvas: false };
    }
  }

  for (const rule of CANVAS_TRIGGER_RULES) {
    for (const keyword of rule.keywords) {
      if (msg.includes(keyword)) {
        return {
          shouldUseCanvas: true,
          artifactType: rule.artifactType,
          reason: rule.reason,
          matchedKeyword: keyword,
        };
      }
    }
  }

  return { shouldUseCanvas: false };
}

/**
 * 主入口：处理一条用户消息
 * 现阶段：只分析和记录，不实际切换 Agent
 * 未来：shouldDelegate=true 时路由到对应 Agent
 */
async function dispatch(userMessage, sessionKey, onToolEvent) {
  const analysis = analyzeIntent(userMessage);
  const canvasIntent = analyzeCanvasIntent(userMessage);

  // 默认禁用“后台派子任务”链路，避免主会话出现“已派出但无下文”。
  // 如需恢复，请显式开启 ENABLE_BACKGROUND_TASK_DISPATCH=true。
  const taskId = tryDispatchAsTask(userMessage, sessionKey, onToolEvent);

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

  if (canvasIntent.shouldUseCanvas) {
    console.log(`[Orchestrator] Canvas 建议触发 (${canvasIntent.artifactType}) via "${canvasIntent.matchedKeyword}"`);
  }

  return {
    ...analysis,
    canvasIntent,
    userMessage,
    sessionKey,
    timestamp: Date.now()
  };
}

module.exports = { dispatch, analyzeIntent, analyzeCanvasIntent, getCompletedTasksContext };
