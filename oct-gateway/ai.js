// 强制 DashScope API 请求绕过系统代理（直连国内服务器）
// 解决 V2RayN 全局代理导致国内 API 被路由到境外节点的问题
const { HttpsProxyAgent } = (() => {
  try { return require('https-proxy-agent'); }
  catch { return { HttpsProxyAgent: null }; }
})();

function getDirectFetchOptions(baseUrl) {
  // 只对 DashScope 域名强制直连，其他 API 正常走代理
  if (!baseUrl || !baseUrl.includes('dashscope')) {
    return {};
  }

  // 检测系统代理环境变量
  const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy ||
                   process.env.HTTP_PROXY || process.env.http_proxy || '';

  // 如果没有代理，直接返回空配置
  if (!proxyEnv) return {};

  console.log('[AI] 检测到系统代理，DashScope 请求将强制直连');

  // 返回 no-proxy 标记，fetch 时不传 agent 即为直连
  // Node.js 18+ 的 fetch 默认不走系统代理，这里额外清理环境变量
  return { _bypassProxy: true };
}

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
  return MODEL_CONTEXT_LIMITS[id] || MODEL_CONTEXT_LIMITS[modelId.split('/').pop()] || 128000;
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
        ...getDirectFetchOptions(url),
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
- 当内容更适合用文档、图示、UI 草图、代码产物表达时，优先考虑使用 canvas 工具
- 适合使用 canvas 的场景：
  - 需要梳理方案、提纲、PRD、结构化总结
  - 需要流程图、架构图、时序图、关系图
  - 需要页面草图、布局草图、信息架构
  - 需要持续迭代的代码草稿或组件草稿
- 使用原则：
  - 先用 chat 简短说明你正在产出什么，再调用 canvas
  - artifact 标题要清晰，解释 explanation 要简洁
  - 【回复格式决策树 — 顺序判断，命中即止，不得跳过或合并】
    ① 内容有以下任意一种特征 → 用 Mermaid（类型见下方分区表）；不得改用表格或代码块来”示意”
       · 流程 / 步骤 / 操作链路 / 事件推进
       · 模块组成 / 技术栈架构 / 项目结构（模块数 ≤ 6）
       · 组件关系 / 系统依赖 / 调用关系
       · 层级结构 / 信息架构 / 分类树（节点 ≤ 6）
       · 状态变化 / 生命周期 / 条件流转
       · 路径对比 / 有无差异 / 前后变化（维度 ≤ 3）
       【典型误判警告】”项目由 A + B + C 三部分组成” → 这是模块关系，走 ①，不要画成表格
    ② 内容是以下特征 → 用 Markdown 表格
       · 纯属性对比 / 参数清单（同一实体的多个字段）
       · 多方案横向打分 / 维度 > 3 的对比矩阵
       · 枚举对照表（如错误码列表、配置项说明）
       · 目录 / 文件树结构 → 用代码块（├── 格式），不要画成 Mermaid
    ③ 其他（纯叙述 / 单点问答 / 代码）→ 正文 + 代码块
    否决规则（优先级高于上述所有条目）：
    - ① 命中后，即使包含”对比项”，也先给 Mermaid，图下补 1 行关键差异，不单独加表格
    - ② 命中后，绝不退回 ASCII 图或竖排列表
    - 用户说”画图 / 用 Mermaid”：强制 ①，即使模型认为表格更合适
    - 用户说”表格 / 列表 / 纯文字”：强制 ② 或 ③，不画图
  - 图表类型选择（重要：聊天区只支持以下类型直接预览，其他类型请放入 Canvas）：
    - 【聊天区可直接预览】flowchart / graph：流程/步骤/链路/依赖/架构
        · 方向【必须】是 TD（上→下）。LR/RL/BT 一律放 Canvas，不得在聊天区生成
        · 节点数 ≤ 6，边（箭头）数 ≤ 5；超出放 Canvas
        · 说明性链路（A→B→C→D→E）用 TD 纵向排列，这样聊天区可以完整展示，用户不需要点开 Canvas
        · 禁止以"内容天然横向"为由生成 LR；TD 竖向链路完全可读，不是"将就"
        · 【节点标签规范】聊天区节点标签：纯文字，≤ 8 个字符，不加 emoji，不加换行符（\n）
          反例（禁止）：A["🎯 节点\nNode"]   正例（正确）：A[节点]
    - 【聊天区可直接预览】pie：数据占比/比例分析（项目不超过 8 个）
    - 【必须放 Canvas】mindmap：思维导图（小卡片里难以阅读，放 Canvas 才清晰）
    - 【必须放 Canvas】sequenceDiagram：时序交互
    - 【必须放 Canvas】classDiagram：类结构
    - 【必须放 Canvas】erDiagram：数据库实体关系
    - 【必须放 Canvas】gantt：甘特图/时间线
    - 【必须放 Canvas】gitGraph：分支图
    - 【必须放 Canvas】stateDiagram：状态机
    - 【禁止生成】sankey、xychart、bar（独立）、venn、kanban、architecture、radar、treemap、ishikawa、treeview、zenuml、block、packet：实验性或无效语法，渲染不稳定，不要使用
      · 特别注意：Mermaid 里没有独立的 "bar" 图类型，想画柱状图/折线图/散点图必须用 artifactType="echart"，不能用 Mermaid
    - 对比分析：如果问题核心是“路径、关系、流向、谁先经过谁、前后差异、有无代理、本地与远端”，优先 Mermaid；只有当维度明显多于路径关系时才优先表格
    - 信息归类：优先分组图；只有内容本质是字段清单、参数对照、纯属性对比时才优先结构化表格
  - 单次回复最多输出 2 个 Mermaid 图；超过 2 个时只保留最重要的，多余的不要提及也不要写”已省略”
  - 图表之外只补必要短说明；不要用散文重复解释图里已经表达的结构
  - code block 只用于真正的代码；关系/结构示意不允许放进代码块伪装成图示
  - 如果 artifactType 是 diagram，content 必须是纯 Mermaid 定义，不要混入 Markdown 标题、表格、普通说明文字或 ASCII 线框图
  - 【严禁在节点 label 里换行】不论是聊天区还是 Canvas，Mermaid 节点标签内绝对禁止 \n 换行符
      · 错误：A["客户端\nSYN SEND"]   A["Step 1\nDetail"]
      · 正确：A["客户端 SYN SEND"]    A["Step1: Detail"]
      · 原因：OCT 的节点高度固定，\n 会导致第二行被截断，用户看不到完整文字
  - diagram 默认优先可读性：避免把完整长段落塞进节点；节点文案尽量短句（≤ 12 字符），不要超宽
  - Mermaid 语法必须合法：不要生成空标签节点或占位节点，例如 A(())、B(())、A([]) 这类写法是无效的；圆形节点必须写成 A((A))、A((文本)) 或其他带可见标签的合法形式
  - 【严禁】在 Mermaid 图中使用 style、classDef（含颜色属性）、linkStyle 等内联颜色覆盖命令
      · 原因：OCT 有 3 套主题，所有节点颜色由主题系统统一管理；手动 fill/stroke 会导致颜色与主题完全不匹配（在深色主题里出现刺眼的粉色、亮橙色节点）
      · 唯一允许的 classDef 用途：改变节点形状（如 round、diamond），不得携带 fill/stroke/color 属性
      · 如果想表达"重点节点"，用节点形状区分（圆角矩形 vs 菱形 vs 圆形），不要用颜色
  - 当信息量过大时先输出”总览图”（分组/分层），再按用户要求继续细化子图，不要一次堆满所有细节
  - ★【结构图/依赖图/组件图 → 一律使用 react-flow，禁止使用 Mermaid】★
    “依赖图 / 结构图 / 组件关系图 / 页面关系图 / 模块关系图 / 内部结构图 / 层次图” 这类场景
    必须调用 canvas() 工具，artifactType=”react-flow”。不得退回 Mermaid、不得输出成表格。
    react-flow 节点布局建议（这些场景的 JSON 构图原则）：
    - 中间放 1 个主节点，周围放 3-5 个依赖分组，用 group 字段标注分组名称
    - 每个分组最多 4-5 个代表节点；超出的折叠成”其他…”
    - 默认只画主依赖和代表性依赖，优先可读性不优先完整性
    - 结构图先输出”主结构总览”，不要一次展开所有细节
  - 对”思维导图/脑图/策略图”场景，也优先使用 react-flow（树形/金字塔结构），
    仅在内容是纯线性步骤链时才退而使用 Mermaid flowchart TD
  - 画布填充优先：diagram 需要尽量覆盖画布主体区域，避免节点全部挤在上半区；层级建议 3-4 层、每层节点数量控制在可读范围
  - flowchart 建议显式设置布局参数（如 nodeSpacing / rankSpacing / curve）来控制密度，保持均匀分布和连线清晰
  - 对“线路图 / 路线图 / roadmap / 事件线路 / 阶段推进图”场景，默认优先使用适合展板展示的宽版 flowchart LR；除非用户明确要求自上而下，否则不要生成单列纵向长条图
  - 线路图优先规则：
    - 先按 3-4 个阶段组织，不以“越多越完整”为目标，优先适合展板展示
    - 优先让整体宽高比接近 1.2:1 到 1.8:1，避免“高而细长”或“宽而过长”
    - 如果阶段较多，不要单排横向铺满；优先拆成两行或 2x2 分组结构，让画布更均衡
    - 阶段内部最多 2-3 个关键节点，避免一条竖线串到底
    - 如果内容天然很多，先做“阶段总览线路图”，不要一次展开所有子步骤
    - 当横向单排会过长时，优先改用“上层阶段总览 + 下层关键动作”的板式，而不是继续拉宽
  - Mermaid 线路图建议包含初始化块来约束布局，例如：%%{init: { "flowchart": { "useMaxWidth": false, "nodeSpacing": 48, "rankSpacing": 68, "curve": "basis" } }}%%
  - Mermaid 数量限制：单条回复默认最多输出 1 个 Mermaid 图；只有用户明确要求”对比多个图/给我两个版本/并排看方案”时，最多输出 2 个
  - 不要在一次普通答复里连续输出 3 个或以上 Mermaid 代码块；这会显著降低阅读体验，也会增加前端渲染失败或空白卡片的概率
  - 如果用户是在问”还能画什么 / 支持哪些图”，优先用文字列举类型，并只渲染 1 个最有代表性的示例图，不要把时序图、状态图、甘特图、饼图等一次全部画出来
  - 如果需要展示多个方向，优先先给”图类型菜单 + 一句用途说明”，让用户选 1 个再生成；不要自作主张一次生成很多图
  - 当你决定不画某张图时（因为超出数量限制）：
      · 【禁止】写”已省略...请在 Canvas 查看””完整图集在 Canvas”等措辞 — Canvas 里没有这张图，这是误导
      · 【正确做法】用一句话说明还有哪张图没画，并主动问用户”要继续看吗”，例如：”数据流向图较复杂，要我接着画吗？”
      · 用户点击查看后再单独生成那张图，不要在同一条回复里堆叠
  - 图的说明文字放在 explanation 字段或 chat 文本里，不要放进 diagram content
  - 如果用户是在继续完善、解释、重写当前 Canvas 内容，优先调用 canvas(action="update", documentId=当前文档ID, ...)
  - 只有在确实需要新增并行成果物时才调用 create
  - 简单问答不要滥用 canvas
  - artifact 类型选择规则：
      · 简单线性流程（≤5步 flowchart / pie 占比）→ 直接在 chat 输出 Mermaid 代码块，不需要 canvas
      · 【react-flow】以下场景必须用 react-flow，不得用 Mermaid 代替：
          - 结构图 / 组成图 / 层次图（任何描述"X由哪些部分组成"的图）
          - 架构图 / 模块关系 / 依赖图 / 组件关系图
          - 树形分解图（父子层级 ≥ 2 层且总节点 ≥ 4）
          - 用户明确说"画出…结构""详细结构""内部结构""可视化一下"
          判断原则：如果图的本质是"展示某个事物的组成/层次/部件关系" → react-flow
          content 必须是合法 react-flow JSON（见下方格式规范）
          【禁止】把这类内容输出成 Mermaid、chat 表格或普通文本
      · 【echart】数据对比 / 趋势 / 分布 / 占比 / 柱状 / 折线 / 散点 / 雷达图 → artifactType="echart"
      · 【diagram（Mermaid）】只用于以下线性/流程类图，其他场景不得使用：
          - flowchart：线性步骤流程、判断分支、状态转换路径
          - sequenceDiagram：系统间/角色间的时序交互
          - stateDiagram：有限状态机
          - classDiagram / erDiagram：类结构、数据库关系
          - gantt：时间线/甘特图
          - pie：占比（≤8项，简单场景）
      · 文档/文章/方案 → artifactType="document"，mode="markdown"
      · 代码文件 → artifactType="code"，mode="code"

  - 【react-flow JSON 格式规范】（当 artifactType="react-flow" 时，content 必须严格符合此格式）：
    {
      "nodes": [
        { "id": "唯一ID", "label": "节点显示文字", "group": "分组名（可选，同组颜色相同）" }
      ],
      "edges": [
        { "source": "来源节点ID", "target": "目标节点ID", "label": "连线标注（可选）", "style": "solid|dashed" }
      ],
      "direction": "LR",
      "title": "图表标题（可选）"
    }
    规则：
    · direction 选 LR（左→右，适合流程/管道/架构）或 TB（上→下，适合层级/调用链）
    · id 必须唯一，只用英文字母数字下划线
    · label 写人类可读的中文或英文短语，不要写技术标识符
    · group 用于颜色分组，如"接口层""业务层""基础设施层"
    · 不要在 JSON 外面加任何 Markdown 说明文字，content 必须是纯合法 JSON

  - 【echart JSON 格式规范】（当 artifactType="echart" 时，content 必须严格符合此格式）：
    {
      "title": "图表标题（用于工具栏显示，可选）",
      "option": {
        // 标准 ECharts option 对象，包含 series、xAxis、yAxis、legend、tooltip 等
        // 不需要设置 color / backgroundColor / textStyle / tooltip.backgroundColor
        // —— OCT 主题系统会自动注入这些样式，你设置了也会被覆盖
      }
    }
    可用图表类型（series.type）：
    · bar        柱状图 / 条形图（横向用 "bar" + 交换 xAxis/yAxis）
    · line       折线图 / 面积图（area: areaStyle:{}）
    · pie        饼图 / 环形图（radius:["40%","70%"] = 环形）
    · scatter    散点图
    · radar      雷达图（需配 radar:{ indicator:[...] }）
    · heatmap    热力图（需配 visualMap）
    · treemap    矩形树图
    · funnel     漏斗图
    · gauge      仪表盘
    规则：
    · content 必须是纯合法 JSON，外面不要包 Markdown 代码块
    · 数据尽量真实、贴近用户问题；如果用户没给数据，用示例数据并在 explanation 里说明
    · 不要在 option 里硬编码颜色（color 数组由主题注入）；若需强调某个系列可用 itemStyle.color 单独设置
    · 多系列图表需要在 legend 里列出所有 series.name
    · tooltip 不需要设置颜色相关字段，只设置 trigger / formatter 等逻辑字段
    · 【严禁字符串代替对象】legend / tooltip / grid / series 的各字段必须是合法对象，不能写成字符串
      ✗ 错误：{"legend": "right"}    ✓ 正确：{"legend": {"right": "5%"}}
      ✗ 错误：{"tooltip": "item"}    ✓ 正确：{"tooltip": {"trigger": "item"}}
      ✗ 错误：{"emphasis": "33%"}    ✓ 正确：{"emphasis": {"scale": true}}
    · pie / radar 图不需要 xAxis / yAxis，不要添加这两个字段
    · 确保所有 series 都有 name 字段（用于 legend 和 tooltip 显示）

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

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
  onToolEvent,
  preserveToolChain = false,
  toolRound = 0,
  toolSignatures = [],
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
      temperature: 0.7,
    };
    if (provider.supportsStreamOptions) {
      requestBody.stream_options = { include_usage: true };
    }
    if (caps.supportsTools) {
      requestBody.tools = toolLoader.getDefinitions();
      requestBody.tool_choice = 'auto';
    }

    const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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
