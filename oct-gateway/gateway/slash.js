class SlashHandler {
  constructor({
    session,
    memory,
    config,
    aiLibrary,
    systemPromptReady,
    handleLegacyCommand,
  }) {
    this.session = session;
    this.memory = memory;
    this.config = config;
    this.aiLibrary = aiLibrary;
    this.systemPromptReady = systemPromptReady;
    this.handleLegacyCommand = handleLegacyCommand;
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

      this.replyEvent(connection, [
        '🦞 **OCT Gateway**',
        '',
        `📡 Model: \`${this.config.DASHSCOPE_MODEL}\``,
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
        ? { supportsTools: modelDef.tools, supportsThinking: modelDef.thinking, label: modelDef.label }
        : this.config.getModelCaps(modelName);
      const warnings = [];
      if (!caps.supportsTools) {
        warnings.push('⚠️ 该模型不支持工具调用（天气/搜索/文件操作等功能将暂时不可用）');
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

    return this.handleLegacyCommand({ command, request, connection });
  }

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
