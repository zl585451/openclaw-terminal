const config = require('./config');
const toolLoader = require('./tool_loader');
const skillAdapter = require('./skill_adapter');
const memory = require('./memory');
const memoryFeedback = require('./memory_feedback');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const log = createLogger('ai');
const ProviderRouter = require('./runtime/providerRouter');
const ToolLoop = require('./runtime/toolLoop');

// ═══════════════════════════════════════════════════════════════
// AI 上下文截断优化
// ═══════════════════════════════════════════════════════════════
const MAX_HISTORY_ROUNDS = 12; // 最多保留最近 12 轮对话
const MAX_CONTEXT_CHARS = 60000; // 上下文字符上限（约 15k tokens）
const MAX_TOOL_ROUNDS = 10;
const MAX_IDENTICAL_TOOL_SIGNATURES = 4;
const providerRouter = new ProviderRouter({ config });
const toolLoop = new ToolLoop({
  toolLoader,
  log,
  streamChat: (options) => streamChat(options),
  buildToolSignature,
  maxToolRounds: MAX_TOOL_ROUNDS,
  maxIdenticalToolSignatures: MAX_IDENTICAL_TOOL_SIGNATURES,
});

function truncateHistory(messages) {
  if (!messages || messages.length === 0) return messages;

  // 分离系统消息和对话消息
  const systemMsgs = messages.filter(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  // 只保留最近 N 轮
  const recentChat = chatMsgs.slice(-MAX_HISTORY_ROUNDS * 2);

  // 检查总字符数，超限时从最早的开始裁剪
  let combined = [...systemMsgs, ...recentChat];
  let totalChars = combined.reduce((sum, m) =>
    sum + (typeof m.content === 'string' ? m.content.length : 0), 0);

  while (totalChars > MAX_CONTEXT_CHARS && recentChat.length > 2) {
    const removed = recentChat.shift();
    totalChars -= (typeof removed.content === 'string' ? removed.content.length : 0);
    combined = [...systemMsgs, ...recentChat];
  }

  return combined;
}

function getContextUsageRatio(messages, modelId) {
  const limit = getModelContextLimit(modelId);
  // 粗估 token 数 ≈ 字符数 / 2（中文）或 / 4（英文）
  const totalChars = messages.reduce((sum, m) =>
    sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  const estimatedTokens = totalChars / 2; // 偏保守（中文为主）
  const ratio = estimatedTokens / limit;

  if (ratio > 0.8) {
    log.warn(`上下文使用率 ${(ratio * 100).toFixed(0)}%，建议截断`, { modelId });
  }
  return ratio;
}

function getModelContextLimit(modelId) {
  const MODEL_CONTEXT_LIMITS = {
    'qwen-plus': 128000,
    'qwen3.5-plus': 128000,
    'qwen3-max-2026-01-23': 262144,
    'qwen3-coder-next': 262144,
    'qwen3-coder-plus': 1000000,
    'qwen-vl-max': 32768,
    'qwen2-vl-7b': 32768,
    'kimi-k2.5': 262144,
    'minimax-m2.5': 196608,
    'glm-5': 202752,
    'glm-4.7': 202752,
    'deepseek-chat': 64000,
    'deepseek-reasoner': 64000,
  };
  if (!modelId || typeof modelId !== 'string') return 128000;
  const id = modelId.toLowerCase().replace(/\s/g, '');
  if (id.startsWith('gemini-')) return 1000000;
  return MODEL_CONTEXT_LIMITS[id] || MODEL_CONTEXT_LIMITS[modelId.split('/').pop()] || 128000;
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

async function loadSystemPrompt(promptsDir) {
  const nocturneAlive = await memory.isAlive();

  if (nocturneAlive) {
    let coreUris = [
      'core://agent/identity',
      'core://my_user/profile',
      'core://agent/my_user',
      'core://my_user/communication',
      'core://agent/rules/conversation_style',
      'core://agent/rules/output_format',
      'core://agent/rules/dispatch',
      'core://agent/rules/emotion',
    ];
    try {
      const envPath = path.join(__dirname, '..', 'resources', 'nocturne_memory', '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const m = envContent.match(/CORE_MEMORY_URIS=(.+)/);
      if (m) coreUris = m[1].split(',').map(s => s.trim()).filter(Boolean);
    } catch {}

    let bootMemory = await memory.loadBootMemory(coreUris);
    log.debug('bootMemory loaded', {
      len: bootMemory?.length || 0,
      preview: (bootMemory || '').slice(0, 100),
    });
    if (config.memory && config.memory.load_feedback_on_boot) {
      const feedbackBlock = await memoryFeedback.loadFeedbackForBoot();
      if (feedbackBlock) bootMemory = bootMemory + feedbackBlock;
    }

    // 加载追问偏好
    try {
      const clarificationMemory = require('./clarification_memory');
      const prefsBlock = await clarificationMemory.loadPreferencesForBoot();
      if (prefsBlock) bootMemory = bootMemory + prefsBlock;
    } catch (e) {
      log.warn('clarification prefs load failed', { error: e?.message || String(e) });
    }
    if (bootMemory && bootMemory.length > 100) {
      log.info('System prompt loaded from Nocturne');

      // 加载今天的停车场待办
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const NOCTURNE_BASE = config.NOCTURNE_BASE_URL || 'http://127.0.0.1:8000';
        const parkingRoot = await fetch(
          `${NOCTURNE_BASE}/browse/node?path=my_user/daily/${todayStr}/parking_lot&domain=core`,
          { signal: AbortSignal.timeout(2000) }
        );
        if (parkingRoot.ok) {
          const parkingData = await parkingRoot.json();
          const children = parkingData?.node?.children
            || parkingData?.children || [];

          const undoneItems = [];
          for (const child of children) {
            const childPath = child.path || '';
            if (!childPath) continue;
            const cr = await fetch(
              `${NOCTURNE_BASE}/browse/node?path=${encodeURIComponent(childPath)}&domain=core`,
              { signal: AbortSignal.timeout(2000) }
            );
            if (!cr.ok) continue;
            const cd = await cr.json();
            const content = cd?.node?.content || cd?.content || '';
            try {
              const parsed = JSON.parse(content);
              if (!parsed.done) undoneItems.push(parsed.item);
            } catch {}
          }

          if (undoneItems.length > 0) {
            // 注入到 bootMemory 开头，让 AI 一启动就知道
            const parkingNotice = `\n## ⚠️ 停车场提醒（上次会话未完成的事）\n${
              undoneItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
            }\n\n请在用户第一条消息后，用一句话提醒他还有这些待处理的事。`;

            bootMemory = parkingNotice + '\n\n---\n\n' + bootMemory;
            log.info('parking loaded', { count: undoneItems.length });
          }
        }
      } catch {}

      // 同步写回 MEMORY.md（让文件和 Nocturne 保持一致）
      const memoryMdPath = path.join(promptsDir, 'MEMORY.md');
      const memoryMdContent = `# MEMORY.md - 长期记忆（自动同步自 Nocturne）

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

      return buildSystemPrompt(bootMemory, 'nocturne', promptsDir);
    }
  }

  log.warn('Nocturne unavailable, fallback to local prompt files');
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

async function fetchWithRetry(url, options, maxRetries = 2) {
  // 从 url 中提取 baseUrl，用于判断是否为 MiniMax API
  const isMiniMax = url.includes('minimaxi.com');
  const timeoutMs = isMiniMax ? 180000 : 120000;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log.info(`第 ${attempt} 次重试请求...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        log.warn(`请求超时（${timeoutMs / 1000}秒），触发 abort`);
      }, timeoutMs);

      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      }
      return resp;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') {
        log.error('请求被中止（超时）', { url: url.replace(/\/v1.*/, '/v1/...') });
        break;
      }
      if (attempt < maxRetries) {
        log.warn(`请求失败，将重试: ${e.message}`, { 
          url: url.replace(/\/v1.*/, '/v1/...'),
          errorName: e.name,
          errorCode: e.code 
        });
      }
    }
  }
  throw lastError;
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

  const nocturneInstructions = `
## 🧠 记忆系统（Nocturne Memory）

记忆已从${source === 'nocturne' ? ' Nocturne 服务器' : '本地文件'}加载。

记忆系统有两条链路：
- 自动链路：Gateway 会在回答前注入一部分相关记忆，并在回答后后台保存反馈/摘要/偏好
- 显式链路：当你需要主动回忆、核对或写入记忆时，应直接调用 memory_search / memory_read / memory_write 工具，不要只在正文里口头描述“我去查记忆”

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
  - web_search(query) — 搜索互联网（遇到需要最新信息时使用）
  - web_fetch(url) — 读取指定网页
  
  搜索使用原则：
  - 需要最新信息、网页资料、产品/新闻/文档时，优先使用 web_search
  - 如果 web_search 返回结果较少、摘要过短或不够支撑回答，不要立刻放弃；应继续对前 1-2 个高相关结果使用 web_fetch 补充正文信息
  - 回答时尽量说明最终使用的是哪类来源（搜索摘要 / 网页正文）
  - 不要只拿到 1 次搜索的短摘要就结束；当问题明显需要更完整资料时，应继续补抓网页内容

  **文件工具**（谨慎使用，执行前说明意图）：
  - read_file(path) — 读取文件
  - write_file(path, content) — 写入文件
- exec_command(command) — 执行命令

  文件/命令使用规则：
  - 当前运行环境以 Windows 为主，优先使用项目相对路径，例如 oct-gateway/index.js、src/ui/chat/MessageList.tsx
  - 查代码时优先使用 read_file，不要先尝试猜测本机绝对路径
  - 只有在 read_file 无法满足时才使用 exec_command
  - 在 Windows 环境中不要优先使用 ls、grep、head、find ... |、/mnt/...、2>/dev/null 这类 Unix/Linux 命令风格
  - 如果需要目录信息，优先使用 Windows 友好的命令或直接读取明确文件；不要连续尝试多种路径风格
  - 当命令执行失败时，不要反复换壳层或路径风格盲试超过 2 次；应改用 read_file 或直接基于已知文件回答

**Canvas 工具**：
- canvas(action, ...) — 在 Canvas 工作区创建或更新结构化成果物
- 适合场景：方案/提纲/PRD、流程图/架构图/时序图、页面草图、代码草稿
- 使用原则：先 chat 一句话说明，再调用 canvas；更新已有文档用 update 不用 create；简单问答不滥用 canvas

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
    nocturneInstructions,
  ].join('');

  // 注入 OpenClaw 兼容技能列表
  const skills = skillAdapter.loadSkills();
  if (skills.length > 0) {
    prompt += skillAdapter.formatSkillsForPrompt(skills);
  }

  return prompt;
}

function buildToolSignature(toolCalls) {
  return JSON.stringify(
    (toolCalls || [])
      .filter(Boolean)
      .map((tc) => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '',
      }))
  );
}

function decodePseudoToolValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, '\'').replace(/\\"/g, '"');
  }
  return value;
}

function parsePseudoToolArgs(blockText) {
  const args = {};
  const text = String(blockText || '');
  const flagRe = /--([a-zA-Z][\w-]*)\s+/g;
  let match;
  while ((match = flagRe.exec(text)) !== null) {
    const key = match[1];
    const valueStart = flagRe.lastIndex;
    const nextMatch = flagRe.exec(text);
    const valueEnd = nextMatch ? nextMatch.index : text.length;
    const rawValue = text.slice(valueStart, valueEnd).trim();
    args[key] = decodePseudoToolValue(rawValue);
    if (nextMatch) {
      flagRe.lastIndex = nextMatch.index;
    }
  }
  return args;
}

function extractPseudoToolCalls(text) {
  const source = String(text || '');
  if (!source || !/tool\s*=>/i.test(source) || !/args\s*=>/i.test(source)) {
    return [];
  }

  const blocks = [];
  const headerRe = /\{tool\s*=>\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z_][\w-]*))\s*,\s*args\s*=>\s*\{/gi;
  let header;

  while ((header = headerRe.exec(source)) !== null) {
    const toolName = header[1] || header[2] || header[3] || '';
    const argsOpenBracePos = source.indexOf('{', header.index + header[0].lastIndexOf('args'));
    if (argsOpenBracePos < 0) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let quoteChar = '"';
    let i = argsOpenBracePos;
    let argsClosePos = -1;

    for (; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        continue;
      }
      if (ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          argsClosePos = i;
          break;
        }
      }
    }

    if (argsClosePos < 0) continue;

    const argsBlock = source.slice(argsOpenBracePos + 1, argsClosePos);
    const parsedArgs = parsePseudoToolArgs(argsBlock);
    if (!parsedArgs.action) continue;

    blocks.push({
      id: `pseudo-${Date.now()}-${blocks.length}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(parsedArgs),
      },
    });
  }

  return blocks;
}

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
  onToolEvent,
  preserveToolChain = false,
  toolRound = 0,
  toolSignatures = [],
  toolChoice = 'auto',
}) {
  const resolved = providerRouter.resolve();
  const { provider, apiKey, baseUrl, model, caps, fallback } = resolved;

  // 上下文截断优化：防止消息过长
  const truncatedMessages = preserveToolChain ? messages : truncateHistory(messages);
  getContextUsageRatio(truncatedMessages, model);

  // 保留 DeepSeek 作为 fallback（百炼失败时切换）
  const canFallbackToDeepseek = fallback.canFallbackToDeepseek;
  
  // MiniMax 官方 API 失败时，fallback 到百炼版 MiniMax
  const canFallbackToBailian = fallback.canFallbackToBailian;

  log.info('request start', { provider: provider.name, model, messages: Array.isArray(truncatedMessages) ? truncatedMessages.length : 0 });

  if (!apiKey) {
    onError(new Error('API Key 未配置，请在设置中填入' + (provider.keyLink ? `（${provider.name}）` : '')));
    return;
  }

  let fullText = '';  // 提升到 try 外，供 catch 中流中断截断逻辑使用
  let assistantResponseContent = '';
  const _thinkState = {
    inThink: false,
    cotOpen: false,
    contentBuffer: '',
    pendingTag: '',
    thinkCount: 0,
  };
  let _thinkTagMode = false;
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
    const hasImage = truncatedMessages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(c => c.type === 'image_url')
    );

    log.info('model caps', { model, supportsTools: caps.supportsTools, supportsStreamOptions: caps?.supportsStreamOptions ?? provider.supportsStreamOptions });

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
      messages: truncatedMessages,
      stream: true,
      max_tokens: caps.maxTokens || 4096,
      temperature: provider.id === 'minimax' ? getMiniMaxTemperature() : 0.7,
    };
    if (provider.supportsStreamOptions) {
      requestBody.stream_options = { include_usage: true };
    }
    if (caps.supportsTools) {
      requestBody.tools = toolLoader.getDefinitions();
      requestBody.tool_choice = toolChoice;
    }

    // Google 系鉴权策略（两套端点，规则不同）：
    //
    // ① generativelanguage.googleapis.com（AI Studio OpenAI 兼容层）
    //    - AIzaSy... 格式 API Key
    //    - 官方支持 Bearer / x-goog-api-key / ?key= 三选一
    //    - 实测 V2rayN HTTPS CONNECT 隧道下 x-goog-api-key 不生效（可能与特定 key 类型限制有关）
    //    → 使用 Authorization: Bearer
    //
    // ② aiplatform.googleapis.com（Vertex AI 原生 / Vertex AI Express）
    //    - AQ.xxxx 格式 Vertex AI Express API Key
    //    - 该端点要求 x-goog-api-key；发 Bearer 会返回 401 "Expected OAuth 2.0 access token"
    //    → 使用 x-goog-api-key
    //
    // sanitizeGoogleOpenAiBaseUrl() 已在 config.js 中去掉 baseUrl 里的 ?key=，防双凭证 400。
    const _baseForAuth = String(baseUrl || '');
    const isVertexAIEndpoint = _baseForAuth.includes('aiplatform.googleapis.com');
    const chatHeaders = isVertexAIEndpoint
      ? {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        }
      : {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        };

    const res = await fetchWithRetry(`${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: chatHeaders,
      body: JSON.stringify(requestBody),
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
        }
        if (parsed?.model && !responseModel) {
          responseModel = parsed.model;
        }

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          // qwen3.5-plus thinking tokens - skip silently
        }
        if (delta.content) {
          lastChunkTime = Date.now(); // 每次收到真实 chunk 时更新时间
          _processContentChunk(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }

        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason) log.info('finishReason', { finishReason, toolCallsLen: toolCalls.filter(Boolean).length });
        if (finishReason === 'stop') sawDone = true;
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
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
              tool_calls: toolCalls.filter(Boolean),
            },
            truncatedMessages,
            onDelta,
            onDone,
            onError,
            onToolEvent,
            flushThinkAtEnd,
          });
          return;
        }
      }
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
    const pseudoToolCalls = caps.supportsTools ? extractPseudoToolCalls(fullText || assistantResponseContent) : [];
    if (pseudoToolCalls.length > 0) {
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
          tool_calls: pseudoToolCalls,
        },
        truncatedMessages,
        onDelta,
        onDone,
        onError,
        onToolEvent,
        flushThinkAtEnd,
      });
      return;
    }
    // 关闭 MiniMax CoT 块并释放暂存正文（非 MiniMax 模型此函数直接跳过）
    if (_thinkTagMode) _flushThinkState();
    onDone(fullText, totalUsage, responseModel);
  } catch (e) {
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
      e.message.includes('invalid params') ||
      (e.message.includes('HTTP 400') && e.message.includes('tool')) ||
      (e.message.includes('HTTP 401') && e.message.includes('tool')) ||
      (e.message.includes('HTTP 403'))
    );

    if (isToolError) {
      log.error('工具调用错误，不进行 fallback', { error: e?.message || String(e) });
      onError(e);
      return;
    }

    if (canFallbackToBailian) {
      log.warn('MiniMax API failed, fallback to Bailian MiniMax', { error: e?.message || String(e) });
      const prevProvider = config.currentProvider;
      const prevModel = config.DASHSCOPE_MODEL;
      config.currentProvider = 'bailian-coding';
      config.DASHSCOPE_MODEL = 'MiniMax-M2.5';
      try {
        await streamChat({ messages: truncatedMessages, onDelta, onDone, onError, onToolEvent });
      } finally {
        config.currentProvider = prevProvider;
        config.DASHSCOPE_MODEL = prevModel;
      }
    } else if (canFallbackToDeepseek) {
      log.warn('primary provider failed, fallback to deepseek', { error: e?.message || String(e) });
      const prevProvider = config.currentProvider;
      const prevModel = config.DASHSCOPE_MODEL;
      config.currentProvider = 'deepseek';
      config.DASHSCOPE_MODEL = 'deepseek-chat';
      try {
        await streamChat({ messages: truncatedMessages, onDelta, onDone, onError, onToolEvent });
      } finally {
        config.currentProvider = prevProvider;
        config.DASHSCOPE_MODEL = prevModel;
      }
    } else {
      log.error('streamChat error', { error: e?.message || String(e) });
      onError(e);
    }
  }
}

module.exports = { streamChat, loadSystemPrompt, truncateHistory, getContextUsageRatio };
