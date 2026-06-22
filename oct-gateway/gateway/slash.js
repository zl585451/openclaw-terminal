const fs = require('fs');
const path = require('path');
const os = require('os');
const ProviderRouter = require('../runtime/providerRouter');
const { saveRawTurn, makeRawTurnDedupeKey } = require('../memory/memory_raw_log');
const {
  buildChatHeaders,
  classifyProbeFailure,
} = require('../runtime/llmTransport');
const {
  probeModelToolsSupport,
} = require('../runtime/toolCapabilityPolicy');

class SlashHandler {
  constructor({
    session,
    memory,
    config,
    aiLibrary,
    tools,
    systemPromptReady,
    providerRouter,
    logger,
  }) {
    this.session = session;
    this.memory = memory;
    this.config = config;
    this.aiLibrary = aiLibrary;
    this.tools = tools;
    this.systemPromptReady = systemPromptReady;
    this.log = logger;
    this.providerRouter = providerRouter || new ProviderRouter({ config: this.config });

    this._commandHandlers = {
      '/new': this._handleNewOrReset.bind(this),
      '/reset': this._handleNewOrReset.bind(this),
      '/status': this._handleStatus.bind(this),
      '/model': this._handleModel.bind(this),
      '/provider': this._handleProvider.bind(this),
      '/memory': this._handleMemoryCommand.bind(this),
      '/summary': this._handleSummaryCommand.bind(this),
      '/recall': this._handleRecallCommand.bind(this),
      '/export': this._handleExportCommand.bind(this),
      '/think': this._handleThinkCommand.bind(this),
      '/cot': this._handleThinkCommand.bind(this),
      '/help': this._handleHelp.bind(this),
      '/task': this._handleTaskCommand.bind(this),
    };
  }

  collectSessionTurnsForFlush(sessionKey) {
    const history = this.session.getHistory(sessionKey) || [];
    const turns = [];
    let pendingUser = null;

    for (const message of history) {
      if (!message || !String(message.content || '').trim()) continue;
      if (message.role === 'user') {
        pendingUser = message;
        continue;
      }
      if (message.role === 'assistant' && pendingUser) {
        turns.push({
          userMessage: String(pendingUser.content || ''),
          assistantReply: String(message.content || ''),
        });
        pendingUser = null;
      }
    }

    return turns;
  }

  async handle(command, request, connection) {
    const parts = command.split(/\s+/);
    const base = (parts[0] || '').toLowerCase();
    const sessionKey = request?.params?.sessionKey || 'main';

    const handler = this._commandHandlers[base];
    if (handler) {
      await handler(parts, sessionKey, connection, command, request);
      return;
    }

    this.reply(connection, `未知命令：${command}\n输入 /help 查看可用命令`);
  }

  async _handleNewOrReset(parts, sessionKey, connection) {
    {
      let savedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let rawSaveNote = '';
      try {
        const turns = this.collectSessionTurnsForFlush(sessionKey);
        if (turns.length === 0) {
          rawSaveNote = '未找到可保存的完整对话轮次';
        } else {
          for (const turn of turns) {
            const result = await saveRawTurn({
              ...turn,
              sessionKey,
              toolsUsed: ['new_conversation_flush'],
              attachments: [],
              dedupeKey: makeRawTurnDedupeKey({ ...turn, sessionKey }),
            });
            if (result?.skipped) {
              skippedCount += 1;
            } else if (result?.error) {
              failedCount += 1;
            } else if (result?.uri) {
              savedCount += 1;
            }
          }
        }
      } catch (err) {
        failedCount += 1;
        rawSaveNote = `保存失败：${err?.message || String(err)}`;
        this.log.warn('new conversation raw flush failed', { error: err?.message || String(err), sessionKey });
      }
      this.session.clearSession(sessionKey);
      this.session.clearThinkMode(sessionKey);
      const vectorHint = this.config.memory?.vectorRecall?.enabled
        ? '，并已触发向量入库'
        : '';
      const totalTouched = savedCount + skippedCount + failedCount;
      this.reply(connection, totalTouched > 0
        ? `✅ 已保存并开启新对话：新增 ${savedCount} 轮，去重跳过 ${skippedCount} 轮，失败 ${failedCount} 轮${vectorHint}。`
        : `✅ 已开启新对话。${rawSaveNote ? `（${rawSaveNote}）` : ''}`);
      return;
    }
  }

  async _handleStatus(parts, sessionKey, connection) {
    {
      const sp = await this.systemPromptReady;
      const sessions = this.session.listSessions();
      const memoryAlive = await this.memory.isAlive();
      const aiLibEnabled = (this.config.ai_library || {}).enabled !== false;
      const aiLibraryAlive = aiLibEnabled
        ? await this.aiLibrary.checkHealth().catch(() => false)
        : false;
      const currentHistory = this.session.getHistory(sessionKey);
      const historyChars = currentHistory.reduce((acc, message) => acc + (message.content?.length || 0), 0);
      const estimatedTokens = Math.round(historyChars / 2);
      const systemPromptTokens = Math.round(sp.length / 2);
      const totalEstimated = estimatedTokens + systemPromptTokens;
      const resolved = this.providerRouter.resolve(this.config.DASHSCOPE_MODEL);
      const provider = resolved.provider;
      const modelDef = provider.models.find((model) => model.id === this.config.DASHSCOPE_MODEL);
      const registryCaps = this.config.getModelCaps(this.config.DASHSCOPE_MODEL);
      let vectorStatusLines = [];
      try {
        const vectorCfg = this.config.memory?.vectorRecall || {};
        if (vectorCfg.enabled) {
          const vectorDb = require('../memory_vector/db');
          const vectorStats = vectorDb.getStats();
          const recentDates = (vectorStats.byDate || [])
            .slice(0, 7)
            .map((row) => `${row.date}:${row.c}`)
            .join(' / ') || '无';
          const latest = vectorStats.latest
            ? `${vectorStats.latest.date || '-'} ${vectorStats.latest.uri || ''}`
            : '无';
          const latestFailure = vectorStats.latestFailure
            ? `${vectorStats.latestFailure.uri || '-'} (${String(vectorStats.latestFailure.last_error || '').slice(0, 48)})`
            : '无';
          vectorStatusLines = [
            `🧲 向量记忆：✅ 启用，${vectorStats.total} 条，失败 ${vectorStats.failed}`,
            `   模型：\`${vectorCfg.embedding?.model || '未配置'}\`，最近：${latest}`,
            `   近 7 天：${recentDates}`,
          ];
          if (vectorStats.failed > 0) {
            vectorStatusLines.push(`   最近失败：${latestFailure}`);
          }
        } else {
          vectorStatusLines = ['🧲 向量记忆：⚫ 未启用'];
        }
      } catch (err) {
        vectorStatusLines = [`🧲 向量记忆：⚠️ 状态读取失败（${err?.message || String(err)}）`];
      }
      let probeCaps = this.config.getProbeCacheEntry
        ? this.config.getProbeCacheEntry({
            providerId: provider.id,
            baseUrl: provider.baseUrl,
            modelId: this.config.DASHSCOPE_MODEL,
          })
        : null;
      let toolsSupport = resolved.caps?.toolsSupport
        || (probeCaps?.toolsSupport || registryCaps.toolsSupport || (registryCaps.supportsTools ? 'supported' : 'unknown'));
      if (toolsSupport === 'unknown' && provider.apiKey && provider.baseUrl) {
        probeCaps = await probeModelToolsSupport({
          provider,
          model: this.config.DASHSCOPE_MODEL,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          config: this.config,
          fetchWithRetry: async (url, options) => fetch(url, options),
          buildChatHeaders,
          classifyProbeFailure,
          logger: this.log,
        }).catch((err) => {
          this.log.warn('status probe failed', { error: err?.message || String(err) });
          return null;
        });
        if (probeCaps?.toolsSupport) toolsSupport = probeCaps.toolsSupport;
      }

      const capabilitySource = probeCaps?.capabilitySource
        || resolved.caps?.capabilitySource
        || registryCaps.capabilitySource
        || 'fallback_unknown';
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
        `🧠 Memory v2: ${memoryAlive ? '✅ 在线' : '❌ 离线'}`,
        `📚 AI.library：${aiLibraryAlive ? '✅ 在线' : '⚫ 未启动'}`,
        ...vectorStatusLines,
        `💬 当前会话：${currentHistory.length} 条消息`,
        `📊 上下文估算：~${totalEstimated.toLocaleString()} tokens（含 system prompt ~${systemPromptTokens.toLocaleString()}）`,
        `🗂️ 所有会话：${sessions.length > 0 ? sessions.join(', ') : 'none'}`,
        `⏱️ Uptime：${Math.round(process.uptime())}s`,
        '',
        '**口令**：`/status` `/model` `/provider` `/memory boot|read|search|status` `/new` `/help`',
      ].join('\n'));
      return;
    }
  }

  async _handleModel(parts, sessionKey, connection) {
    {
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
      const resolved = this.providerRouter.resolve(modelName);
      const caps = {
        supportsTools: !!resolved?.caps?.supportsTools,
        toolsSupport: resolved?.caps?.toolsSupport || 'unknown',
        capabilitySource: resolved?.caps?.capabilitySource || 'fallback_unknown',
        supportsThinking: resolved?.caps?.supportsThinking || modelDef?.thinking || false,
        label: modelDef?.label || resolved?.caps?.label || modelName,
      };
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
  }

  async _handleProvider(parts, sessionKey, connection) {
    {
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
  }

  async _handleMemoryCommand(parts, sessionKey, connection) {
    await this._handleMemory(parts, connection);
  }

  async _handleSummaryCommand(parts, sessionKey, connection) {
    await this._handleSummary(parts, connection);
  }

  async _handleRecallCommand(parts, sessionKey, connection) {
    await this._handleRecall(parts, connection);
  }

  async _handleExportCommand(parts, sessionKey, connection) {
    await this._handleExport(parts, connection);
  }

  async _handleThinkCommand(parts, sessionKey, connection) {
    this._handleThink(parts, sessionKey, connection);
  }

  async _handleHelp(parts, sessionKey, connection) {
    this.reply(connection, [
      '📋 OCT Gateway 命令：',
      '  /status   — 查看 Gateway 状态',
      '  /model [名称] — 查看/切换模型',
      '  /provider [id] — 查看/切换 AI 服务商',
      '  /memory   — 记忆系统管理',
      '  /summary daily|weekly|monthly [日期] — 生成分层记忆摘要',
      '  /recall test|status|query|backfill — 向量召回管理',
      '  /think [off/low/medium/high] — 思考模式',
      '  /task add [内容] [p0/p1/p2] — 添加任务',
      '  /task done [序号] — 标记任务完成',
      '  /task list — 列出今日任务',
      '  /task clear — 清空已完成任务',
      '  /new      — 保存并清空当前会话',
      '  /help     — 显示此帮助',
    ].join('\n'));
  }

  async _handleTaskCommand(parts, sessionKey, connection) {
    await this._handleTask(parts, connection);
  }

  async _handleSummary(parts, connection) {
    const subCmd = (parts[1] || '').toLowerCase();
    const arg = parts.slice(2).join(' ').trim();

    if (subCmd === 'daily') {
      const { generateDailySummary } = require('../summarizer/daily');
      const date = arg || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        this.reply(connection, '用法：/summary daily YYYY-MM-DD');
        return;
      }
      this.reply(connection, `⏳ 正在生成 ${date} 的日摘要...`);
      const result = await generateDailySummary(date);
      if (result.ok) {
        this.reply(connection, result.skipped ? `ℹ️ ${date} 无原始日志` : `✅ 日摘要已生成：${result.uri}`);
      } else {
        this.reply(connection, `❌ 失败：${result.error}`);
      }
      return;
    }

    if (subCmd === 'weekly') {
      const { generateWeeklySummary, getIsoWeek } = require('../summarizer/weekly');
      const week = arg || getIsoWeek(new Date(Date.now() - 7 * 86400000));
      if (!/^\d{4}-W\d{2}$/.test(week)) {
        this.reply(connection, '用法：/summary weekly YYYY-Www，例如 /summary weekly 2026-W16');
        return;
      }
      this.reply(connection, `⏳ 正在生成 ${week} 的周摘要...`);
      const result = await generateWeeklySummary(week);
      if (result.ok) {
        this.reply(connection, result.skipped ? `ℹ️ ${week} 无日摘要` : `✅ 周摘要已生成：${result.uri}`);
      } else {
        this.reply(connection, `❌ 失败：${result.error}`);
      }
      return;
    }

    if (subCmd === 'monthly') {
      const { generateMonthlySummary, getMonthStr } = require('../summarizer/monthly');
      const month = arg || getMonthStr(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15));
      if (!/^\d{4}-\d{2}$/.test(month)) {
        this.reply(connection, '用法：/summary monthly YYYY-MM，例如 /summary monthly 2026-04');
        return;
      }
      this.reply(connection, `⏳ 正在生成 ${month} 的月摘要...`);
      const result = await generateMonthlySummary(month);
      if (result.ok) {
        this.reply(connection, result.skipped ? `ℹ️ ${month} 无周摘要` : `✅ 月摘要已生成：${result.uri}`);
      } else {
        this.reply(connection, `❌ 失败：${result.error}`);
      }
      return;
    }

    this.reply(connection, [
      '可用摘要口令：',
      '/summary daily YYYY-MM-DD — 生成日摘要（L2）',
      '/summary weekly YYYY-Www — 生成周摘要（L1）',
      '/summary monthly YYYY-MM — 生成月摘要（L0）',
    ].join('\n'));
  }

  async _handleRecall(parts, connection) {
    const subCmd = (parts[1] || '').toLowerCase();

    if (subCmd === 'test') {
      const text = parts.slice(2).join(' ').trim() || '测试 embedding';
      this.reply(connection, `⏳ 正在调用 embedding API...（输入：${text.slice(0, 60)}）`);
      try {
        const { embedOne } = require('../summarizer/embedding_client');
        const t0 = Date.now();
        const vec = await embedOne(text);
        const elapsed = Date.now() - t0;
        this.reply(connection, [
          '✅ Embedding 调用成功',
          `耗时：${elapsed}ms`,
          `维度：${vec.length}`,
          `向量前 5 个值：[${vec.slice(0, 5).map((n) => Number(n).toFixed(4)).join(', ')}, ...]`,
          `模型：${this.config.memory.vectorRecall.embedding.model || '(未配置)'}`,
        ].join('\n'));
      } catch (err) {
        this.reply(connection, `❌ Embedding 调用失败：${err?.message || String(err)}`);
      }
      return;
    }

    if (subCmd === 'status') {
      try {
        const db = require('../memory_vector/db');
        const stats = db.getStats();
        const lines = [
          '📊 向量库状态',
          `启用：${this.config.memory.vectorRecall.enabled ? 'true' : 'false'}`,
          `模型：${this.config.memory.vectorRecall.embedding.model || '(未配置)'}`,
          `数据库：${stats.dbPath}`,
          `总向量数：${stats.total}`,
          `失败待重试：${stats.failed}`,
          '最近 7 天分布：',
        ];
        stats.byDate.slice(0, 7).forEach((item) => lines.push(`  ${item.date}: ${item.c}`));
        if (stats.byModelVersion?.length) {
          lines.push('模型分布：');
          stats.byModelVersion.slice(0, 5).forEach((item) => lines.push(`  ${item.model || '(empty)'}@v${item.version}: ${item.c}`));
        }
        this.reply(connection, lines.join('\n'));
      } catch (err) {
        this.reply(connection, `❌ 向量库未初始化或查询失败：${err?.message || String(err)}`);
      }
      return;
    }

    if (subCmd === 'recent') {
      const rawArg = (parts[2] || '').trim().toLowerCase();
      const currentModelOnly = rawArg === 'current';
      const rawLimit = currentModelOnly ? parts[3] : parts[2];
      const limit = Math.max(1, Math.min(20, Number(rawLimit) || 8));
      try {
        const db = require('../memory_vector/db');
        const rows = db.listRecent(limit, { currentModelOnly });
        if (!rows.length) {
          this.reply(connection, currentModelOnly ? '当前 embedding 模型下没有向量记录' : '向量库里还没有可浏览的记录');
          return;
        }
        const lines = [
          currentModelOnly ? `🧾 当前模型最近 ${rows.length} 条向量记录` : `🧾 向量库最近 ${rows.length} 条记录`,
        ];
        rows.forEach((row, idx) => {
          lines.push('');
          lines.push(`[${idx + 1}] ${row.date} ${row.source_ts || ''}`.trim());
          lines.push(`  模型：${row.embedding_model || '(empty)'}@v${row.embedding_version || 1}`);
          lines.push(`  ${String(row.text_preview || '').slice(0, 160)}`);
          lines.push(`  ${row.uri}`);
        });
        this.reply(connection, lines.join('\n'));
      } catch (err) {
        this.reply(connection, `❌ 读取最近记录失败：${err?.message || String(err)}`);
      }
      return;
    }

    if (subCmd === 'query') {
      const text = parts.slice(2).join(' ').trim();
      if (!text) {
        this.reply(connection, '用法：/recall query <查询文本>');
        return;
      }
      try {
        const recaller = require('../memory_vector/recaller');
        const db = require('../memory_vector/db');
        const result = await recaller.recall(text, 'slash-test', {
          mode: 'manual',
          topK: 5,
          threshold: this.config.memory.vectorRecall.recall.manualThreshold,
        });
        if (result.skipped) {
          const lexicalHits = db.searchText(text, { limit: 5, currentModelOnly: true });
          if (!lexicalHits.length) {
            this.reply(connection, `⏭️ 已跳过：${result.reason}（耗时 ${result.latencyMs}ms）`);
            return;
          }
          const lines = [`🟡 语义召回已跳过：${result.reason}（耗时 ${result.latencyMs}ms）`, '以下是文本候选：'];
          lexicalHits.forEach((hit, idx) => {
            lines.push('');
            lines.push(`[${idx + 1}] ${hit.date} 文本分 ${(hit.lexical_score * 100).toFixed(1)}%`);
            lines.push(`  ${String(hit.text_preview || '').slice(0, 150)}`);
            lines.push(`  ${hit.uri}`);
          });
          this.reply(connection, lines.join('\n'));
          return;
        }
        const lines = [];
        if (result.hits.length > 0) {
          lines.push(`✅ 语义候选 ${result.hits.length} 条（耗时 ${result.latencyMs}ms，手动查询不会自动注入主对话）`);
          result.hits.forEach((hit, idx) => {
            const lexical = recaller.scoreLexicalOverlap(text, hit);
            lines.push('');
            lines.push(`[${idx + 1}] ${hit.date} 相似度 ${(hit.similarity * 100).toFixed(1)}% / 词重叠 ${(lexical.overlap * 100).toFixed(1)}%`);
            if (lexical.matched.length) lines.push(`  命中词：${lexical.matched.slice(0, 8).join(' / ')}`);
            lines.push(`  ${String(hit.text_preview || '').slice(0, 150)}`);
            lines.push(`  ${hit.uri}`);
          });
          this.reply(connection, lines.join('\n'));
          return;
        }
        const lexicalHits = db.searchText(text, { limit: 5, currentModelOnly: true });
        if (!lexicalHits.length) {
          this.reply(connection, `✅ 高置信语义命中 0 条（耗时 ${result.latencyMs}ms）\n未找到文本候选`);
          return;
        }
        lines.push(`🟡 语义候选 0 条（耗时 ${result.latencyMs}ms）`);
        lines.push('以下是文本候选，仅供人工核对，不会自动注入主对话：');
        lexicalHits.forEach((hit, idx) => {
          lines.push('');
          lines.push(`[${idx + 1}] ${hit.date} 文本分 ${(hit.lexical_score * 100).toFixed(1)}%`);
          lines.push(`  ${String(hit.text_preview || '').slice(0, 150)}`);
          lines.push(`  ${hit.uri}`);
        });
        this.reply(connection, lines.join('\n'));
      } catch (err) {
        this.reply(connection, `❌ 查询失败：${err?.message || String(err)}`);
      }
      return;
    }

    if (subCmd === 'backfill') {
      const arg = parts[2] || '';
      this.reply(connection, '⏳ 开始回填向量库，过程可能较长，请耐心等待...');
      try {
        const { backfillAll, backfillDay, retryFailed } = require('../summarizer/backfill');
        let result;
        if (arg === 'retry') {
          result = await retryFailed();
          this.reply(connection, [
            '✅ 重试完成',
            `总数：${result.total}`,
            `成功：${result.success}`,
            `仍失败：${result.stillFailed}`,
          ].join('\n'));
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
          result = await backfillDay(arg);
          this.reply(connection, [
            `✅ ${result.dateStr} 回填完成`,
            `总数：${result.total}`,
            `新增：${result.processed}`,
            `已存在跳过：${result.skipped}`,
            `失败：${result.failed}`,
          ].join('\n'));
        } else {
          result = await backfillAll();
          this.reply(connection, [
            '✅ 全量回填完成',
            `覆盖天数：${result.dates}`,
            `总条目：${result.total}`,
            `新增：${result.processed}`,
            `已存在跳过：${result.skipped}`,
            `失败：${result.failed}`,
          ].join('\n'));
        }
      } catch (err) {
        this.reply(connection, `❌ 回填失败：${err?.message || String(err)}`);
      }
      return;
    }

    this.reply(connection, [
      '召回口令：',
      '/recall test <文本> — 测试 embedding API',
      '/recall status — 查看向量库状态',
      '/recall recent [N] — 查看最近写入的向量记录',
      '/recall recent current [N] — 查看当前模型可见的最近记录',
      '/recall query <文本> — 手动查询向量库',
      '/recall backfill [YYYY-MM-DD|retry] — 回填历史日志',
    ].join('\n'));
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
        this.reply(connection, '❌ 记忆后端不可用，请检查本地 Memory v2 存储');
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
      this.reply(connection, alive ? '✅ Memory v2 在线' : '❌ Memory v2 离线');
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

    if (subCmd === 'stats') {
      const alive = await mem.isAlive();
      if (!alive) {
        this.reply(connection, '❌ Memory v2 离线');
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
        `Memory v2：✅ 在线`,
        '',
        '口令：/memory boot|read|search|status|today|stats',
      ].join('\n'));
      return;
    }

    this.reply(connection, [
      '可用记忆口令：',
      '/memory boot — 重载核心记忆',
      '/memory today — 今天的对话摘要',
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
        this.log.info('export training-data: memory backend alive', { alive: !!testAlive });

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

    this.reply(connection, [
      '📋 任务管理命令：',
      '/task add <内容> [p0/p1/p2] — 添加任务',
      '/task done <序号> — 标记完成',
      '/task list — 列出今日任务',
      '/task clear — 清空已完成任务',
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
