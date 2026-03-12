export interface SocraticOption {
  id: string;
  label: string;
}

export interface SocraticRound {
  question: string;
  type: 'single' | 'multi';
  options: SocraticOption[];
}

export interface SocraticTemplate {
  id: string;
  name: string;
  icon: string;
  rounds: SocraticRound[];
}

/**
 * 5 种通用认知框架——与具体领域无关，适用于任何用户场景。
 * 这些是系统内部模式，不对用户暴露名称。
 */
export const SOCRATIC_TEMPLATES: SocraticTemplate[] = [
  {
    id: 'decision',
    name: '做一个决定',
    icon: '⊞',
    rounds: [
      {
        question: '在这件事上，你最看重什么？',
        type: 'single',
        options: [
          { id: 'speed',   label: '效率 — 越快越好' },
          { id: 'quality', label: '质量 — 宁慢勿差' },
          { id: 'risk',    label: '稳定 — 风险最小' },
          { id: 'growth',  label: '成长 — 有长期价值' },
        ],
      },
      {
        question: '让你还在犹豫的原因是？（可多选）',
        type: 'multi',
        options: [
          { id: 'info',    label: '信息不够，不确定哪个更好' },
          { id: 'cost',    label: '几个选项代价差不多' },
          { id: 'regret',  label: '担心选错了难以反悔' },
          { id: 'others',  label: '在意别人的看法' },
          { id: 'habit',   label: '惯性让我倾向某一边' },
        ],
      },
    ],
  },
  {
    id: 'priority',
    name: '排列优先级',
    icon: '◈',
    rounds: [
      {
        question: '你现在最想先完成什么？',
        type: 'single',
        options: [
          { id: 'deliver',  label: '把一件具体的事做完交出去' },
          { id: 'unblock',  label: '解除某个卡点，让后续能动起来' },
          { id: 'plan',     label: '制定清晰的下一步计划' },
          { id: 'reduce',   label: '减少待办，降低压力' },
        ],
      },
      {
        question: '排序时，哪些因素对你影响最大？（可多选）',
        type: 'multi',
        options: [
          { id: 'deadline', label: '有截止日期的任务' },
          { id: 'impact',   label: '会影响其他人或后续工作的事' },
          { id: 'quick',    label: '能快速完成的小任务' },
          { id: 'energy',   label: '当前状态最适合做的事' },
          { id: 'anxiety',  label: '拖着让我不安的事' },
        ],
      },
    ],
  },
  {
    id: 'stuck',
    name: '不知道从哪开始',
    icon: '▶',
    rounds: [
      {
        question: '你现在的状态更像哪一种？',
        type: 'single',
        options: [
          { id: 'blur',         label: '目标还很模糊，没想清楚' },
          { id: 'clear_stuck',  label: '目标清晰，但不知道第一步' },
          { id: 'lost',         label: '已经开始了，但感觉迷失了方向' },
          { id: 'too_much',     label: '要做的事太多，不知道先做哪个' },
        ],
      },
      {
        question: '是什么让你迟迟没有行动？（可多选）',
        type: 'multi',
        options: [
          { id: 'plan',     label: '没有清晰的计划' },
          { id: 'fear',     label: '担心做错或做得不够好' },
          { id: 'resource', label: '缺少所需的条件或资源' },
          { id: 'energy',   label: '状态或精力不对' },
          { id: 'meaning',  label: '不确定这件事值不值得做' },
        ],
      },
    ],
  },
  {
    id: 'confusion',
    name: '理清混乱的思路',
    icon: '◌',
    rounds: [
      {
        question: '混乱主要来自哪里？（可多选）',
        type: 'multi',
        options: [
          { id: 'goal',     label: '不清楚自己到底想要什么' },
          { id: 'conflict', label: '有几个互相矛盾的目标' },
          { id: 'overload', label: '脑子里同时装了太多东西' },
          { id: 'emotion',  label: '情绪让我很难冷静思考' },
          { id: 'external', label: '外部变化太快，跟不上节奏' },
        ],
      },
      {
        question: '你更希望先搞清楚哪个层面？',
        type: 'single',
        options: [
          { id: 'what', label: '"要做什么" — 目标和方向' },
          { id: 'how',  label: '"怎么做" — 方法和路径' },
          { id: 'why',  label: '"为什么做" — 动机和意义' },
          { id: 'when', label: '"什么时候做" — 节奏和时机' },
        ],
      },
    ],
  },
  {
    id: 'goal',
    name: '分解一个大目标',
    icon: '⊡',
    rounds: [
      {
        question: '你对这个目标目前的把握程度是？',
        type: 'single',
        options: [
          { id: 'clear',   label: '方向很清晰，但不知道如何拆解' },
          { id: 'vague',   label: '还比较模糊，需要先想清楚' },
          { id: 'complex', label: '太复杂，感觉无从下手' },
          { id: 'scared',  label: '目标很大，感到压力' },
        ],
      },
      {
        question: '在这件事上，你最希望得到什么帮助？（可多选）',
        type: 'multi',
        options: [
          { id: 'steps',     label: '可以立刻行动的具体步骤' },
          { id: 'milestone', label: '阶段性里程碑和验收标准' },
          { id: 'risk',      label: '提前识别可能遇到的阻碍' },
          { id: 'estimate',  label: '时间和资源的估算' },
          { id: 'mvp',       label: '找到最小可行路径' },
        ],
      },
    ],
  },
];

// ── THINK_MODE 标记协议 ────────────────────────────────────────
// AI 在回复末尾加 [THINK_MODE:xxx] → 前端自动弹出对应思维模式面板

/** 从 AI 回复中提取 [THINK_MODE:xxx] 标记，返回 template id 或 null */
export function detectThinkModeMarker(content: string): string | null {
  if (!content) return null;
  const m = content.match(/\[THINK_MODE:(\w+)\]/i);
  return m ? m[1].toLowerCase() : null;
}

/** 去除 AI 回复中的 [THINK_MODE:xxx] 标记，不向用户展示 */
export function stripThinkModeMarker(content: string): string {
  return content.replace(/\n?\[THINK_MODE:\w+\]/gi, '').trim();
}

/**
 * 解析 AI 自然生成的多段 checkbox 选择题（两组及以上）→ SocraticRound[]
 * 单段 checkbox 仍走原有 OptionBox 逻辑，不受影响。
 */
export function parseSocraticSections(content: string): SocraticRound[] | null {
  if (!content) return null;
  const lines = content.split('\n');
  const rounds: SocraticRound[] = [];
  let currentQuestion = '';
  let currentOptions: SocraticOption[] = [];

  const checkboxRx = /^[\s]*\[\s*(?:[✓✗xX]|\s)\s*\]\s*(.+)$/;

  for (const line of lines) {
    const cbMatch = line.match(checkboxRx);
    if (cbMatch) {
      const label = cbMatch[1].trim();
      // 跳过 "其他：___" 这种占位行
      if (label && label.length < 120 && !/_+/.test(label)) {
        currentOptions.push({ id: String(currentOptions.length + 1), label });
      }
    } else {
      // 遇到非 checkbox 行时，如果已经积累了足够的选项，则保存为一轮
      if (currentOptions.length >= 2 && currentQuestion) {
        rounds.push({ question: currentQuestion, type: 'multi', options: currentOptions });
        currentOptions = [];
        currentQuestion = '';
      }
      const trimmed = line.trim();
      // 过滤掉分隔线或空行，保留最新的有效问题句
      if (trimmed && !/^[-─━=*]+$/.test(trimmed)) {
        currentQuestion = trimmed;
      }
    }
  }

  // 最后一组
  if (currentOptions.length >= 2 && currentQuestion) {
    rounds.push({ question: currentQuestion, type: 'multi', options: currentOptions });
  }

  return rounds.length >= 2 ? rounds : null;
}

/**
 * 为动态 rounds（AI 自然生成）格式化结果文本。
 * 自动清洗问题前缀（先问/再问/第N问 等），输出自然语言。
 */
export function formatCustomResult(rounds: SocraticRound[], answers: string[]): string {
  const parts: string[] = [];
  rounds.forEach((round, i) => {
    if (!answers[i]) return;
    const q = round.question
      .replace(/^(先问|再问|第[一二三四五\d]+问|最后问)[^：:]*[：:]\s*/u, '')
      .replace(/[？?]$/, '')
      .trim();
    if (q) parts.push(`${q}：${answers[i]}`);
  });
  if (parts.length === 0) return '请给我一些针对性的建议。';
  return parts.join('；') + '。\n\n请基于以上给我针对性的建议。';
}

// ── 触发词表（分析用户消息 + AI 回复的联合上下文）──────────────
const TRIGGER_MAP: Record<string, string[]> = {
  decision:  ['还是', '选择', '决定', '纠结', '该选', '哪个好', '哪种', '要不要', '换不换', '是否'],
  priority:  ['优先', '先做哪', '排序', '顺序', '安排', '规划', '计划', '先后'],
  stuck:     ['从哪开始', '怎么开始', '不知道怎么', '卡住', '入手', '起步', '第一步', '没有头绪'],
  confusion: ['有点乱', '混乱', '搞不清', '理清', '梳理', '脑子里', '太多', '迷茫', '乱了'],
  goal:      ['目标', '拆解', '分解', '大方向', '长期', '路线图', '规划'],
};

/**
 * 根据上下文文本推断最匹配的模板 ID。
 * contextText 应包含最近几轮对话（用户 + AI）。
 */
export function detectTemplate(contextText: string): string | null {
  if (!contextText) return null;
  const lower = contextText.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [id, triggers] of Object.entries(TRIGGER_MAP)) {
    scores[id] = triggers.filter((t) => lower.includes(t)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

/**
 * 将用户的选择结果格式化为自然语言——看起来就像用户自己写的，
 * 不暴露任何系统模式名称。
 */
export function formatSocraticResult(
  template: SocraticTemplate,
  answers: string[]
): string {
  const parts: string[] = [];
  template.rounds.forEach((round, i) => {
    const answer = answers[i];
    if (!answer) return;
    // 把问题转成陈述句前缀，让输出读起来像用户在描述自己的情况
    parts.push(`我${round.question.replace(/？$/, '')}：${answer}`);
  });
  if (parts.length === 0) return '请给我一些建议。';
  return parts.join('；') + '。\n\n请基于以上给我具体建议。';
}
