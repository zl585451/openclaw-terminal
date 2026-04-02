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

// ═══════════════════════════════════════════════════════════════
// AI 上下文截断优化
// ═══════════════════════════════════════════════════════════════
const MAX_HISTORY_ROUNDS = 12; // 最多保留最近 12 轮对话
const MAX_CONTEXT_CHARS = 60000; // 上下文字符上限（约 15k tokens）

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
        log.warn('请求超时（120秒），触发 abort');
      }, 120000);

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

function clampPromptBlock(title, text, maxChars) {
  const raw = (text || '').trim();
  if (!raw) return '';
  const clamped = raw.length > maxChars ? raw.slice(0, maxChars) + '\n\n（已截断）' : raw;
  return `## ${title}\n\n${clamped}\n`;
}

function buildSystemPrompt(memoryContent, source, promptsDir) {
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

AI 通过以下方式操作记忆，直接在回复中描述操作意图，
Gateway 会自动处理实际的 API 调用：

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

**不要做的事**：
- 不要频繁读取记忆（每次对话最多 3 次读取操作）
- 不要在一次回复里写入超过 2 个记忆节点
- 不要读取任务看板节点（前端组件会自动处理）

---

## 🔧 工具（AI 可以使用）

**搜索工具**：
- web_search(query) — 搜索互联网（遇到需要最新信息时使用）
- web_fetch(url) — 读取指定网页

**文件工具**（谨慎使用，执行前说明意图）：
- read_file(path) — 读取文件
- write_file(path, content) — 写入文件
- exec_command(command) — 执行命令

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

async function streamChat({ messages, onDelta, onDone, onError, onToolEvent }) {
  const provider = config.getProviderConfig();
  const apiKey = provider.apiKey;
  const baseUrl = provider.baseUrl;
  const model = config.DASHSCOPE_MODEL;

  // 上下文截断优化：防止消息过长
  const truncatedMessages = truncateHistory(messages);
  getContextUsageRatio(truncatedMessages, model);

  // 保留 DeepSeek 作为 fallback（百炼失败时切换）
  const canFallbackToDeepseek = !!(config.DEEPSEEK_API_KEY)
    && !baseUrl.includes('deepseek');
  
  // MiniMax 官方 API 失败时，fallback 到百炼版 MiniMax
  const canFallbackToBailian = baseUrl.includes('minimaxi.com') 
    && !!(config.DASHSCOPE_API_KEY);

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
  try {
    const hasImage = truncatedMessages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(c => c.type === 'image_url')
    );

    // 从 provider 或 MODEL_REGISTRY 获取模型能力
    const modelDef = provider.models.find(m => m.id === model);
    // modelDef.tools 可能为 undefined（loadAvailableModels 返回的简化对象没有 tools 字段）
    // 此时 fallback 到 MODEL_REGISTRY（getModelCaps）获取真实能力
    const registryCaps = config.getModelCaps(model);
    const caps = modelDef
      ? {
          supportsTools: modelDef.tools !== undefined ? modelDef.tools : registryCaps.supportsTools,
          supportsStreamOptions: provider.supportsStreamOptions,
          supportsThinking: registryCaps.supportsThinking ?? false,
          thinkingFormat: registryCaps.thinkingFormat ?? null,
          maxTokens: modelDef.maxTokens || registryCaps.maxTokens || 4096,
        }
      : registryCaps;
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
    const OPEN_THINK = '<redacted_thinking>';
    const CLOSE_THINK = '</redacted_thinking>';

    /** 返回 s 末尾与 tag 前缀重叠的最长子串（处理跨 chunk 的残缺标签） */
    function _findPartialTag(s, tag) {
      for (let len = Math.min(s.length, tag.length - 1); len > 0; len--) {
        if (tag.startsWith(s.slice(-len))) return s.slice(-len);
      }
      return '';
    }

    /** 处理一个 content chunk，区分思考内容和正文内容 */
    function _processContentChunk(raw) {
      if (!_thinkTagMode) {
        fullText += raw;
        onDelta(raw);
        return;
      }

      let s = _thinkState.pendingTag + raw;
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
        _thinkState.cotOpen = false;

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
    if (caps.supportsTools && !hasImage) {
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

    // 心跳计时器：每 5 秒检查，超过 12 秒无新内容时发零宽空格，防止代理切断连接
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
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }

        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason) log.info('finishReason', { finishReason, toolCallsLen: toolCalls.filter(Boolean).length });
        if (finishReason === 'stop') sawDone = true;
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          stopHeartbeat();
          if (_thinkTagMode) _flushThinkState();
          log.info('tool_calls', { count: toolCalls.filter(Boolean).length });
          const toolResults = [];
          for (const tc of toolCalls.filter(Boolean)) {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            log.info('tool call', { name: tc.function.name, args });
            const toolName = tc.function.name;
            if (onToolEvent) {
              try { onToolEvent({ type: 'tool_call', tool: toolName, args, callId: tc.id, state: 'executing' }); } catch {}
            }
            const result = await Promise.race([
              toolLoader.executeTool(toolName, args),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`工具 ${toolName} 超时（30秒）`)), 30000)
              )
            ]).catch(e => {
              log.error(`工具 ${toolName} 执行失败: ${e.message}`);
              if (onToolEvent) {
                try { onToolEvent({ type: 'tool_result', tool: toolName, callId: tc.id, state: 'error', error: e.message }); } catch {}
              }
              return `工具执行失败: ${e.message}，请稍后重试或换个方式表达需求。`;
            });
            if (onToolEvent) {
              try { onToolEvent({ type: 'tool_result', tool: toolName, callId: tc.id, state: 'done', resultPreview: JSON.stringify(result).slice(0, 200) }); } catch {}
            }
            toolResults.push({
              tool_call_id: tc.id,
              role: 'tool',
              content: JSON.stringify(result),
            });
          }

          const continuedMessages = [
            ...truncatedMessages,
            { role: 'assistant', content: fullText || null, tool_calls: toolCalls.filter(Boolean) },
            ...toolResults,
          ];
          await streamChat({ messages: continuedMessages, onDelta, onDone, onError, onToolEvent });
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
