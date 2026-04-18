const fs = require('fs');
const path = require('path');
const os = require('os');

function buildChatHeaders(baseUrl, apiKey) {
  const target = String(baseUrl || '');
  if (target.includes('aiplatform.googleapis.com')) {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function classifyProbeFailure(message) {
  const m = String(message || '').toLowerCase();
  const hints = [
    'tool',
    'function calling',
    'function_call',
    'tool_calls',
    'tool_choice',
    'unrecognized request argument',
    'unknown field',
    'does not support',
    'not supported',
    'invalid parameter',
  ];
  return hints.some((token) => m.includes(token)) ? 'unsupported' : 'unknown';
}

async function probeModelToolsSupport({ provider, model, apiKey, baseUrl, config }) {
  if (!apiKey || !baseUrl) {
    return { toolsSupport: 'unknown', capabilitySource: 'runtime_probe_skipped' };
  }
  const probeToolName = 'oct_capability_probe_noop';
  const endpoint = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    stream: false,
    max_tokens: 1,
    messages: [
      { role: 'system', content: 'You are running a capability probe.' },
      { role: 'user', content: 'Call the probe function now.' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: probeToolName,
          description: 'Capability probe noop tool.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    tool_choice: {
      type: 'function',
      function: { name: probeToolName },
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildChatHeaders(baseUrl, apiKey),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const choice = json?.choices?.[0] || {};
    const finishReason = String(choice?.finish_reason || '');
    const toolCalls = choice?.message?.tool_calls;
    const toolsSupport = (Array.isArray(toolCalls) && toolCalls.length > 0) || finishReason === 'tool_calls'
      ? 'supported'
      : 'unknown';
    const entry = config.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    });
    return entry || { toolsSupport, capabilitySource: 'runtime_probe' };
  } catch (e) {
    const toolsSupport = classifyProbeFailure(e?.message || String(e));
    const entry = config.setProbeCacheEntry?.({
      providerId: provider.id,
      baseUrl,
      modelId: model,
      toolsSupport,
      capabilitySource: 'runtime_probe',
    });
    return entry || { toolsSupport, capabilitySource: 'runtime_probe' };
  }
}

class SlashHandler {
  constructor({
    session,
    memory,
    memoryFeedback,
    config,
    aiLibrary,
    tools,
    systemPromptReady,
    logger,
  }) {
    this.session = session;
    this.memory = memory;
    this.memoryFeedback = memoryFeedback;
    this.config = config;
    this.aiLibrary = aiLibrary;
    this.tools = tools;
    this.systemPromptReady = systemPromptReady;
    this.log = logger;
  }

  async handle(command, request, connection) {
    const parts = command.split(/\s+/);
    const base = (parts[0] || '').toLowerCase();
    const sessionKey = request?.params?.sessionKey || 'main';

    if (base === '/new' || base === '/reset') {
      this.session.clearSession(sessionKey);
      this.session.clearThinkMode(sessionKey);
      this.reply(connection, '✅ 会话已重置，记忆已清空。');
      return;
    }

    if (base === '/status') {
      const sp = await this.systemPromptReady;
      const sessions = this.session.listSessions();
      const nocturneAlive = await this.memory.isAlive();
      const aiLibEnabled = (this.config.ai_library || {}).enabled !== false;
      const aiLibraryAlive = aiLibEnabled
        ? await this.aiLibrary.checkHealth().catch(() => false)
        : false;
      const currentHistory = this.session.getHistory(sessionKey);
      const historyChars = currentHistory.reduce((acc, message) => acc + (message.content?.length || 0), 0);
      const estimatedTokens = Math.round(historyChars / 2);
      const systemPromptTokens = Math.round(sp.length / 2);
      const totalEstimated = estimatedTokens + systemPromptTokens;
      const provider = this.config.getProviderConfig();
      const modelDef = provider.models.find((model) => model.id === this.config.DASHSCOPE_MODEL);
      const registryCaps = this.config.getModelCaps(this.config.DASHSCOPE_MODEL);
      let probeCaps = this.config.getProbeCacheEntry
        ? this.config.getProbeCacheEntry({
            providerId: provider.id,
            baseUrl: provider.baseUrl,
            modelId: this.config.DASHSCOPE_MODEL,
          })
        : null;
      let toolsSupport = modelDef && modelDef.tools !== undefined
        ? (modelDef.tools ? 'supported' : 'unsupported')
        : (probeCaps?.toolsSupport || registryCaps.toolsSupport || (registryCaps.supportsTools ? 'supported' : 'unknown'));
      if (toolsSupport === 'unknown' && provider.apiKey && provider.baseUrl) {
        probeCaps = await probeModelToolsSupport({
          provider,
          model: this.config.DASHSCOPE_MODEL,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          config: this.config,
        }).catch((err) => {
          this.log.warn('status probe failed', { error: err?.message || String(err) });
          return null;
        });
        if (probeCaps?.toolsSupport) toolsSupport = probeCaps.toolsSupport;
      }

      const hasExplicitModelTools = modelDef && modelDef.tools !== undefined;
      const capabilitySource = hasExplicitModelTools
        ? 'provider_model_def'
        : (probeCaps?.capabilitySource || registryCaps.capabilitySource || 'fallback_unknown');
      const effectiveCapabilitySource = capabilitySource;
      const toolSupportLabel = toolsSupport === 'supported'
        ? '✅ supported'
        : toolsSupport === 'unsupported'
          ? '❌ unsupported'
          : '⚠️ unknown（默认禁用执行）';

      this.replyEvent(connection, [
        '🦞 **OCT Gateway**',
        '',
        `📡 Model: \`${this.config.DASHSCOPE_MODEL}\``,
        `🔧 Tool 执行: ${toolSupportLabel}`,
        `🧩 能力来源: \`${effectiveCapabilitySource}\``,
        `🧠 Nocturne: ${nocturneAlive ? '✅ 在线' : '❌ 离线'}`,
        `📚 AI.library：${aiLibraryAlive ? '✅ 在线' : '⚫ 未启动'}`,
        `💬 当前会话：${currentHistory.length} 条消息`,
        `📊 上下文估算：~${totalEstimated.toLocaleString()} tokens（含 system prompt ~${systemPromptTokens.toLocaleString()}）`,
        `🗂️ 所有会话：${sessions.length > 0 ? sessions.join(', ') : 'none'}`,
        `⏱️ Uptime：${Math.round(process.uptime())}s`,
        '',
        '**口令**：`/status` `/model` `/provider` `/memory boot|read|search|status` `/new` `/help`',
      ].join('\n'));
      return;
    }

    if (base === '/model') {
      const modelName = parts.slice(1).join(' ').trim();
      const provider = this.config.getProviderConfig();

      if (!modelName) {
        const modelList = provider.models
          .map((model) => {
            const current = model.id === this.config.DASHSCOPE_MODEL ? ' ◀ 当前' : '';
            const toolTag = model.tools ? '🔧' : '  ';
            const thinkTag = model.thinking ? '🧠' : '  ';
            return `  ${toolTag}${thinkTag} \`${model.id}\`${current}\n       ${model.label}`;
          })
          .join('\n');
        const legend = '\n\n🔧 = 支持工具调用  🧠 = 支持深度思考';
        this.replyEvent(
          connection,
          `当前服务商：${provider.name}\n当前模型：\`${this.config.DASHSCOPE_MODEL}\`\n\n可用模型：\n${modelList || '  （无预设模型，可直接输入 /model 模型名）'}${legend}\n\n切换：\`/model 模型名\``
        );
        return;
      }

      this.config.DASHSCOPE_MODEL = modelName;
      const modelDef = provider.models.find((model) => model.id === modelName);
      const caps = modelDef
        ? {
            supportsTools: modelDef.tools,
            toolsSupport: modelDef.tools ? 'supported' : 'unsupported',
            capabilitySource: 'provider_model_def',
            supportsThinking: modelDef.thinking,
            label: modelDef.label,
          }
        : this.config.getModelCaps(modelName);
      const warnings = [];
      if (caps.toolsSupport !== 'supported') {
        warnings.push('⚠️ 该模型不支持工具调用（天气/搜索/文件操作等功能将暂时不可用）');
      }
      if (caps.toolsSupport === 'unknown') {
        warnings.push(`🧩 该模型能力来源：${caps.capabilitySource || 'fallback_unknown'}（默认按禁用工具处理）`);
      }
      if (caps.supportsThinking) {
        warnings.push('💡 该模型支持深度思考（reasoning），回复可能较慢但质量更高');
      }
      const warningText = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : '';
      this.replyEvent(
        connection,
        `✅ 已切换为：\`${modelName}\`（${caps.label || modelName}）${warningText}`
      );
      return;
    }

    if (base === '/provider') {
      const providerId = parts.slice(1).join(' ').trim().toLowerCase();
      const providers = this.config.PROVIDERS;
      if (!providerId) {
        const list = Object.entries(providers)
          .map(([id, provider]) => {
            const current = id === this.config.currentProvider ? ' ◀ 当前' : '';
            return `  ■ \`${id}\` — ${provider.name}${current}`;
          })
          .join('\n');
        this.replyEvent(
          connection,
          `当前服务商：\`${this.config.currentProvider}\`（${(providers[this.config.currentProvider] || {}).name || '未知'}）\n\n可用服务商：\n${list}\n\n切换：\`/provider 服务商id\`（如 /provider deepseek）\n\n💡 切换后需在设置中填入对应 API Key，并重启 Gateway 生效`
        );
        return;
      }

      if (providers[providerId]) {
        this.config.currentProvider = providerId;
        const provider = providers[providerId];
        this.config.DASHSCOPE_MODEL = provider.defaultModel || this.config.DASHSCOPE_MODEL;
        this.replyEvent(
          connection,
          `✅ 已切换为：\`${providerId}\`（${provider.name}）\n\n当前模型：\`${this.config.DASHSCOPE_MODEL}\`\n\n⚠️ 请在设置中填入 ${provider.name} 的 API Key，并重启 Gateway 使配置生效`
        );
        return;
      }

      this.reply(connection, `未知服务商 \`${providerId}\`，请输入 \`/provider\` 查看可用列表`);
      return;
    }

    if (base === '/memory') {
      await this._handleMemory(parts, connection);
      return;
    }

    if (base === '/export') {
      await this._handleExport(parts, connection);
      return;
    }

    if (base === '/think' || base === '/cot') {
      this._handleThink(parts, sessionKey, connection);
      return;
    }

    if (base === '/help') {
      this.reply(connection, [
        '📋 OCT Gateway 命令：',
        '  /status   — 查看 Gateway 状态',
        '  /model [名称] — 查看/切换模型',
        '  /provider [id] — 查看/切换 AI 服务商',
        '  /memory   — 记忆系统管理',
        '  /think [off/low/medium/high] — 思考模式',
        '  /task add [内容] [p0/p1/p2] — 添加任务',
        '  /task done [序号] — 标记任务完成',
        '  /task list — 列出今日任务',
        '  /task clear — 清空已完成任务',
        '  /new      — 重置当前会话',
        '  /help     — 显示此帮助',
      ].join('\n'));
      return;
    }

    if (base === '/task') {
      await this._handleTask(parts, connection);
      return;
    }

    this.reply(connection, `未知命令：${command}\n输入 /help 查看可用命令`);
  }

  // ═══════════════════════════════════════════════════════════════
  // /think 思考模式
  // ═══════════════════════════════════════════════════════════════

  _handleThink(parts, sessionKey, connection) {
    const level = (parts[1] || '').toLowerCase();
    const validLevels = ['off', 'low', 'medium', 'high'];

    if (!level || !validLevels.includes(level)) {
      const currentLevel = this.session.getThinkMode(sessionKey) || 'off';
      this.reply(connection, [
        '🧠 思考模式',
        '',
        `当前状态：${currentLevel.toUpperCase()}`,
        '',
        '可用级别：',
        '  /cot off    — 关闭思考模式',
        '  /cot low    — 低强度思考引导',
        '  /cot medium — 中等强度思考引导',
        '  /cot high   — 高强度思考引导',
      ].join('\n'));
      return;
    }

    this.session.setThinkMode(sessionKey, level);
    const levelDesc = {
      'off': '已关闭思考模式',
      'low': '已开启低强度思考引导（轻量级提示）',
      'medium': '已开启中等强度思考引导（结构化分析）',
      'high': '已开启高强度思考引导（深度推理）',
    };
    this.reply(connection, `🧠 ${levelDesc[level]}\n\n下次对话将应用此设置。`);
  }

  // ═══════════════════════════════════════════════════════════════
  // /memory 记忆管理（8 个子命令）
  // ═══════════════════════════════════════════════════════════════

  async _handleMemory(parts, connection) {
    const subCmd = (parts[1] || '').toLowerCase();
    const mem = this.memory;

    if (subCmd === 'boot') {
      const alive = await mem.isAlive();
      if (!alive) {
        this.reply(connection, '❌ Nocturne 后端不可用，请检查是否已启动');
        return;
      }
      const coreUris = ['core://agent/identity', 'core://my_user/profile', 'core://agent/my_user'];
      const bootContent = await mem.loadBootMemory(coreUris);
      const bootText = bootContent
        ? `✅ 核心记忆已重载\n\n${bootContent.slice(0, 800)}`
        : '⚠️ 未找到核心记忆';
      this.reply(connection, bootText);
      return;
    }

    if (subCmd === 'search') {
      const query = parts.slice(2).join(' ').trim();
      if (!query) { this.reply(connection, '用法：/memory search <关键词>'); return; }
      const result = await mem.searchMemory(query);
      if (!result.ok || !result.data?.length) {
        this.reply(connection, `🔍 未找到匹配「${query}」的记忆`);
      } else {
        const list = result.data.map(m => `  ${m.uri}`).join('\n');
        this.reply(connection, `🔍 找到 ${result.data.length} 条记忆：\n${list}`);
      }
      return;
    }

    if (subCmd === 'read') {
      const memArg = parts.slice(2).join(' ').trim();
      if (!memArg) {
        this.reply(connection, '用法：/memory read <uri>');
        return;
      }
      const r = await mem.readMemory(memArg, { treat404AsDebug: true });
      const nodeData = r.ok ? r.data : null;
      const content = nodeData?.node?.content || nodeData?.content || '';
      const priority = nodeData?.node?.priority ?? nodeData?.priority ?? '--';
      const disclosure = nodeData?.node?.disclosure || nodeData?.disclosure || '--';
      const text = r.ok
        ? `📖 ${memArg}\n\nPriority: ${priority}\nDisclosure: ${disclosure}\n\n${content || '（空）'}`
        : `❌ ${r.error}`;
      this.reply(connection, text);
      return;
    }

    if (subCmd === 'write') {
      const memArg = parts.slice(2).join(' ').trim();
      const firstSpace = memArg.indexOf(' ');
      const uri = firstSpace >= 0 ? memArg.slice(0, firstSpace).trim() : memArg;
      const content = firstSpace >= 0 ? memArg.slice(firstSpace + 1).trim() : '';
      if (!uri || !content) {
        this.reply(connection, '用法：/memory write core://xxx 内容');
        return;
      }
      const r = await mem.writeMemory(uri, content, 2, '');
      this.replyEvent(connection, r.ok ? `✅ 已写入 ${uri}` : `❌ ${r.error}`);
      return;
    }

    if (subCmd === 'status') {
      const alive = await mem.isAlive();
      this.reply(connection, alive ? '✅ Nocturne Memory 在线' : '❌ Nocturne Memory 离线');
      return;
    }

    if (subCmd === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const r = await mem.readMemory(`core://my_user/history/${todayStr}`, { treat404AsDebug: true });
      if (!r.ok || !r.data) {
        this.reply(connection, `今天（${todayStr}）暂无对话记录`);
        return;
      }
      const children = r.data?.node?.children || r.data?.children || [];
      if (children.length === 0) {
        this.reply(connection, `今天（${todayStr}）暂无对话记录`);
        return;
      }
      const recent = children.slice(-5);
      const lines = [`📅 今天的对话摘要（${todayStr}，共 ${children.length} 条）\n`];
      for (const child of recent) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;
        const cr = await mem.readMemory(`core://${childPath}`, { treat404AsDebug: true });
        if (!cr.ok) continue;
        const content = cr.data?.node?.content || cr.data?.content || '';
        try {
          const parsed = JSON.parse(content);
          const time = (parsed.timestamp || '').slice(11, 16);
          lines.push(`[${time}] 用户：${(parsed.user || '').slice(0, 40)}…\n      AI：${(parsed.amy || '').slice(0, 60)}…`);
        } catch {
          lines.push(content.slice(0, 80));
        }
      }
      this.reply(connection, lines.join('\n'));
      return;
    }

    if (subCmd === 'feedback') {
      const feedbackText = await this.memoryFeedback.loadFeedbackForBoot();
      if (!feedbackText || feedbackText.trim().length < 10) {
        this.reply(connection, '暂无反馈记录');
        return;
      }
      this.reply(connection, feedbackText.replace('## 📌 反馈与纠正（启动时加载）\n\n', '📌 最近反馈记录\n\n'));
      return;
    }

    if (subCmd === 'stats') {
      const alive = await mem.isAlive();
      if (!alive) {
        this.reply(connection, '❌ Nocturne 离线');
        return;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      const historyToday = await mem.readMemory(`core://my_user/history/${todayStr}`, { treat404AsDebug: true });
      const todayCount = (historyToday.data?.node?.children || historyToday.data?.children || []).length;
      const historyRoot = await mem.readMemory('core://my_user/history', { treat404AsDebug: true });
      const totalDays = (historyRoot.data?.node?.children || historyRoot.data?.children || []).length;
      this.reply(connection, [
        '📊 记忆系统统计',
        '',
        `今日对话：${todayCount} 条`,
        `历史天数：${totalDays} 天`,
        `Nocturne：✅ 在线`,
        '',
        '口令：/memory boot|read|search|status|today|feedback|stats',
      ].join('\n'));
      return;
    }

    this.reply(connection, [
      '可用记忆口令：',
      '/memory boot — 重载核心记忆',
      '/memory today — 今天的对话摘要',
      '/memory feedback — 最近反馈记录',
      '/memory stats — 记忆统计',
      '/memory read core://xxx — 读取节点',
      '/memory search 关键词 — 搜索',
      '/memory status — 检查状态',
    ].join('\n'));
  }

  // ═══════════════════════════════════════════════════════════════
  // /export 导出功能
  // ═══════════════════════════════════════════════════════════════

  async _handleExport(parts, connection) {
    const subCmd = parts[1] || '';

    if (subCmd === 'training-data') {
      this.reply(connection, '⏳ 正在导出训练数据，请稍候...');

      try {
        const outputDir = path.join(this.config.PROMPTS_DIR, '..', '..', 'training-data');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        const outputPath = path.join(outputDir, `amy-training-${dateStr}.jsonl`);

        this.log.info('export training-data: read history root');
        const testAlive = await this.memory.isAlive();
        this.log.info('export training-data: nocturne alive', { alive: !!testAlive });

        const historyRoot = await this.memory.readMemory('core://my_user/daily', { treat404AsDebug: true });
        this.log.debug('export training-data: history root result', { preview: JSON.stringify(historyRoot).slice(0, 300) });

        if (!historyRoot.ok) {
          if (historyRoot.error && (historyRoot.error.includes('not found') || historyRoot.error.includes('404'))) {
            this.reply(connection, [
              '⚠️ 暂无历史记录',
              '',
              'core://my_user/daily 路径不存在，',
              '说明对话历史还没有开始写入。',
              '',
              '可能原因：',
              '1. memory_history.js 的 auto_save_history 未开启',
              '2. 历史记录还没有触发写入',
              '',
              '先发几条消息，再试 /export training-data',
            ].join('\n'));
          } else {
            this.reply(connection, `❌ 无法读取历史记录：${historyRoot.error}`);
          }
          return;
        }

        const dateDirs = historyRoot.data?.node?.children || historyRoot.data?.children || [];
        const lines = [];
        let total = 0;
        let exported = 0;

        // 读取自我评估分数
        const evalScores = new Map();
        try {
          const evalRoot = await this.memory.readMemory('core://agent/self_eval', { treat404AsDebug: true });
          if (evalRoot.ok) {
            const evalDates = evalRoot.data?.node?.children || evalRoot.data?.children || [];
            for (const ed of evalDates.slice(-30)) {
              const edPath = ed.path || ed.uri?.replace(/^[^:]+:\/\//, '') || '';
              if (!edPath) continue;
              const edr = await this.memory.readMemory(`core://${edPath}`, { treat404AsDebug: true });
              if (!edr.ok) continue;
              const evalTimes = edr.data?.node?.children || edr.data?.children || [];
              for (const et of evalTimes) {
                const etPath = et.path || et.uri?.replace(/^[^:]+:\/\//, '') || '';
                if (!etPath) continue;
                const etr = await this.memory.readMemory(`core://${etPath}`, { treat404AsDebug: true });
                if (!etr.ok) continue;
                const evalContent = etr.data?.node?.content || etr.data?.content || '';
                try {
                  const evalData = JSON.parse(evalContent);
                  if (evalData.timestamp) {
                    evalScores.set(evalData.timestamp.slice(0, 16), evalData.score || 3);
                  }
                } catch {}
              }
            }
          }
        } catch {}

        // 遍历所有日期目录
        for (const dateDir of dateDirs) {
          const datePath = dateDir.path || dateDir.uri?.replace(/^[^:]+:\/\//, '') || '';
          if (!datePath) continue;

          const dr = await this.memory.readMemory(`core://${datePath}`, { treat404AsDebug: true });
          if (!dr.ok) continue;

          const dayChildren = dr.data?.node?.children || dr.data?.children || [];
          const NON_HISTORY_NODES = ['tasks', 'parking_lot', 'summary', 'cursor_summary', 'intention'];
          const historyEntries = dayChildren.filter(child => {
            const name = child.name || child.path?.split('/').pop() || '';
            return !NON_HISTORY_NODES.includes(name);
          });

          for (const entry of historyEntries) {
            const entryPath = entry.path || entry.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!entryPath) continue;

            const er = await this.memory.readMemory(`core://${entryPath}`, { treat404AsDebug: true });
            if (!er.ok) continue;

            const content = er.data?.node?.content || er.data?.content || '';
            try {
              const data = JSON.parse(content);
              total++;

              const timeKey = (data.timestamp || '').slice(0, 16);
              const score = evalScores.get(timeKey) || 3;
              if (score < 2) continue;
              if (!data.user || !data.amy) continue;
              if (data.user.length < 5 || data.amy.length < 10) continue;

              const trainingItem = {
                messages: [
                  { role: 'system', content: '你是 AI，用户的私人助手和朋友。用中文回复，简洁有温度，称呼用户为"用户"。' },
                  { role: 'user', content: data.user },
                  { role: 'assistant', content: data.amy },
                ],
              };
              lines.push(JSON.stringify(trainingItem));
              exported++;
            } catch {}
          }
        }

        if (lines.length === 0) {
          this.reply(connection, '⚠️ 暂无可导出的数据，继续积累对话后再试');
          return;
        }

        fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

        const reportPath = path.join(outputDir, `amy-training-${dateStr}-report.txt`);
        const report = [
          `导出时间：${new Date().toLocaleString('zh-CN')}`,
          `总对话数：${total} 条`,
          `导出数量：${exported} 条（3分以上）`,
          `过滤数量：${total - exported} 条（低分或太短）`,
          `文件路径：${outputPath}`,
          '',
          '下一步：',
          '1. 打开 https://bailian.console.aliyun.com',
          '2. 进入「模型调优」→「数据集管理」',
          '3. 上传 ' + path.basename(outputPath),
          '4. 选择 qwen-turbo 或 qwen-plus 作为基础模型',
          '5. 开始 SFT 微调训练',
          '',
          `当前进度：${exported} / 1000 条`,
          `距离可微调还需：${Math.max(0, 1000 - exported)} 条`,
        ].join('\n');
        fs.writeFileSync(reportPath, report, 'utf-8');

        this.reply(connection, [
          `✅ 训练数据导出完成！`,
          ``,
          `📊 统计：`,
          `总对话：${total} 条`,
          `导出：${exported} 条（3分以上）`,
          `过滤：${total - exported} 条`,
          ``,
          `📁 文件：`,
          `training-data/amy-training-${dateStr}.jsonl`,
          ``,
          `📈 微调进度：${exported}/1000 条`,
          exported >= 1000
            ? `🎉 数据量已达标，可以开始微调了！`
            : `还需积累 ${1000 - exported} 条高分对话`,
          ``,
          `口令：/export training-data`,
        ].join('\n'));

      } catch (e) {
        this.reply(connection, `❌ 导出失败：${e.message}`);
      }
      return;
    }

    this.reply(connection, [
      '📦 导出功能：',
      '/export training-data — 导出微调训练数据（JSONL格式）',
    ].join('\n'));
  }

  // ═══════════════════════════════════════════════════════════════
  // /task 任务管理（5 个子命令）
  // ═══════════════════════════════════════════════════════════════

  async _handleTask(parts, connection) {
    const subCmd = (parts[1] || '').toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);

    if (subCmd === 'add') {
      const args = parts.slice(2);
      if (args.length === 0) {
        this.reply(connection, '用法：/task add 任务内容 [p0/p1/p2]\n示例：/task add 修复登录Bug p1');
        return;
      }

      let priority = 'p2';
      let content = args.join(' ');
      const lastArg = args[args.length - 1]?.toLowerCase();
      if (lastArg === 'p0' || lastArg === 'p1' || lastArg === 'p2') {
        priority = lastArg;
        content = args.slice(0, -1).join(' ');
      }

      if (!content.trim()) {
        this.reply(connection, '❌ 任务内容不能为空');
        return;
      }

      const result = await this.tools.executeTool('tasks_add', {
        content: content.trim(),
        priority,
      });

      if (result.success) {
        const priorityIcon = priority === 'p0' ? '🔴' : priority === 'p1' ? '🟡' : '🟢';
        this.reply(connection, `✅ 任务已添加\n${priorityIcon} [${priority.toUpperCase()}] ${content.trim()}`);
      } else {
        this.reply(connection, `❌ 添加任务失败: ${result.error}`);
      }
      return;
    }

    if (subCmd === 'done') {
      const index = parseInt(parts[2] || '', 10);
      if (isNaN(index) || index < 1) {
        this.reply(connection, '用法：/task done <序号>\n先用 /task list 查看任务序号');
        return;
      }

      const dataResult = await this.tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        this.reply(connection, '❌ 无法读取任务列表');
        return;
      }

      const pendingTasks = (dataResult.data.tasks || []).filter(t => !t.done);
      if (index > pendingTasks.length) {
        this.reply(connection, `❌ 序号 ${index} 超出范围，当前有 ${pendingTasks.length} 个待办任务`);
        return;
      }

      const task = pendingTasks[index - 1];
      if (!task) {
        this.reply(connection, '❌ 找不到该任务');
        return;
      }

      const updateResult = await this.tools.executeTool('tasks_update', {
        taskId: task.id,
        done: true,
      });

      if (updateResult.success) {
        this.reply(connection, `✅ 任务已完成\n~~${task.content}~~`);
      } else {
        this.reply(connection, `❌ 更新失败: ${updateResult.error}`);
      }
      return;
    }

    if (subCmd === 'list') {
      const dataResult = await this.tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        this.reply(connection, '❌ 无法读取任务列表');
        return;
      }

      const tasks = dataResult.data.tasks || [];
      const intention = dataResult.data.intention || '';

      if (tasks.length === 0) {
        this.reply(connection, `📅 今日任务 (${todayStr})\n\n暂无任务\n\n用 /task add 添加任务`);
        return;
      }

      const pending = tasks.filter(t => !t.done);
      const completed = tasks.filter(t => t.done);

      const lines = [`📅 今日任务 (${todayStr})`];
      if (intention) {
        lines.push(`\n🎯 今日意图：${intention}`);
      }

      lines.push(`\n📋 待办 (${pending.length})`);
      pending.forEach((t, i) => {
        const icon = t.priority === 'p0' ? '🔴' : t.priority === 'p1' ? '🟡' : '🟢';
        const source = t.source === 'amy' ? 'AI' : '用户';
        lines.push(`  ${i + 1}. ${icon} ${t.content} [${source}]`);
      });

      if (completed.length > 0) {
        lines.push(`\n✅ 已完成 (${completed.length})`);
        completed.forEach(t => {
          lines.push(`  ~~${t.content}~~`);
        });
      }

      lines.push('\n口令：/task done <序号> | /task add | /task clear');
      this.reply(connection, lines.join('\n'));
      return;
    }

    if (subCmd === 'clear') {
      const dataResult = await this.tools.executeTool('tasks_read', {});
      if (!dataResult.success) {
        this.reply(connection, '❌ 无法读取任务列表');
        return;
      }

      const completedCount = (dataResult.data.tasks || []).filter(t => t.done).length;
      if (completedCount === 0) {
        this.reply(connection, '✅ 没有任务需要清理');
        return;
      }

      const tasksPath = path.join(os.homedir(), '.openclaw', 'tasks.json');
      try {
        const data = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
        data.tasks = data.tasks.filter(t => !t.done);
        data.updatedAt = new Date().toISOString();
        fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2), 'utf-8');
        this.reply(connection, `✅ 已清理 ${completedCount} 条已完成任务\n刷新任务看板即可生效`);
      } catch (e) {
        this.reply(connection, `❌ 清理失败: ${e.message}`);
      }
      return;
    }

    if (subCmd === 'migrate') {
      const alive = await this.memory.isAlive();
      if (!alive) {
        this.reply(connection, '❌ Nocturne 离线，无法迁移');
        return;
      }

      this.reply(connection, '🔄 正在从 Nocturne 迁移任务数据...');

      const tasksPath = path.join(os.homedir(), '.openclaw', 'tasks.json');
      let localData = { tasks: [], parking: [], intention: '', updatedAt: '' };
      try {
        if (fs.existsSync(tasksPath)) {
          localData = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
        }
      } catch {}

      let migratedTasks = 0;
      let migratedParking = 0;

      try {
        const tasksResult = await this.memory.readMemory(`core://my_user/daily/${todayStr}/tasks`, { treat404AsDebug: true });
        if (tasksResult.ok && tasksResult.data) {
          const children = tasksResult.data?.node?.children || tasksResult.data?.children || [];
          for (const child of children) {
            const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!childPath) continue;
            const taskResult = await this.memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
            if (!taskResult.ok) continue;
            const content = taskResult.data?.node?.content || taskResult.data?.content || '';
            try {
              const parsed = JSON.parse(content);
              if (parsed.archived) continue;
              const existingId = childPath.split('/').pop();
              if (!localData.tasks.find(t => t.id === existingId)) {
                localData.tasks.push({
                  id: existingId,
                  content: parsed.label || parsed.content || '未命名任务',
                  priority: parsed.priority || 'p2',
                  done: parsed.done || false,
                  source: parsed.source || 'amy',
                  createdAt: parsed.created || parsed.createdAt || '',
                });
                migratedTasks++;
              }
            } catch {}
          }
        }

        const parkingResult = await this.memory.readMemory(`core://my_user/daily/${todayStr}/parking_lot`, { treat404AsDebug: true });
        if (parkingResult.ok && parkingResult.data) {
          const children = parkingResult.data?.node?.children || parkingResult.data?.children || [];
          for (const child of children) {
            const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!childPath) continue;
            const itemResult = await this.memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
            if (!itemResult.ok) continue;
            const content = itemResult.data?.node?.content || itemResult.data?.content || '';
            try {
              const parsed = JSON.parse(content);
              const existingId = childPath.split('/').pop();
              if (!localData.parking.find(p => p.id === existingId)) {
                localData.parking.push({
                  id: existingId,
                  content: parsed.item || content.slice(0, 50),
                  priority: 'p2',
                  done: false,
                  source: 'amy',
                  createdAt: parsed.time || '',
                });
                migratedParking++;
              }
            } catch {
              if (content && content !== '[DELETED]') {
                const existingId = childPath.split('/').pop();
                if (!localData.parking.find(p => p.id === existingId)) {
                  localData.parking.push({
                    id: existingId,
                    content: content.slice(0, 50),
                    priority: 'p2',
                    done: false,
                    source: 'amy',
                    createdAt: '',
                  });
                  migratedParking++;
                }
              }
            }
          }
        }

        localData.updatedAt = new Date().toISOString();
        const dir = path.dirname(tasksPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(tasksPath, JSON.stringify(localData, null, 2), 'utf-8');

        this.reply(connection, `✅ 迁移完成\n已从 Nocturne 迁移 ${migratedTasks} 条任务和 ${migratedParking} 条停车场项目\n\n原始数据保留在 Nocturne 中作为备份`);
      } catch (e) {
        this.reply(connection, `❌ 迁移失败: ${e.message}`);
      }
      return;
    }

    this.reply(connection, [
      '📋 任务管理命令：',
      '/task add <内容> [p0/p1/p2] — 添加任务',
      '/task done <序号> — 标记完成',
      '/task list — 列出今日任务',
      '/task clear — 清空已完成任务',
      '/task migrate — 从 Nocturne 迁移数据',
    ].join('\n'));
  }

  // ═══════════════════════════════════════════════════════════════
  // 发送工具
  // ═══════════════════════════════════════════════════════════════

  reply(connection, text) {
    connection.send({
      type: 'event',
      event: 'chat',
      payload: { text, state: 'done', done: true, isSystemReply: true },
    });
  }

  replyEvent(connection, text) {
    connection.send({
      type: 'event',
      event: 'chat',
      payload: { text, state: 'done', done: true },
    });
  }
}

module.exports = SlashHandler;
