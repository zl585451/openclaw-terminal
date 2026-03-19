const config = require('./config');
const { TOOL_DEFINITIONS, executeTool } = require('./tools');
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
    'qwen3-max-2026-01-23': 128000,
    'qwen-vl-max': 32768,
    'qwen2-vl-7b': 32768,
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
            // 注入到 bootMemory 开头，让 AMY 一启动就知道
            const parkingNotice = `\n## ⚠️ 停车场提醒（上次会话未完成的事）\n${
              undoneItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
            }\n\n请在少爷第一条消息后，用一句话提醒他还有这些待处理的事。`;

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

AMY 通过以下方式操作记忆，直接在回复中描述操作意图，
Gateway 会自动处理实际的 API 调用：

**写入记忆**（遇到以下情况自动触发）：
- 少爷说「记住」「记下来」「停车」→ 立即写入
- 发现重要的工作习惯/偏好/决策 → 静默写入
- 少爷纠正我 → 写入 core://agent/corrections

写入格式：
URI 路径：core://my_user/[分类]/[具体节点]
内容：简洁的结构化文本或 JSON

**读取记忆**（遇到以下情况触发）：
- 少爷问「你还记得」「之前说的」→ 读取相关节点
- /memory read core://xxx → 读取指定节点

**搜索记忆**：
- /memory search 关键词 → 搜索相关记忆

**不要做的事**：
- 不要频繁读取记忆（每次对话最多 3 次读取操作）
- 不要在一次回复里写入超过 2 个记忆节点
- 不要读取任务看板节点（前端组件会自动处理）

---

## 🔧 工具（AMY 可以使用）

**搜索工具**：
- web_search(query) — 搜索互联网（遇到需要最新信息时使用）
- web_fetch(url) — 读取指定网页

**文件工具**（谨慎使用，执行前说明意图）：
- read_file(path) — 读取文件
- write_file(path, content) — 写入文件
- exec_command(command) — 执行命令

---

## 🏢 工作模式分工

AMY · Cursor · Claude 三角协作：

**AMY 直接处理**：
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
  return [
    memoryContent,
    '\n\n---\n\n',
    clarification ? clarification + '\n\n---\n\n' : '',
    adaptiveSystem ? adaptiveSystem + '\n\n---\n\n' : '',
    nocturneInstructions,
  ].join('');
}

async function streamChat({ messages, onDelta, onDone, onError }) {
  // 统一用 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL
  // 因为切换平台时直接改这两个变量就够了
  const apiKey = config.DASHSCOPE_API_KEY || config.DEEPSEEK_API_KEY;
  const baseUrl = config.DASHSCOPE_BASE_URL;
  const model = config.DASHSCOPE_MODEL;

  // 上下文截断优化：防止消息过长
  const truncatedMessages = truncateHistory(messages);
  getContextUsageRatio(truncatedMessages, model);

  // 保留 DeepSeek 作为 fallback（百炼失败时切换）
  // 只有在 DEEPSEEK_API_KEY 存在且 baseUrl 不是 deepseek 时才 fallback
  const canFallbackToDeepseek = !!(config.DEEPSEEK_API_KEY)
    && !baseUrl.includes('deepseek');

  // 根据 baseUrl 判断服务商名称
  const providerName = (() => {
    const url = baseUrl || '';
    if (url.includes('coding.dashscope')) return 'bailian-coding';
    if (url.includes('dashscope')) return 'bailian';
    if (url.includes('deepseek')) return 'deepseek';
    if (url.includes('openai')) return 'openai';
    if (url.includes('groq')) return 'groq';
    if (url.includes('volces')) return 'volces';
    if (url.includes('localhost') || url.includes('127.0.0.1')) return 'local';
    return 'custom';
  })();

  log.info('request start', { provider: providerName, model, messages: Array.isArray(truncatedMessages) ? truncatedMessages.length : 0 });

  if (!apiKey) {
    onError(new Error('API Key 未配置'));
    return;
  }

  try {
    const hasImage = truncatedMessages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(c => c.type === 'image_url')
    );
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: truncatedMessages,
        stream: true,
        stream_options: { include_usage: true },
        tools: hasImage ? undefined : TOOL_DEFINITIONS,
        tool_choice: hasImage ? undefined : 'auto',
        max_tokens: 4096,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(120000),
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
    let fullText = '';
    let toolCalls = [];
    let totalUsage = null;
    let sawDone = false;

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

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          // qwen3.5-plus thinking tokens - skip silently
        }
        if (delta.content) {
          fullText += delta.content;
          onDelta(delta.content);
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
        if (finishReason === 'stop') sawDone = true;
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          log.info('tool_calls', { count: toolCalls.filter(Boolean).length });
          const toolResults = [];
          for (const tc of toolCalls.filter(Boolean)) {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            log.info('tool call', { name: tc.function.name, args });
            const result = await executeTool(tc.function.name, args);
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
          await streamChat({ messages: continuedMessages, onDelta, onDone, onError });
          return;
        }
      }
    }

    if (!sawDone) {
      log.warn('stream interrupted', { outputLen: (fullText || '').length });
    } else {
      log.debug('stream end');
    }
    log.info('request done', { outputLen: (fullText || '').length, usage: totalUsage || null });
    onDone(fullText, totalUsage);
  } catch (e) {
    // 只有在百炼失败且有 DeepSeek Key 时才 fallback
    if (canFallbackToDeepseek) {
      log.warn('primary provider failed, fallback to deepseek', { error: e?.message || String(e) });
      const prevBaseUrl = config.DASHSCOPE_BASE_URL;
      const prevModel = config.DASHSCOPE_MODEL;
      const prevKey = config.DASHSCOPE_API_KEY;
      config.DASHSCOPE_BASE_URL = config.DEEPSEEK_BASE_URL;
      config.DASHSCOPE_API_KEY = config.DEEPSEEK_API_KEY;
      config.DASHSCOPE_MODEL = 'deepseek-chat';
      try {
        await streamChat({ messages: truncatedMessages, onDelta, onDone, onError });
      } finally {
        config.DASHSCOPE_BASE_URL = prevBaseUrl;
        config.DASHSCOPE_API_KEY = prevKey;
        config.DASHSCOPE_MODEL = prevModel;
      }
    } else {
      log.error('streamChat error', { error: e?.message || String(e) });
      onError(e);
    }
  }
}

module.exports = { streamChat, loadSystemPrompt, truncateHistory, getContextUsageRatio };
