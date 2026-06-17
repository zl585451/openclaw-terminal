const config = require('./config');
const taskQueue = require('./task_queue');
const worker = require('./worker');

// ── Agent 注册表（懒加载，避免循环 require） ──────────────────────────
let _agentRegistry = null;

function getAgentRegistry() {
  if (_agentRegistry) return _agentRegistry;
  try {
    _agentRegistry = {
      Coder:      require('./agents/coder'),
      Writer:     require('./agents/writer'),
      Researcher: require('./agents/researcher'),
    };
  } catch (e) {
    console.warn('[Orchestrator] Agent 注册表加载失败（agents/ 目录可能不完整）:', e.message);
    _agentRegistry = {};
  }
  return _agentRegistry;
}

let _agentRunner = null;

function getAgentRunner() {
  if (_agentRunner) return _agentRunner;
  try {
    _agentRunner = require('./agents/agent_runner');
  } catch (e) {
    console.warn('[Orchestrator] agent_runner 加载失败:', e.message);
    _agentRunner = null;
  }
  return _agentRunner;
}

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
    keywords: ['写代码', '帮我写代码', 'cursor提示词', 'bug', '报错', '怎么实现',
               '代码', '函数', '接口', '组件', 'python', 'javascript',
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
    keywords: [
      '调研', '整理资料', '帮我找', '搜集', '分析一下',
      '对比', '总结一下', '报告',
      // 自然语言搜索 + 整理类请求
      '帮我搜', '搜一下', '搜索一下', '查最新', '最新动态',
      '整理成', '整理要点', '整理成要点', '汇总', '新闻整理',
      'AI新闻', '整理一下', '归纳',
    ],
    description: '信息研究任务'
  }
];

// 简单对话判断（这些直接跳过分析，AMY 自己回复）
const DIRECT_PATTERNS = [
  /^(你好|hi|hello|在吗|早|晚安|累了|谢谢|好的|嗯|哦|明白|知道了)/i,
  /^.{0,5}$/, // 5字以内的极短消息（单字/感叹词），直接对话
];

// ── 情绪 / 倾诉信号优先（必须早于 INTENT_RULES） ──────────────────────
// 例：「这个 bug 把我搞崩溃了想放弃」既含 'bug' 又含情绪，应先安抚而非派给 Coder。
// 词表聚焦“倾诉自身状态”的表达（多带第一人称或程度副词），降低与任务请求的混淆。
const EMOTIONAL_TRIGGERS = [
  '郁闷', '心情不好', '心情差', '心情很糟', '心里堵', '心里难受', '心里不舒服',
  '好难受', '难受死', '想哭', '好想哭', '好累', '太累了', '累死了',
  '撑不住', '撑不下去', '扛不住', '快崩溃', '要崩溃', '搞崩溃', '我崩溃',
  '好烦', '烦死', '好焦虑', '焦虑死', '好委屈', '好孤独', '好沮丧', '好绝望',
  '好低落', '难过', '压力好大', '压力太大',
  '我不行', '我没用', '我好失败', '我很失败', '我太失败', '我好差劲', '我什么都做不好',
  '不想活', '活着没意思', '活着没意义', '想解脱',
  '我想聊聊', '陪我说说话', '陪我聊聊', '想找人说说', '安慰我', '抱抱我', '安慰一下',
];

// 明确的创作 / 任务请求 → 即使带情绪词也不抢，交给正常路由（避免“帮我写一篇关于焦虑的文章”被当成情绪）
const TASK_OVERRIDE_SIGNALS = [
  '帮我写', '写一篇', '写个', '写一个', '写段', '写代码', '帮我做个',
  '生成', '调研', '整理成', '搜一下', '搜索一下',
];

function detectEmotionalSupport(msg) {
  if (TASK_OVERRIDE_SIGNALS.some(t => msg.includes(t))) return false;
  return EMOTIONAL_TRIGGERS.some(t => msg.includes(t));
}

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

// ── LLM 语义路由（关键词未命中时的兜底） ─────────────────────────────

const LLM_ROUTER_PROMPT = `你是任务路由器。分析用户消息，严格输出一行 JSON，不加任何额外文字或代码块。

格式：{"intent":"<chat|code|research|write>","complexity":"<simple|complex>","agent":"<AMY|Coder|Researcher|Writer>","reason":"<10字以内>"}

判断规则：
- chat    → 打招呼/闲聊/简单问答，agent=AMY，complexity=simple
- code    → 写代码/调试/实现功能，agent=Coder，complexity=complex
- research→ 搜索/调研/新闻/分析/汇总/整理资料，agent=Researcher，complexity=complex
- write   → 写文章/文案/脚本/小红书，agent=Writer，complexity=complex
- simple  的非 chat 任务（如"解释一下 Python"）→ agent=AMY，complexity=simple

用户消息：`;

async function analyzeIntentWithLLM(userMessage) {
  try {
    // 优先走 OmniRoute（与主聊天同一通道），降级到原始 provider 配置
    let baseUrl, apiKey, model;
    try {
      const externalOmniRoute = require('./runtime/externalOmniRoute');
      const resolved = externalOmniRoute.resolveCapabilityTarget('default');
      if (resolved) {
        baseUrl = resolved.baseUrl;
        apiKey  = resolved.apiKey;
        model   = resolved.model;
      }
    } catch (_) {}

    if (!baseUrl) {
      const pc = config.getProviderConfig();
      baseUrl = pc.baseUrl;
      apiKey  = pc.apiKey;
      model   = pc.model;
    }

    if (!baseUrl || !apiKey) throw new Error('provider 未配置');

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    if (baseUrl.includes('generativelanguage.googleapis.com') || baseUrl.includes('aiplatform.googleapis.com')) {
      headers['x-goog-api-key'] = apiKey;
      delete headers['Authorization'];
    }

    let resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: LLM_ROUTER_PROMPT + userMessage }],
        stream: false,
        max_tokens: 80,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(5000),
    });

    // 主 provider 鉴权/格式错误时降级到 MiniMax（400: stream:false 不支持；401/403: 鉴权失败）
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      const minimaxKey = config.getEnvOrConfig?.('MINIMAX_API_KEY') || config.MINIMAX_API_KEY;
      if (minimaxKey) {
        resp = await fetch('https://api.minimaxi.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${minimaxKey}` },
          body: JSON.stringify({
            model: 'MiniMax-M2.5',
            messages: [{ role: 'user', content: LLM_ROUTER_PROMPT + userMessage }],
            stream: false,
            max_tokens: 600, // 留够思考链 + JSON 的空间
            temperature: 0,
          }),
          signal: AbortSignal.timeout(5000),
        });
      }
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data  = await resp.json();
    const raw   = (data.choices?.[0]?.message?.content || '').trim();
    // 去除 <think>...</think> 推理块（MiniMax/DeepSeek 思考模型会输出这个）
    const text  = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // 去除可能的 markdown fences
    const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
    const parsed = JSON.parse(clean);

    const AGENT_MAP = { AMY: null, Coder: 'Coder', Researcher: 'Researcher', Writer: 'Writer' };
    const agent        = AGENT_MAP[parsed.agent] ?? null;
    const shouldDelegate = parsed.complexity === 'complex' && agent !== null;

    console.log(`[Orchestrator] LLM 路由 → intent=${parsed.intent} complexity=${parsed.complexity} agent=${parsed.agent || 'AMY'} reason=${parsed.reason}`);

    return {
      intent:         parsed.intent   || 'general',
      agent:          agent           || 'AMY',
      shouldDelegate,
      complexity:     parsed.complexity,
      description:    parsed.reason   || 'LLM 路由',
      source:         'llm',
    };
  } catch (err) {
    console.warn('[Orchestrator] LLM 路由失败，降级到 AMY:', err.message);
    return { intent: 'general', agent: 'AMY', shouldDelegate: false, source: 'fallback' };
  }
}

// ── 意图分析主入口（关键词快速路径 → LLM 语义兜底） ──────────────────

/**
 * 分析用户消息意图
 * @returns {Promise<{ intent, agent, shouldDelegate, description, source }>}
 */
async function analyzeIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { intent: 'chat', agent: 'AMY', shouldDelegate: false, source: 'keyword' };
  }

  const msg = userMessage.trim();

  // 0. 情绪优先：检测到情绪低落 / 倾诉 / 主动召唤 → 直接归 AMY 做情感陪伴
  //    必须早于关键词匹配，避免「这个 bug 把我搞崩溃了想放弃」被误派给 Coder
  if (detectEmotionalSupport(msg)) {
    console.log('[Orchestrator] 情绪信号命中 → AMY 情感陪伴（不派发任务）');
    return { intent: 'chat', agent: 'AMY', shouldDelegate: false, source: 'emotion' };
  }

  // 1. 关键词快速路径（0ms，优先于短消息过滤）
  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      if (msg.includes(keyword)) {
        return {
          intent:        rule.intent,
          agent:         rule.agent,
          shouldDelegate: true,
          description:   rule.description,
          source:        'keyword',
        };
      }
    }
  }

  // 2. 明确的短对话模式 → 不走 LLM，直接回复
  for (const pattern of DIRECT_PATTERNS) {
    if (pattern.test(msg)) {
      return { intent: 'chat', agent: 'AMY', shouldDelegate: false, source: 'pattern' };
    }
  }

  // 3. 关键词未命中 → LLM 语义路由（~500ms）
  return analyzeIntentWithLLM(msg);
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
 * 将专职 Agent 的执行结果作为 agentResult 附加到 dispatch 返回值。
 * 由调用方（index.js / ai.js）决定如何把结果呈现给用户。
 *
 * @param {string} agentName  - 'Coder' | 'Writer' | 'Researcher'
 * @param {object} task       - { taskId, instruction, userContext, sessionKey }
 * @param {Function} onEvent  - WebSocket 事件推送回调
 * @returns {Promise<{ result: string, turnsUsed: number, tokensUsed: number } | null>}
 */
async function runDelegatedAgent(agentName, task, onEvent, onSegment, turnId) {
  const registry = getAgentRegistry();
  const runner = getAgentRunner();

  if (!runner) {
    console.warn('[Orchestrator] agent_runner 不可用，跳过 Agent 执行');
    return null;
  }

  const agent = registry[agentName];
  if (!agent) {
    console.warn(`[Orchestrator] Agent "${agentName}" 未在注册表中，跳过`);
    return null;
  }

  console.log(`[Orchestrator] → 路由到 ${agentName} Agent 执行`);
  try {
    const agentResult = await runner.runAgent({
      agent,
      task,
      onAgentEvent: onEvent,
      onSegment,
      turnId,
    });
    console.log(`[Orchestrator] ${agentName} 完成，用了 ${agentResult.turnsUsed} 轮`);
    return agentResult;
  } catch (err) {
    console.error(`[Orchestrator] ${agentName} 执行失败:`, err.message);
    return null;
  }
}

/**
 * 主入口：处理一条用户消息
 *
 * 返回值中 agentResult 字段：
 *   - null：未派发给专职 Agent（AMY 直接处理）
 *   - { result, turnsUsed, tokensUsed }：Agent 执行完成，调用方应将 result 作为回复内容注入
 */
async function dispatch(userMessage, sessionKey, onToolEvent, onSegment, turnId) {
  const analysis = await analyzeIntent(userMessage);
  const canvasIntent = analyzeCanvasIntent(userMessage);

  // 默认禁用”后台派子任务”链路，避免主会话出现”已派出但无下文”。
  // 如需恢复，请显式开启 ENABLE_BACKGROUND_TASK_DISPATCH=true。
  const taskId = tryDispatchAsTask(userMessage, sessionKey, onToolEvent);

  if (taskId) {
    console.log(`[Orchestrator] 已派发后台任务 ${taskId}`);
    analysis.backgroundTaskId = taskId;
    analysis.hasBackgroundTask = true;
  }

  // ── Agent 路由：shouldDelegate=true 时真正执行 ─────────────────────
  let agentResult = null;

  if (analysis.shouldDelegate && config.ENABLE_AGENT_DISPATCH !== false) {
    const delegateTaskId = `agent_${Date.now()}`;
    agentResult = await runDelegatedAgent(
      analysis.agent,
      {
        taskId:      delegateTaskId,
        instruction: userMessage,
        userContext: userMessage,
        sessionKey,
      },
      onToolEvent || (() => {}),
      onSegment,
      turnId
    );

    if (agentResult) {
      console.log(`[Orchestrator] ${analysis.agent} 执行完毕，结果长度: ${agentResult.result?.length || 0}`);
    } else {
      console.log(`[Orchestrator] ${analysis.agent} 执行失败，回退到 AMY 直接处理`);
      analysis.shouldDelegate = false; // 降级
    }
  } else if (analysis.shouldDelegate) {
    console.log(`[Orchestrator] 专业任务 → 建议派给 ${analysis.agent}（ENABLE_AGENT_DISPATCH=false，仅记录）`);
  } else {
    console.log(`[Orchestrator] 常规消息 → AMY 直接处理 (intent: ${analysis.intent})`);
  }

  if (canvasIntent.shouldUseCanvas) {
    console.log(`[Orchestrator] Canvas 建议触发 (${canvasIntent.artifactType}) via “${canvasIntent.matchedKeyword}”`);
  }

  return {
    ...analysis,
    canvasIntent,
    agentResult,  // null 或 { result, turnsUsed, tokensUsed }
    userMessage,
    sessionKey,
    timestamp: Date.now()
  };
}

module.exports = { dispatch, analyzeIntent, analyzeCanvasIntent, getCompletedTasksContext };
