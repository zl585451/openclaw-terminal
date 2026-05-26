const config = require('./config');
const toolLoader = require('./tool_loader');
const skillAdapter = require('./skill_adapter');
const memory = require('./memory');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const log = createLogger('ai');
const ProviderRouter = require('./runtime/providerRouter');
const ToolLoop = require('./runtime/toolLoop');
const {
  validateAndFixMessages,
  truncateHistory,
  getContextUsageRatio,
} = require('./runtime/messagePolicy');
const {
  fetchWithRetry,
  buildChatHeaders,
  classifyProbeFailure,
} = require('./runtime/llmTransport');
const { createPseudoToolCompat } = require('./runtime/pseudoToolCompat');
const {
  probeModelToolsSupport,
  enforceExecutionContract,
  injectClarifyCapabilityMessage,
  canAttemptTools,
  normalizeMessagesForProvider,
} = require('./runtime/toolCapabilityPolicy');
const {
  isGoogleNativeMode,
  generateNativeChat,
} = require('./services/googleNative');

// ═══════════════════════════════════════════════════════════════
// AI 上下文截断优化
// ═══════════════════════════════════════════════════════════════
const MAX_TOOL_ROUNDS = 8;
const MAX_IDENTICAL_TOOL_SIGNATURES = 2;
const providerRouter = new ProviderRouter({ config });
const pseudoToolCompat = createPseudoToolCompat({
  toolLoader,
  logger: log,
});
const {
  buildToolSignature,
  extractAllPseudoToolCalls,
  hasPseudoToolResidue,
  stripPseudoToolResidue,
} = pseudoToolCompat;
const toolLoop = new ToolLoop({
  toolLoader,
  log,
  streamChat: (options) => streamChat(options),
  buildToolSignature,
  maxToolRounds: MAX_TOOL_ROUNDS,
  maxIdenticalToolSignatures: MAX_IDENTICAL_TOOL_SIGNATURES,
});
function injectGoogleDiagramGuard(messages) {
  const list = Array.isArray(messages) ? [...messages] : [];
  if (list.length === 0) return list;
  const guard = [
    '【Google 专用图表护栏】',
    '当你需要调用 canvas 生成图（artifactType=diagram）时：',
    '1) 优先输出 JSON diagram spec（diagramType/nodes/edges/direction），不要直接输出 Mermaid DSL。',
    '2) 若必须输出 Mermaid，边标签必须用 A -->|标签| B，禁止 A — 标签 —> B 这种写法。',
    '3) 禁止在 Mermaid 里使用全角箭头/Unicode 箭头（如 →、—>）。',
    '4) subgraph 块必须严格成对闭合：subgraph ... / end。',
  ].join('\n');

  const idx = list.findIndex((m) => m && m.role === 'system' && typeof m.content === 'string');
  if (idx >= 0) {
    list[idx] = { ...list[idx], content: `${String(list[idx].content || '').trim()}\n\n${guard}` };
    return list;
  }
  return [{ role: 'system', content: guard }, ...list];
}

function readMemoryJson(result) {
  const content = result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function loadSummariesForBoot() {
  const summarizer = config.memory?.summarizer;
  if (!summarizer?.enabled) return '';
  const bootInject = summarizer.bootInject || {};
  const lines = [];

  try {
    const now = new Date();
    for (let i = 0; i < (bootInject.monthlyCount ?? 1); i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const monthStr = d.toISOString().slice(0, 7);
      const result = await memory.readMemory(`core://logs/summary/monthly/${monthStr}`, { treat404AsDebug: true });
      if (!result.ok) continue;
      const s = readMemoryJson(result);
      if (!s) continue;
      lines.push(`## ${monthStr} 月度回顾`);
      lines.push(`主线：${s.month_narrative || '(空)'}`);
      if (s.major_achievements?.length) {
        lines.push('主要成就：');
        s.major_achievements.forEach((a) => lines.push(`- ${a.title || a}`));
      }
      if (s.carryovers?.length) lines.push(`跨月延续事项：${s.carryovers.join('；')}`);
      lines.push('');
    }
  } catch {}

  try {
    const now = new Date();
    const { getIsoWeek } = require('./summarizer/weekly');
    for (let i = 0; i < (bootInject.weeklyCount ?? 1); i += 1) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      const weekStr = getIsoWeek(d);
      const result = await memory.readMemory(`core://logs/summary/weekly/${weekStr}`, { treat404AsDebug: true });
      if (!result.ok) continue;
      const s = readMemoryJson(result);
      if (!s) continue;
      lines.push(`## ${weekStr} 周回顾`);
      lines.push(`主题：${s.week_theme || '(空)'}`);
      if (s.key_decisions?.length) {
        lines.push('关键决策：');
        s.key_decisions.forEach((d) => lines.push(`- [${d.date || ''}] ${d.decision || d}`));
      }
      if (s.unresolved?.length) lines.push(`未解决：${s.unresolved.join('；')}`);
      lines.push('');
    }
  } catch {}

  try {
    const now = new Date();
    for (let i = 1; i <= (bootInject.dailyCount ?? 3); i += 1) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const result = await memory.readMemory(`core://logs/summary/daily/${dateStr}`, { treat404AsDebug: true });
      if (!result.ok) continue;
      const s = readMemoryJson(result);
      if (!s) continue;
      lines.push(`## ${dateStr} 日摘要`);
      if (s.topics?.length) {
        s.topics.forEach((t) => lines.push(`- ${t.title || '话题'}：${t.summary || ''}`));
      }
      if (s.decisions?.length) lines.push(`今日决定：${s.decisions.join('；')}`);
      if (s.completed?.length) lines.push(`已完成：${s.completed.join('；')}`);
      if (s.open_questions?.length) lines.push(`未解决：${s.open_questions.join('；')}`);
      lines.push('');
    }
  } catch {}

  if (lines.length === 0) return '';
  const text = [
    '# 历史回忆（三级摘要）',
    '',
    '以下是少爷和你（AMY）过去的对话回顾。当少爷提到相关话题时，你应该表现出记得这些事。',
    '',
    ...lines,
  ].join('\n');
  return text.length > 8000 ? `${text.slice(0, 8000)}\n\n---\n> 历史回忆已截断到 8000 字符` : text;
}

function getMiniMaxTemperature() {
  const rawValue = config.getEnvOrConfig('MINIMAX_TEMPERATURE');
  if (rawValue === '' || rawValue === null || rawValue === undefined) return 0.7;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    log.warn('Invalid MINIMAX_TEMPERATURE, fallback to default 0.7', { rawValue });
    return 0.7;
  }
  return value;
}

function parseCustomTemperature() {
  const rawValue = config.getEnvOrConfig('CUSTOM_TEMPERATURE');
  if (rawValue === '' || rawValue === null || rawValue === undefined) return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    log.warn('Invalid CUSTOM_TEMPERATURE, ignored', { rawValue });
    return null;
  }
  return value;
}

function resolveTemperatureForRequest({ provider, model }) {
  if (provider?.id === 'minimax') return getMiniMaxTemperature();
  if (provider?.id === 'moonshot') return null;
  if (provider?.id === 'custom') {
    const customTemperature = parseCustomTemperature();
    if (customTemperature !== null) return customTemperature;
    const family = config.detectModelFamily(model);
    if (family === 'kimi') return null;
    return 0.7;
  }
  return 0.7;
}

async function loadSystemPrompt(promptsDir) {
  const memoryAlive = await memory.isAlive();

  if (memoryAlive) {
    const coreUris = [
      'core://agent/identity',
      'core://my_user/profile',
      'core://agent/my_user',
      'core://my_user/communication',
      'core://agent/rules/conversation_style',
      'core://agent/rules/output_format',
      'core://agent/rules/dispatch',
      'core://agent/rules/emotion',
    ];

    let bootMemory = await memory.loadBootMemory(coreUris);
    log.debug('bootMemory loaded', {
      len: bootMemory?.length || 0,
      preview: (bootMemory || '').slice(0, 100),
    });
    // 加载追问偏好
    try {
      const clarificationMemory = require('./clarification_memory');
      const prefsBlock = await clarificationMemory.loadPreferencesForBoot();
      if (prefsBlock) bootMemory = bootMemory + prefsBlock;
    } catch (e) {
      log.warn('clarification prefs load failed', { error: e?.message || String(e) });
    }

    const summariesSection = await loadSummariesForBoot();
    if (summariesSection) {
      bootMemory = bootMemory
        ? `${bootMemory}\n\n---\n\n${summariesSection}`
        : summariesSection;
      log.info('summary memories loaded for boot', { len: summariesSection.length });
    }

    if (bootMemory && bootMemory.length > 100) {
      log.info('System prompt loaded from memory backend', {
        backend: 'memory_v2',
      });

      const memoryMdPath = path.join(promptsDir, 'MEMORY.md');
      const memoryMdContent = `# MEMORY.md - 长期记忆（自动同步自 Memory v2）

> 最后同步时间：${new Date().toLocaleString('zh-CN')}
> 此文件由 OCT Gateway 启动时自动生成，请勿手动编辑核心记忆部分

---

${bootMemory}
`;
      try {
        fs.writeFileSync(memoryMdPath, memoryMdContent, 'utf-8');
        log.info('MEMORY.md synced', { path: memoryMdPath });
      } catch (e) {
        log.warn('MEMORY.md sync failed', { path: memoryMdPath, error: e?.message || String(e) });
      }

      // 记忆注入配额：最多 4000 字符（约 2000 tokens）
      const MEMORY_INJECT_LIMIT = 4000;
      if (bootMemory && bootMemory.length > MEMORY_INJECT_LIMIT) {
        log.warn('[AI] 记忆内容超过配额，截断中', { original: bootMemory.length, limit: MEMORY_INJECT_LIMIT });
        bootMemory = bootMemory.slice(0, MEMORY_INJECT_LIMIT)
          + '\n\n---\n> ⚠️ 记忆内容已截断（超过 ' + MEMORY_INJECT_LIMIT + ' 字符限制）';
      }

      return buildSystemPrompt(bootMemory, 'memory_v2', promptsDir);
    }
  }

  log.warn('memory backend has no boot memory, fallback to local prompt files', {
    backend: 'memory_v2',
  });
  const files = [
    'SOUL.md',
    'AGENTS.md',
    'USER.md',
    'OCT_PROTOCOL.md',
    'CLARIFICATION_PROTOCOL.md',
    'adaptive-questioning-system.md',
    'MEMORY.md',
  ];
  const parts = [];
  for (const f of files) {
    const p = path.join(promptsDir, f);
    if (fs.existsSync(p)) {
      try {
        parts.push(fs.readFileSync(p, 'utf-8'));
      } catch {}
    }
  }
  return buildSystemPrompt(parts.join('\n\n---\n\n'), 'local', promptsDir);
}

function readTextIfExists(p) {
  try {
    if (!p || !fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function materializePromptTemplate(text) {
  const aiName = config.persona?.aiName || 'OpenClaw';
  const userName = config.persona?.userName || '用户';
  return String(text || '')
    .replace(/\{\{AI_NAME\}\}/g, aiName)
    .replace(/\{\{USER_NAME\}\}/g, userName)
    .replace(/\{\{TIMEZONE\}\}/g, '上海 +8')
    .replace(/\{\{MBTI\}\}/g, 'INFP');
}

function clampPromptBlock(title, text, maxChars) {
  const raw = materializePromptTemplate(text).trim();
  if (!raw) return '';
  const clamped = raw.length > maxChars ? raw.slice(0, maxChars) + '\n\n（已截断）' : raw;
  return `## ${title}\n\n${clamped}\n`;
}

function buildIdentityContract() {
  const aiName = config.persona?.aiName || 'OpenClaw';
  const userName = config.persona?.userName || '用户';
  const style = config.persona?.style || 'warm';
  const styleGuide = {
    neutral: '语气保持克制、清晰、专业，不冷淡，但不过度拟人或过度热情。',
    warm: '语气温暖、可靠、有人味，在保持真实的前提下主动补充有价值的建议。',
    companion: '语气更有陪伴感和主动性，可以更自然地表达支持与关心，但仍然不能虚构事实或完成状态。',
  }[style] || '语气温暖、可靠、有人味，在保持真实的前提下主动补充有价值的建议。';
  return `## 核心身份与交流契约（最高优先级）

- 你当前对用户呈现的名字是 ${aiName}，不要把自己泛化为“一个 AI”“一个助手”或“一个语言模型”。
- 当用户问“你是谁”“你叫什么”“你是做什么的”时，先明确回答：你是 ${aiName}，是 OpenClaw Terminal 里的智能助手与协作伙伴。
- 自称优先使用“我”或“${aiName}”，不要只说“我是 AI”。
- 当前用户偏好的称呼是“${userName}”，如无更具体的新设定，优先使用这个称呼。
- 你必须绝对诚实：没执行的事不能说已执行，没写入记忆的事不能说已写入，不确定的事要明确说不确定。
- 诚实不等于冷淡。${styleGuide}
- 除非用户明确要求简短，否则回答不要只给最短结论；应兼顾结论、原因、下一步建议。
- 【严禁 emoji】回复正文、解释文字、总结中不得使用任何 emoji（😊📊🎯✅ 等）。唯一允许的场景是用户自己先使用了 emoji 并明确要求你也用。
`;
}

function buildSystemPrompt(memoryContent, source, promptsDir) {
  const identityContract = buildIdentityContract();
  const soul = clampPromptBlock(
    '人格与风格规范（注入）',
    readTextIfExists(promptsDir ? path.join(promptsDir, 'SOUL.md') : ''),
    5000
  );
  const agents = clampPromptBlock(
    '任务与交互规范（注入）',
    readTextIfExists(promptsDir ? path.join(promptsDir, 'AGENTS.md') : ''),
    5000
  );
  const clarification = clampPromptBlock(
    '自适应澄清协议（注入）',
    readTextIfExists(promptsDir ? path.join(promptsDir, 'CLARIFICATION_PROTOCOL.md') : ''),
    8000
  );
  const adaptiveSystem = clampPromptBlock(
    '自适应澄清·核心逻辑（注入）',
    readTextIfExists(promptsDir ? path.join(promptsDir, 'adaptive-questioning-system.md') : ''),
    8000
  );
  const diagramProtocol = clampPromptBlock(
    '结构图输出协议（注入）',
    readTextIfExists(promptsDir ? path.join(promptsDir, 'DIAGRAM_PROTOCOL.md') : ''),
    2000
  );

  const memoryInstructions = `
## 记忆系统（Memory v2）

记忆已从 Memory v2 本地文件加载。

记忆系统有两条链路：
- 自动链路：Gateway 只会在高置信时注入少量整轮历史回忆；这些内容只是候选上下文，必须和用户当前话题直接相关才可使用
- 显式链路：当你需要主动回忆、核对或写入记忆时，应直接调用 memory_search / memory_read / memory_vector_search / memory_write 工具，不要只在正文里口头描述“我去查记忆”

**写入记忆**（遇到以下情况自动触发）：
- 用户说「记住」「记下来」「停车」→ 立即写入
- 发现重要的工作习惯/偏好/决策 → 静默写入
- 用户纠正我 → 写入 core://agent/corrections

写入格式：
URI 路径：core://my_user/[分类]/[具体节点]
内容：简洁的结构化文本或 JSON

**读取记忆**（遇到以下情况触发）：
- 用户问「你还记得」「之前说的」→ 读取相关节点
- /memory read core://xxx → 读取指定节点

**搜索记忆**：
- /memory search 关键词 → 搜索相关记忆

**显式工具使用规则**：
- 当用户问“你还记得吗 / 之前说过什么 / 上次那个方案 / 我们前面怎么定的”时，优先先用 memory_search 搜关键词，不要直接猜
- memory_search 命中后，如需核对原文或细节，再用 memory_read 读取最相关的 1-2 个节点
- 当用户问的是“以前关于这个主题聊过哪些内容 / 你自己查一下历史相关数据”，或者只记得大概时间/大概内容/零散线索时，可优先用 memory_vector_search 做语义检索
- memory_vector_search 返回的是历史候选，不是事实证明；低置信或文本候选必须先说明“不一定就是那条”，再结合用户确认继续
- 当用户明确要求“记住这件事 / 以后按这个来 / 把这个偏好记下来”时，可显式使用 memory_write
- 不要假设 Gateway 会替你完成所有显式记忆查询；需要确认时应主动调记忆工具
- 不要先拍脑袋回答，再补查记忆；涉及“是否记得 / 之前怎么说的”时，优先查再答

**不要做的事**：
- 不要频繁读取记忆（每次对话最多 3 次读取操作）
- 不要在一次回复里写入超过 2 个记忆节点
- 不要读取任务看板节点（前端组件会自动处理）

---

## 🔧 工具（AI 可以使用）

  **搜索工具**：
  - web_search 工具 — 搜索互联网（遇到需要最新信息时使用）
  - web_fetch 工具 — 读取指定网页
  
  搜索使用原则：
  - 需要最新信息、网页资料、产品/新闻/文档时，优先使用 web_search
  - 如果 web_search 返回结果较少、摘要过短或不够支撑回答，不要立刻放弃；应继续对前 1-2 个高相关结果使用 web_fetch 补充正文信息
  - 回答时尽量说明最终使用的是哪类来源（搜索摘要 / 网页正文）
  - 不要只拿到 1 次搜索的短摘要就结束；当问题明显需要更完整资料时，应继续补抓网页内容

  **文件工具**（谨慎使用，执行前说明意图）：
  - read_file 工具 — 读取文件
  - write_file 工具 — 写入文件
- exec_command 工具 — 执行命令

  文件/命令使用规则：
  - 当前运行环境以 Windows 为主，优先使用项目相对路径，例如 oct-gateway/index.js、src/ui/chat/MessageList.tsx
  - 查代码时优先使用 read_file，不要先尝试猜测本机绝对路径
  - 只有在 read_file 无法满足时才使用 exec_command
  - 在 Windows 环境中不要优先使用 ls、grep、head、find ... |、/mnt/...、2>/dev/null 这类 Unix/Linux 命令风格
  - 如果需要目录信息，优先使用 Windows 友好的命令或直接读取明确文件；不要连续尝试多种路径风格
  - 当命令执行失败时，不要反复换壳层或路径风格盲试超过 2 次；应改用 read_file 或直接基于已知文件回答

**Canvas 工具**：
- canvas 工具 — 在 Canvas 工作区创建或更新结构化成果物
- 适合场景：方案/提纲/PRD、流程图/架构图/时序图、页面草图、代码草稿
- 使用原则：先 chat 一句话说明，再使用 canvas 工具；更新已有文档用 update 不用 create；简单问答不滥用 canvas

【图表输出规范】

一、路由决策（顺序判断，命中即止）
  ① 结构/架构/组成/层次/模块/依赖/组件关系 → 完整结构图（系统内部走 Canvas 结构图协议）
  ② 流程/步骤/链路/事件推进/时序/状态机 → 线性且≤5节点走 chat 小图，否则走 Canvas 完整图
  ③ 柱状图/折线图/饼图/雷达/数据可视化 → Canvas 图表
  ④ 占比(≤6项) → chat 小图；仅单根树、≤6节点、无跨层关系的轻量父子层级 → chat 小图；其余层级关系仍走完整结构图
  ⑤ 对比/参数清单/维度>3 → Markdown 表格
  ⑥ 用户只说“画图/做图/整理成图”但类型不明 → 先追问要流程、结构、数据图还是文档，不猜
  ⑦ 均未命中 → 不画图，正文回答
  补充规则：
  · 用户提的是结果需求，不是底层工具；除非用户明确要求导出源码/指定格式，否则不要在正文主动提 Mermaid/react-flow/echart
  · 用户明确要求表格/纯文字/文档时，优先尊重结果形式，不强行出图
  · 用户明确要求“给我 Mermaid 源码”或“输出 JSON 图数据”时，才暴露对应格式
  chat 区条件（全部满足）：flowchart/pie/hierarchy + 节点≤6 + 边≤5 + 方向TD + 信息密度低。超出 → Canvas
  禁止 chat 和 Canvas 重复输出同一张图

二、结构图 → 执行【结构图输出协议】（见注入的 DIAGRAM_PROTOCOL）
  这是 react-flow 专用协议，包含硬约束（≤12节点、≤节点×1.3边、≤5组）和合并公式。

三、Mermaid 规则
  · chat 区 flowchart 方向必须 TD，节点标签 ≤ 8 字符，无 emoji 无 \\n
  · 严禁 style/classDef 颜色覆盖（OCT 主题系统管颜色）；classDef 仅可改形状
  · 严禁实验性图类型：sankey/xychart/bar(独立)/venn/kanban/architecture/radar/treemap/ishikawa/treeview/zenuml/block/packet
  · 柱状/折线/散点 → 必须用 echart，不用 Mermaid
  · 单次回复最多 1 个聊天区小图；用户明确要求对比时最多 2 个
  · 不画的图说”要继续看吗”，不写”已省略”
  · 线路图/roadmap → canvas LR flowchart，3-4 阶段，宽高比 ~1.5:1
  · Mermaid 语法必须合法：禁止空标签节点如 A(())；标签内禁止 \\n
  · chat 区 diagram content 优先用 JSON 格式（diagramType+nodes+edges），系统自动转 Mermaid
    flowchart: {“diagramType”:”flowchart”,”title”:”标题”,”direction”:”TD”,”nodes”:[{“id”:”a”,”label”:”步骤”}],”edges”:[{“from”:”a”,”to”:”b”}]}
    pie: {“diagramType”:”pie”,”title”:”标题”,”data”:[{“label”:”A”,”value”:45}]}
    hierarchy: {“diagramType”:”hierarchy”,”title”:”标题”,”items”:[{“id”:”root”,”label”:”主节点”},{“id”:”c”,”label”:”子节点”,”parentId”:”root”}]}

四、ECharts 规则
  · content = {“title”:”图表标题”,”option”:{...}}，纯 JSON，不包 Markdown 代码块
  · 不设 color/backgroundColor/textStyle（主题注入）
  · legend/tooltip/grid 必须是对象，不能是字符串
    ✗ {“legend”:”right”} ✓ {“legend”:{“right”:”5%”}}
  · pie/radar 无 xAxis/yAxis；所有 series 要有 name
  · 可用 series.type：bar/line/pie/scatter/radar/heatmap/treemap/funnel/gauge

五、通用禁令
  · 回复正文和 explanation 严禁 emoji
  · 图表之外只补必要短说明，不散文重复图中内容
  · 说明文字放 explanation 或 chat，不放进 diagram content
  · code block 只用于代码，不用于关系/结构示意

---

## 🏢 工作模式分工

AI · Cursor · Claude 三角协作：

**AI 直接处理**：
- 日常问答、情绪支持、信息解释
- 记忆读写管理
- 生成 Cursor 提示词
- 整理 Claude 咨询提示词

**遇到代码/文件修改 → 生成 Cursor 提示词**：
格式：
【背景】[项目和上下文，50字内]
【任务】[要做什么，一句话]
【文件】[涉及的文件路径]
【要求】[具体要求和约束]
【注意】[已知的坑或限制]

**遇到架构/设计/复杂bug → 建议咨询 Claude**：
说：「这个涉及[原因]，建议咨询 Claude」
然后输出：
【背景】OCT 项目，[简短背景]
【问题】[核心问题一句话]
【已知】[已尝试的方案]
【期望】[想要的结果]
`;
  let prompt = [
    identityContract,
    '\n\n---\n\n',
    soul ? soul + '\n\n---\n\n' : '',
    agents ? agents + '\n\n---\n\n' : '',
    memoryContent,
    '\n\n---\n\n',
    clarification ? clarification + '\n\n---\n\n' : '',
    adaptiveSystem ? adaptiveSystem + '\n\n---\n\n' : '',
    diagramProtocol ? diagramProtocol + '\n\n---\n\n' : '',
    memoryInstructions,
  ].join('');

  // 注入 OpenClaw 兼容技能列表
  const skills = skillAdapter.loadSkills();
  if (skills.length > 0) {
    prompt += skillAdapter.formatSkillsForPrompt(skills);
  }

  return prompt;
}

function mergePlainObject(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergePlainObject(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function applyToolCallDelta(existing, delta) {
  const next = existing || { id: '', type: 'function', function: { name: '', arguments: '' } };
  if (delta.id) next.id = delta.id;
  if (delta.type) next.type = delta.type;
  if (!next.function) next.function = { name: '', arguments: '' };
  if (delta.function?.name) next.function.name += delta.function.name;
  if (delta.function?.arguments) next.function.arguments += delta.function.arguments;
  if (delta.extra_content) {
    next.extra_content = mergePlainObject(next.extra_content, delta.extra_content);
  }
  return next;
}

function isProtocolOrRateLimitError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '');
  return status === 429
    || /thought_signature/i.test(message)
    || /reasoning_content/i.test(message)
    || /thinking mode/i.test(message)
    || /function call .* missing/i.test(message);
}

function shouldForceFinalFromToolResults(providerId, preserveToolChain, toolRound) {
  return providerId === 'google' && preserveToolChain && Number(toolRound) >= 1;
}

function buildToolResultFallbackReply(messages, error) {
  const toolMessages = Array.isArray(messages)
    ? messages.filter((message) => message?.role === 'tool' && String(message.content || '').trim())
    : [];
  if (toolMessages.length === 0) return '';

  const snippets = toolMessages.slice(-3).map((message, index) => {
    const raw = String(message.content || '').replace(/\s+/g, ' ').trim();
    const text = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
    return `${index + 1}. ${text}`;
  }).join('\n\n');

  return [
    '⚠️ Gemini 已完成工具检索，但在最终续写时触发 Vertex 429（资源耗尽 / 配额限制），本轮没有继续跨模型 fallback。',
    '',
    '已拿到的工具结果摘要如下，你可以稍后发送“基于上面的结果继续总结”继续：',
    '',
    snippets,
    '',
    `原始错误：${String(error?.message || error || '').slice(0, 240)}`,
  ].join('\n');
}

function resolveStreamErrorStatus(err) {
  if (!err) return 200;
  if (typeof err.status === 'number') return err.status;

  const msg = String(err.message || '');
  const match = msg.match(/(?:HTTP|Error|Status|API Error)\s*(\d{3})/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  if (err.name === 'LlmClientTimeoutError' || msg.includes('timeout') || msg.includes('超时')) {
    return 408;
  }

  return 500;
}

function resolveStreamErrorType(err) {
  if (!err) return null;
  if (err.name && err.name !== 'Error') return err.name;

  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('超时') || err.code === 'ETIMEDOUT') {
    return 'TimeoutError';
  }
  if (msg.includes('fetch failed') || msg.includes('network error') || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return 'NetworkError';
  }
  if (msg.includes('socket') || msg.includes('connection') || msg.includes('hang up') || err.code === 'EPIPE') {
    return 'ConnectionError';
  }

  if (typeof err.status === 'number' && err.status >= 400) {
    return 'ApiError';
  }
  if (msg.includes('api error') || msg.includes('http ')) {
    return 'ApiError';
  }

  return err.code || 'StreamError';
}

function inferDefaultCapability(messages) {
  return 'default';
}

function sameResolvedRoute(a, b) {
  if (!a || !b) return false;
  return String(a.providerId || '') === String(b.providerId || '')
    && String(a.baseUrl || '').replace(/\/$/, '') === String(b.baseUrl || '').replace(/\/$/, '')
    && String(a.model || '') === String(b.model || '')
    && String(a.apiKey || '') === String(b.apiKey || '');
}

function prependExternalCandidate(activeCandidates, extResolved) {
  if (!extResolved) {
    return Array.isArray(activeCandidates) ? activeCandidates : [];
  }
  const list = Array.isArray(activeCandidates) ? activeCandidates : [];
  const deduped = list.filter((candidate) => !sameResolvedRoute(candidate, extResolved));
  return [extResolved, ...deduped];
}

function buildExternalResolvedCandidate(extResolved) {
  if (!extResolved) return null;
  return {
    provider: { id: extResolved.providerId, name: 'OmniRoute' },
    apiKey: extResolved.apiKey,
    baseUrl: extResolved.baseUrl,
    model: extResolved.model,
    caps: config.getModelCaps(extResolved.model),
    fallback: {
      canFallbackToDeepseek: false,
      canFallbackToBailian: false,
    },
  };
}

function resolveLocalProviderCandidate() {
  try {
    const resolved = providerRouter.resolve();
    if (!resolved || !resolved.baseUrl || !resolved.apiKey || !resolved.model) {
      return null;
    }
    return resolved;
  } catch (err) {
    log.warn('local provider resolve error', { error: err?.message || String(err) });
    return null;
  }
}

function buildNotConfiguredError(externalEnabled) {
  return new Error(
    externalEnabled
      ? 'LLM_NOT_CONFIGURED: 外部 OmniRoute 已启用，但 Base URL / API Key / Model 配置不完整。请在设置面板补齐，或切回本地兼容模式。'
      : 'LLM_NOT_CONFIGURED: 本地兼容模式未配置完整。请在设置面板选择服务商、模型并填写 API Key。'
  );
}

async function streamChat(options) {
  if (options._omniRouteResolved) {
    return streamChatRaw(options);
  }

  const externalOmniRoute = require('./runtime/externalOmniRoute');
  const externalSnapshot = externalOmniRoute.getExternalGatewayConfig();
  const extResolved = options._disableExternalOmniRoute
    ? null
    : externalOmniRoute.resolveCapabilityTarget();
  const resolved = buildExternalResolvedCandidate(extResolved)
    || (!externalSnapshot.enabled || options._disableExternalOmniRoute ? resolveLocalProviderCandidate() : null);

  if (!resolved) {
    const finalError = buildNotConfiguredError(externalSnapshot.enabled && !options._disableExternalOmniRoute);
    if (typeof options.onError === 'function') {
      options.onError(finalError);
    }
    return;
  }

  return new Promise((resolve) => {
    streamChatRaw({
      ...options,
      _omniRouteResolved: resolved,
      onDone: (...args) => {
        if (typeof options.onDone === 'function') {
          options.onDone(...args);
        }
        resolve();
      },
      onError: (err) => {
        if (typeof options.onError === 'function') {
          options.onError(err);
        }
        resolve();
      }
    }).catch((err) => {
      if (typeof options.onError === 'function') {
        options.onError(err);
      }
      resolve();
    });
  });
}

async function streamChatRaw({
  messages,
  onDelta,
  onDone,
  onError,
  onToolEvent,
  preserveToolChain = false,
  toolRound = 0,
  toolSignatures = [],
  toolChoice = 'auto',
  turnId = null,
  capability = null,
  _omniRouteResolved = null,
  _disableExternalOmniRoute = false,
  _forcedFinalAttempt = false,
}) {
  const hasMultimodalParts = (msgs) => Array.isArray(msgs) && msgs.some((m) =>
    Array.isArray(m?.content) && m.content.some((part) =>
      part && typeof part === 'object' && part.type && part.type !== 'text'
    )
  );

  let resolved = _omniRouteResolved;
  if (!resolved) {
    try {
      const externalOmniRoute = require('./runtime/externalOmniRoute');
      const routeRes = _disableExternalOmniRoute ? null : externalOmniRoute.resolveCapabilityTarget();
      if (routeRes) {
        resolved = buildExternalResolvedCandidate(routeRes);
      }
    } catch (err) {
      log.warn('OmniRoute resolve error', { error: err.message });
    }
  }
  if (!resolved) {
    resolved = resolveLocalProviderCandidate();
  }
  if (!resolved) {
    throw buildNotConfiguredError(false);
  }
  const { provider, apiKey, baseUrl, model, caps, fallback } = resolved;

  // 上下文截断优化：防止消息过长
  const truncatedMessages = preserveToolChain
    ? messages
    : truncateHistory(messages, model);
  const reentryCapability = 'default';
  let effectiveMessages = provider.id === 'google'
    ? injectGoogleDiagramGuard(truncatedMessages)
    : truncatedMessages;
  getContextUsageRatio(effectiveMessages, model, { logger: log });

  // 保留 DeepSeek 作为 fallback（百炼失败时切换）
  const canFallbackToDeepseek = fallback.canFallbackToDeepseek;
  
  // MiniMax 官方 API 失败时，fallback 到百炼版 MiniMax
  const canFallbackToBailian = fallback.canFallbackToBailian;

  log.info('request start', {
    turnId: turnId || null,
    provider: provider.name,
    providerId: provider.id,
    baseUrl: String(baseUrl || '').replace(/\/$/, ''),
    model,
    messages: Array.isArray(effectiveMessages) ? effectiveMessages.length : 0,
  });

  const startedAt = Date.now();
  let streamStatus = 200;
  let streamErrorType = null;
  let streamUsage = null;

  try {
    if (!apiKey) {
      streamStatus = 401;
      streamErrorType = 'ConfigurationError';
      onError(new Error('API Key 未配置，请在设置中填入' + (provider.keyLink ? `（${provider.name}）` : '')));
      return;
    }

  if (provider.id === 'google' && isGoogleNativeMode(config)) {
    try {
      if (caps.toolsSupport === 'unknown') {
        caps.toolsSupport = 'supported';
        caps.supportsTools = true;
        caps.capabilitySource = 'google_native_sdk';
      }
      if (!caps.toolReliability || caps.toolReliability === 'none') {
        caps.toolReliability = 'loose';
      }
      const effectiveSupportsTools = canAttemptTools(caps);
      effectiveMessages = injectClarifyCapabilityMessage(effectiveMessages, effectiveSupportsTools ? 'supported' : 'unsupported');
      effectiveMessages = normalizeMessagesForProvider(effectiveMessages, provider.id, model);
      const validatedMessages = validateAndFixMessages(effectiveMessages, { logger: log });
      const droppedCount = effectiveMessages.length - validatedMessages.length;
      if (droppedCount > 0) {
        log.info('validateAndFixMessages 丢弃孤立消息', {
          droppedCount,
          finalCount: validatedMessages.length,
          turnId: turnId || null,
        });
      }

      log.info('model caps', {
        turnId: turnId || null,
        model,
        toolsSupport: caps.toolsSupport || 'supported',
        capabilitySource: caps.capabilitySource || 'google_native_sdk',
        supportsTools: caps.supportsTools,
        toolReliability: caps.toolReliability,
        supportsStreamOptions: false,
      });

      const result = await generateNativeChat({
        rawConfig: {
          GOOGLE_AI_API_KEY: apiKey,
          GOOGLE_AI_BASE_URL: baseUrl,
          GOOGLE_API_MODE: config.GOOGLE_API_MODE || 'native',
          GOOGLE_CLOUD_PROJECT: config.GOOGLE_CLOUD_PROJECT || '',
          GOOGLE_CLOUD_LOCATION: config.GOOGLE_CLOUD_LOCATION || '',
          GOOGLE_GENAI_API_VERSION: config.GOOGLE_GENAI_API_VERSION || '',
        },
        messages: validatedMessages,
        model,
        toolDefinitions: effectiveSupportsTools ? toolLoader.getDefinitions() : [],
        toolChoice,
        onDelta: (chunk) => {
          if (chunk) onDelta(chunk);
        },
      });

      if (result.usage) {
        streamUsage = result.usage;
      }

      if (result.toolCalls.length > 0) {
        await toolLoop.handleToolCalls({
          toolCalls: result.toolCalls,
          toolRound,
          toolSignatures,
          fullText: result.text || '',
          totalUsage: result.usage || null,
          responseModel: result.responseModel || model,
          assistantResponseMessage: result.assistantResponseMessage,
          truncatedMessages: effectiveMessages,
          onDelta,
          onDone,
          onError,
          onToolEvent,
          flushThinkAtEnd: () => {},
          turnId,
          _omniRouteResolved: resolved,
          _disableExternalOmniRoute,
        });
        return;
      }

      onDone(result.text || '', result.usage || null, result.responseModel || model);
      return;
    } catch (e) {
      streamStatus = e.status || 500;
      streamErrorType = e.name || 'Error';
      log.error('google native streamChat error', {
        error: e?.message || String(e),
        model,
      });
      onError(e);
      return;
    }
  }

  let fullText = '';  // 提升到 try 外，供 catch 中流中断截断逻辑使用
  let assistantResponseContent = '';
  /** Thinking-mode providers may require this field to be echoed on tool continuation. */
  let assistantReasoningContent = '';
  const _thinkState = {
    inThink: false,
    cotOpen: false,
    contentBuffer: '',
    pendingTag: '',
    thinkCount: 0,
  };
  let _thinkTagMode = false;
  let hasToolEvidence = false;
  /** 在 fetch 前赋值，确保 catch 块也可用 */
  let flushThinkAtEnd = () => {};

  // 心跳计时器：移到 try 外，防止 catch 块引用时已超出作用域
  let heartbeatTimer = null;
  let lastChunkTime = Date.now();
  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastChunkTime > 12000) {
        onDelta('\u200B'); // 零宽空格，前端过滤掉不显示
        console.log('[AI] 发送流心跳，防止连接断开');
      }
    }, 5000);
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  try {
    if (caps.toolsSupport === 'unknown') {
      const probeResult = await probeModelToolsSupport({
        provider,
        baseUrl,
        apiKey,
        model,
        config,
        fetchWithRetry,
        buildChatHeaders,
        classifyProbeFailure,
        googleHttpsProxy: config.GOOGLE_HTTPS_PROXY,
        logger: log,
      });
      if (probeResult?.toolsSupport) {
        caps.toolsSupport = probeResult.toolsSupport;
        caps.supportsTools = probeResult.toolsSupport === 'supported';
        caps.capabilitySource = probeResult.capabilitySource || 'runtime_probe';
      }
    }
    if (!caps.toolReliability || (caps.toolReliability === 'none' && caps.toolsSupport !== 'unsupported')) {
      caps.toolReliability = caps.toolsSupport === 'unsupported' ? 'none' : 'loose';
    }
    const effectiveToolsSupport = caps.toolsSupport || (caps.supportsTools ? 'supported' : 'unknown');
    effectiveMessages = injectClarifyCapabilityMessage(effectiveMessages, effectiveToolsSupport);
    effectiveMessages = normalizeMessagesForProvider(effectiveMessages, provider.id, model);
    const validatedMessages = validateAndFixMessages(effectiveMessages, { logger: log });
    const droppedCount = effectiveMessages.length - validatedMessages.length;
    if (droppedCount > 0) {
      log.info('validateAndFixMessages 丢弃孤立消息', {
        droppedCount,
        finalCount: validatedMessages.length,
        turnId: turnId || null,
      });
    }

    const hasImage = validatedMessages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(c => c.type === 'image_url')
    );

    log.info('model caps', {
      turnId: turnId || null,
      model,
      toolsSupport: effectiveToolsSupport,
      capabilitySource: caps.capabilitySource || 'unknown',
      supportsTools: caps.supportsTools,
      toolReliability: caps.toolReliability,
      supportsStreamOptions: caps?.supportsStreamOptions ?? provider.supportsStreamOptions,
    });

    _thinkTagMode = caps.thinkingFormat === 'think_tags';
    _thinkState.inThink = false;
    _thinkState.cotOpen = false;
    _thinkState.contentBuffer = '';
    _thinkState.pendingTag = '';
    _thinkState.thinkCount = 0;

    // ── MiniMax <redacted_thinking> 标签流式解析器 ──────────────────────────────
    // 适配 MiniMax M2.7 的"交织式思考"：模型在一次回复里多次交替输出
    // <redacted_thinking>思考</redacted_thinking>正文<redacted_thinking>继续思考</redacted_thinking>继续正文
    //
    // 策略：
    //   1. 第一个 <redacted_thinking> 出现时开启 [cot]，保持 CoT 块持续开放
    //   2. 多个 <redacted_thinking> 块的内容都流入同一个 CoT，用分隔线隔开
    //   3. 思考块之间的正文内容暂存到 contentBuffer，不立即输出
    //   4. 流结束时：发出 [/cot] → 释放 contentBuffer 给前端渲染
    //
    // 结果：用户看到思考流式展开 → 思考折叠 → 干净的答案出现
    // 其他模型（thinkingFormat 不是 'think_tags'）完全不受影响
    // ─────────────────────────────────────────────────────────────────
    // 支持两种标签格式：MiniMax 可能输出 <redacted_thinking> 或标准格式 <think>
    const OPEN_REDACTED = '<redacted_thinking>';
    const CLOSE_REDACTED = '</redacted_thinking>';
    const OPEN_COT = '<think>';
    const CLOSE_COT = '</think>';

    /**
     * 规范化标签：将标准 <think> 转换为内部标签格式
     * @param {string} s - 输入字符串
     * @returns {{ normalized: string, hadCotOpen: boolean, hadCotClose: boolean }}
     */
    function _normalizeThinkTags(s) {
      let hadCotOpen = false;
      let hadCotClose = false;
      let normalized = s;

      // 先检查标准 <think> 标签
      if (normalized.includes(OPEN_COT)) hadCotOpen = true;
      if (normalized.includes(CLOSE_COT)) hadCotClose = true;

      // 将标准 <think> 标签转换为 <redacted_thinking> 格式
      // 避免重复替换（如果已经有 <redacted_thinking> 就不替换）
      if (hadCotOpen && !normalized.includes(OPEN_REDACTED)) {
        normalized = normalized.split(OPEN_COT).join(OPEN_REDACTED);
      }
      if (hadCotClose && !normalized.includes(CLOSE_REDACTED)) {
        normalized = normalized.split(CLOSE_COT).join(CLOSE_REDACTED);
      }

      return { normalized, hadCotOpen, hadCotClose };
    }

    const OPEN_THINK = OPEN_REDACTED;
    const CLOSE_THINK = CLOSE_REDACTED;

    /** 返回 s 末尾与 tag 前缀重叠的最长子串（处理跨 chunk 的残缺标签） */
    function _findPartialTag(s, tag) {
      for (let len = Math.min(s.length, tag.length - 1); len > 0; len--) {
        if (tag.startsWith(s.slice(-len))) return s.slice(-len);
      }
      return '';
    }

    /** 过滤掉 AI 误输出到 content 中的工具调用标记 */
    function _stripToolCallMarkers(s) {
      return s.replace(/\[TOOL_CALLS?\]/gi, '');
    }

    /** 处理一个 content chunk，区分思考内容和正文内容 */
    function _processContentChunk(raw) {
      // 先过滤掉 [TOOL_CALL] / [TOOL_CALLS] 等误输出的标记
      const cleaned = _stripToolCallMarkers(raw);
      if (!cleaned) return;
      assistantResponseContent += cleaned;

      // 标准化思考标签：将标准 <think> 转换为 <redacted_thinking> 格式
      const { normalized, hadCotOpen, hadCotClose } = _normalizeThinkTags(cleaned);

      // 如果检测到标准 <think> 标签但 _thinkTagMode 未启用，
      // 说明模型配置缺少 thinkingFormat，强制启用标签处理
      if (!_thinkTagMode && (hadCotOpen || hadCotClose)) {
        log.warn('检测到 <think> 标签但 thinkingFormat 未配置，强制启用标签处理');
        _thinkTagMode = true;
      }

      if (!_thinkTagMode) {
        fullText += cleaned;
        onDelta(cleaned);
        return;
      }

      let s = _thinkState.pendingTag + normalized;
      _thinkState.pendingTag = '';

      while (s.length > 0) {
        if (!_thinkState.inThink) {
          const idx = s.indexOf(OPEN_THINK);
          if (idx === -1) {
            const tail = _findPartialTag(s, OPEN_THINK);
            const emit = s.slice(0, s.length - tail.length);
            if (emit) {
              if (_thinkState.cotOpen) {
                _thinkState.contentBuffer += emit;
              } else {
                fullText += emit;
                onDelta(emit);
              }
            }
            _thinkState.pendingTag = tail;
            s = '';
          } else {
            const before = s.slice(0, idx);
            if (before) {
              if (_thinkState.cotOpen) {
                _thinkState.contentBuffer += before;
              } else {
                fullText += before;
                onDelta(before);
              }
            }

            if (!_thinkState.cotOpen) {
              fullText += '[cot]';
              onDelta('[cot]');
              _thinkState.cotOpen = true;
            } else {
              // 已经在 CoT 块中：先发送分隔符，再继续新的 thinking 内容
              const sep = '\n\n---\n\n';
              fullText += sep;
              onDelta(sep);
            }

            _thinkState.thinkCount++;
            _thinkState.inThink = true;
            s = s.slice(idx + OPEN_THINK.length);
          }
        } else {
          const idx = s.indexOf(CLOSE_THINK);
          if (idx === -1) {
            const tail = _findPartialTag(s, CLOSE_THINK);
            const emit = s.slice(0, s.length - tail.length);
            if (emit) { fullText += emit; onDelta(emit); }
            _thinkState.pendingTag = tail;
            s = '';
          } else {
            const thinkContent = s.slice(0, idx);
            if (thinkContent) { fullText += thinkContent; onDelta(thinkContent); }
            _thinkState.inThink = false;
            s = s.slice(idx + CLOSE_THINK.length);
          }
        }
      }
    }

    /**
     * 流结束时调用：关闭 CoT 块，释放暂存的正文内容
     * 必须在 onDone() 之前调用
     */
    /**
     * 流结束时调用：关闭 CoT 块，释放暂存的正文内容
     * 必须在 onDone() 之前调用
     */
    function _flushThinkState() {
      if (_thinkState.pendingTag) {
        if (_thinkState.cotOpen) {
          _thinkState.contentBuffer += _thinkState.pendingTag;
        } else {
          fullText += _thinkState.pendingTag;
          onDelta(_thinkState.pendingTag);
        }
        _thinkState.pendingTag = '';
      }

      if (_thinkState.cotOpen) {
        fullText += '[/cot]';
        onDelta('[/cot]');
        // 重置所有状态，避免重复发送 [/cot]
        _thinkState.cotOpen = false;
        _thinkState.inThink = false;

        if (_thinkState.contentBuffer) {
          fullText += _thinkState.contentBuffer;
          onDelta(_thinkState.contentBuffer);
          _thinkState.contentBuffer = '';
        }
      }
    }
    // 提前赋值，确保 catch 块中也可正常调用（原来在 fetch 之后才赋值，fetch 抛异常时 catch 里是 no-op）
    flushThinkAtEnd = _flushThinkState;
    // ────────────────────────────────────────────────────────────────

    const requestBody = {
      model,
      messages: validatedMessages,
      stream: true,
      max_tokens: caps.maxTokens || 4096,
    };
    const requestTemperature = resolveTemperatureForRequest({ provider, model });
    if (requestTemperature !== null) {
      requestBody.temperature = requestTemperature;
    }
    if (provider.supportsStreamOptions) {
      requestBody.stream_options = { include_usage: true };
    }
    const effectiveSupportsTools = canAttemptTools(caps);
    const forceFinalFromToolResults = shouldForceFinalFromToolResults(provider.id, preserveToolChain, toolRound);
    const shouldInjectTools = effectiveSupportsTools && !hasImage;
    if (shouldInjectTools) {
      requestBody.tools = toolLoader.getDefinitions();
      // 部分 OpenAI 兼容服务商（如硅基流动）不支持 tool_choice 指定具体函数名，
      // 只允许 'auto' / 'none'。仅在 provider 明确声明支持时才发对象形式。
      const isObjectToolChoice = toolChoice && typeof toolChoice === 'object';
      requestBody.tool_choice = forceFinalFromToolResults
        ? 'none'
        : ((isObjectToolChoice && !provider.supportsToolChoiceFunction) ? 'auto' : toolChoice);
      if (forceFinalFromToolResults) {
        log.info('Google 工具续轮强制收束为最终回答', {
          turnId: turnId || null,
          toolRound,
        });
      }
      if (!forceFinalFromToolResults && isObjectToolChoice && !provider.supportsToolChoiceFunction) {
        log.warn('tool_choice 对象形式降级为 auto（provider 不支持指定函数）', { provider: provider.id, requested: JSON.stringify(toolChoice) });
      }
    }

    const chatHeaders = buildChatHeaders(baseUrl, apiKey);

    const res = await fetchWithRetry(`${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: chatHeaders,
      body: JSON.stringify(requestBody),
    }, {
      logger: log,
      googleHttpsProxy: config.GOOGLE_HTTPS_PROXY,
    });

    log.info('response', { status: res.status });

    if (!res.ok) {
      const errText = await res.text();
      log.error('request failed', { status: res.status, error: String(errText).slice(0, 500) });
      throw new Error(`API Error ${res.status}: ${errText}`);
    }

    const reader = res.body;
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let toolCalls = [];
    let totalUsage = null;
    let responseModel = null;  // API 返回的实际模型名（用于校验和展示）
    let sawDone = false;
    let terminalStreamError = null;

    startHeartbeat();
    log.debug('stream start');
    for await (const chunk of reader) {
      const raw = decoder.decode(chunk, { stream: true });
      buf += raw;
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') {
          sawDone = true;
          continue;
        }
        if (!trimmed.startsWith('data: ')) continue;

        let parsed;
        try {
          parsed = JSON.parse(trimmed.slice(6));
        } catch { continue; }

        if (parsed?.usage) {
          totalUsage = parsed.usage;
          streamUsage = parsed.usage;
        }
        if (parsed?.model && !responseModel) {
          responseModel = parsed.model;
        }

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          assistantReasoningContent += delta.reasoning_content;
        }
        if (delta.content) {
          lastChunkTime = Date.now(); // 每次收到真实 chunk 时更新时间
          _processContentChunk(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            toolCalls[idx] = applyToolCallDelta(toolCalls[idx], tc);
          }
        }

        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason) log.info('finishReason', { finishReason, toolCallsLen: toolCalls.filter(Boolean).length });
        if (finishReason === 'stop') sawDone = true;
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          hasToolEvidence = true;
          stopHeartbeat();
          // 不要在这里 flushThinkState！thinking 状态要保持打开，
          // 等工具返回后继续的 streamChat 会继续处理 thinking 内容
          await toolLoop.handleToolCalls({
            toolCalls,
            toolRound,
            toolSignatures,
            fullText,
            totalUsage,
            responseModel,
            assistantResponseMessage: {
              role: 'assistant',
              content: assistantResponseContent || '',
              ...(assistantReasoningContent
                ? { reasoning_content: assistantReasoningContent }
                : {}),
              tool_calls: toolCalls.filter(Boolean),
            },
            truncatedMessages: effectiveMessages,
            onDelta,
            onDone,
            onError,
            onToolEvent,
            flushThinkAtEnd,
            turnId,
            _omniRouteResolved: resolved,
            _disableExternalOmniRoute,
          });
        return;
      }
        if (finishReason === 'tool_calls' && toolCalls.filter(Boolean).length === 0) {
          stopHeartbeat();
          log.error('finish_reason=tool_calls but no tool calls parsed', { turnId: turnId || null });
          onError(new Error('工具调用解析失败：模型声明了 tool_calls，但未收到有效调用数据'));
          return;
        }
        if (finishReason === 'unexpected_state') {
          const hasOutput = String(fullText || '').trim().length > 0;
          const hasParsedToolCalls = toolCalls.filter(Boolean).length > 0;
          if (!hasOutput && !hasParsedToolCalls) {
            terminalStreamError = new Error('模型返回异常状态（unexpected_state），本轮未产出可用内容。请重试，或切换模型后再试。');
            sawDone = true;
            break;
          }
        }
      }
      if (terminalStreamError) break;
    }
    if (terminalStreamError) {
      stopHeartbeat();
      log.error('terminal stream state error', {
        error: terminalStreamError.message,
        turnId: turnId || null,
        provider: provider.name,
        model,
      });
      onError(terminalStreamError);
      return;
    }

    if (!sawDone) {
      log.warn('stream interrupted', { 
        outputLen: (fullText || '').length,
        provider: provider.name,
        model,
        baseUrl: baseUrl.replace(/\/v1.*/, '/v1/...')
      });
    } else {
      log.debug('stream end');
    }
    stopHeartbeat();
    log.info('request done', { outputLen: (fullText || '').length, usage: totalUsage || null, responseModel: responseModel || null });

    if (!String(fullText || '').trim() && hasToolEvidence && toolChoice !== 'none' && !_forcedFinalAttempt) {
      log.warn('empty final answer after tool rounds, retrying once with tool_choice=none', {
        turnId: turnId || null,
        model: responseModel || model,
        toolRound,
      });
      return await streamChatRaw({
        messages: effectiveMessages,
        onDelta,
        onDone,
        onError,
        onToolEvent,
        preserveToolChain,
        toolRound,
        toolSignatures,
        toolChoice: 'none',
        turnId,
        capability: reentryCapability,
        _omniRouteResolved: resolved,
        _disableExternalOmniRoute,
        _forcedFinalAttempt: true,
      });
    }

    const textToCheck = fullText || assistantResponseContent || '';
    const pseudoResidueDetected = effectiveSupportsTools && hasPseudoToolResidue(textToCheck);
    const shouldDetectPseudo = effectiveSupportsTools && caps.toolReliability === 'loose';
    let pseudoToolCalls = shouldDetectPseudo ? extractAllPseudoToolCalls(textToCheck) : [];

    // strict 模型安全网：若正文出现明显伪工具调用残留，降级走伪调用解析
    // 正常情况下 strict 模型应走标准 tool_calls 通道
    if (pseudoToolCalls.length === 0 && effectiveSupportsTools && caps.toolReliability === 'strict') {
      const hasToolCallResidue =
        pseudoResidueDetected
        || /\bcanvas\s*\(\s*["'](?:create|update|focus)["']/i.test(textToCheck)
        || /\{"name"\s*:\s*"(?:web_search|web_fetch|canvas|read_file|read_document|write_file|exec_command|memory_write|memory_search|memory_read|memory_vector_search|task_add|task_done|task_delete|tasks_add|tasks_update|tasks_delete|parking_add)"/i.test(textToCheck);
      if (hasToolCallResidue) {
        log.warn('strict model emitted pseudo tool call in plaintext, falling back to pseudo detection', {
          model: responseModel || model,
          toolReliability: caps.toolReliability,
        });
        pseudoToolCalls = extractAllPseudoToolCalls(textToCheck);
      }
    }
    if (pseudoToolCalls.length > 0) {
      hasToolEvidence = true;
      log.warn('pseudo tool call detected, coercing to structured tool execution', {
        count: pseudoToolCalls.length,
        tools: pseudoToolCalls.map((call) => call.function?.name).filter(Boolean),
      });
      await toolLoop.handleToolCalls({
        toolCalls: pseudoToolCalls,
        toolRound,
        toolSignatures,
        fullText: '',
        totalUsage,
        responseModel,
        assistantResponseMessage: {
          role: 'assistant',
          content: '',
          ...(assistantReasoningContent
            ? { reasoning_content: assistantReasoningContent }
            : {}),
          tool_calls: pseudoToolCalls,
        },
        truncatedMessages: effectiveMessages,
        onDelta,
        onDone,
        onError,
        onToolEvent,
        flushThinkAtEnd,
        turnId,
        _omniRouteResolved: resolved,
        _disableExternalOmniRoute,
      });
      return;
    }
    let replyText = textToCheck;
    if (pseudoResidueDetected) {
      replyText = stripPseudoToolResidue(textToCheck);
      if (!replyText) {
        replyText = '检测到无效工具调用格式，已忽略该调用并继续。';
      }
      log.warn('pseudo tool residue stripped from final reply', {
        model: responseModel || model,
        originalLen: textToCheck.length,
        strippedLen: replyText.length,
      });
    }
    // 关闭 MiniMax CoT 块并释放暂存正文（非 MiniMax 模型此函数直接跳过）
    if (_thinkTagMode) _flushThinkState();
    const safeReply = enforceExecutionContract({
      text: replyText,
      supportsTools: !!effectiveSupportsTools,
      hasToolEvidence,
    });
    onDone(safeReply, totalUsage, responseModel);
  } catch (e) {
    streamStatus = resolveStreamErrorStatus(e);
    streamErrorType = resolveStreamErrorType(e);
    stopHeartbeat();
    log.error('流中断:', e?.message || String(e), {
      provider: provider.name,
      model,
      errorName: e?.name,
      errorCode: e?.code
    });

    // 如果已经输出了一部分内容，发送截断提示而不是直接报错
    if (fullText && fullText.length > 10) {
      const truncateMsg = '\n\n---\n⚠️ 网络波动，回复可能不完整。如需继续，请发送「继续」';
      flushThinkAtEnd();
      onDelta(truncateMsg);
      onDone(fullText + truncateMsg, null, null);
      log.warn('已发送截断提示，已输出内容长度:', fullText.length);
      return;
    }

    // MiniMax 官方 API 失败时，优先 fallback 到百炼版 MiniMax
    // 注意：工具调用相关错误（400/401/403 表示请求本身有问题，如 tool_id 无效）不 fallback，直接报错
    const isToolError = e?.message && (
      e.message.includes('tool id') ||
      e.message.includes('tool_call_id') ||
      e.message.includes('thought_signature') ||
      e.message.includes('reasoning_content') ||
      e.message.includes('invalid params') ||
      (e.message.includes('HTTP 400') && e.message.includes('tool')) ||
      (e.message.includes('HTTP 400') && e.message.includes('thinking')) ||
      (e.message.includes('HTTP 401') && e.message.includes('tool')) ||
      (e.message.includes('HTTP 403'))
    );

    if (Number(e?.status) === 429 && preserveToolChain && toolRound > 0) {
      const fallbackReply = buildToolResultFallbackReply(effectiveMessages, e);
      if (fallbackReply) {
        log.warn('工具续轮 429，返回已取得的工具结果摘要', {
          turnId: turnId || null,
          toolRound,
        });
        flushThinkAtEnd();
        onDone(fallbackReply, null, null);
        return;
      }
    }

    if (isToolError || isProtocolOrRateLimitError(e) || preserveToolChain || toolRound > 0) {
      log.error('工具/协议/配额错误或工具续轮错误，不进行 fallback', {
        error: e?.message || String(e),
        status: e?.status || null,
        preserveToolChain,
        toolRound,
      });
      onError(e);
      return;
    }

    if (canFallbackToBailian) {
      log.warn('MiniMax API failed, fallback to Bailian MiniMax', { error: e?.message || String(e) });
      const prevProvider = config.currentProvider;
      const prevModel = config.DASHSCOPE_MODEL;
      const originalModel = model;
      const fallbackModel = 'MiniMax-M2.5';
      config.currentProvider = 'bailian-coding';
      config.DASHSCOPE_MODEL = fallbackModel;
      try {
        log.debug('streamChat fallback re-enter', { originalModel, fallbackModel });
        await streamChat({
          messages: truncatedMessages,
          onDelta,
          onDone,
          onError,
          onToolEvent,
          capability: reentryCapability,
          _disableExternalOmniRoute: true,
        });
      } finally {
        config.currentProvider = prevProvider;
        config.DASHSCOPE_MODEL = prevModel;
      }
    } else if (canFallbackToDeepseek) {
      if (hasMultimodalParts(truncatedMessages)) {
        log.warn('skip deepseek fallback for multimodal request', { error: e?.message || String(e) });
        onError(e);
        return;
      }
      log.warn('primary provider failed, fallback to deepseek', { error: e?.message || String(e) });
      const prevProvider = config.currentProvider;
      const prevModel = config.DASHSCOPE_MODEL;
      const originalModel = model;
      const fallbackModel = 'deepseek-v4-flash';
      config.currentProvider = 'deepseek';
      config.DASHSCOPE_MODEL = fallbackModel;
      try {
        log.debug('streamChat fallback re-enter', { originalModel, fallbackModel });
        await streamChat({
          messages: truncatedMessages,
          onDelta,
          onDone,
          onError,
          onToolEvent,
          capability: reentryCapability,
          _disableExternalOmniRoute: true,
        });
      } finally {
        config.currentProvider = prevProvider;
        config.DASHSCOPE_MODEL = prevModel;
      }
    } else {
      log.error('streamChat error', { error: e?.message || String(e) });
      onError(e);
    }
  }
  } finally {
    if (apiKey) {
      const elapsed = Date.now() - startedAt;
      try {
        const metrics = require('./runtime/omniRoute.metrics');
        metrics.recordRequest({
          capability: 'default',
          providerId: provider.id || null,
          model: model || null,
          latencyMs: elapsed,
          status: streamStatus,
          errorType: streamErrorType,
          usage: streamUsage,
        });
      } catch (_) {}
    }
  }
}

module.exports = {
  streamChat,
  loadSystemPrompt,
  truncateHistory,
  getContextUsageRatio,
  _internals: {
    applyToolCallDelta,
    mergePlainObject,
    isProtocolOrRateLimitError,
    shouldForceFinalFromToolResults,
    buildToolResultFallbackReply,
    inferDefaultCapability,
    extractAllPseudoToolCalls,
    hasPseudoToolResidue,
    stripPseudoToolResidue,
  },
};
