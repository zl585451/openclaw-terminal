class ContextBuilder {
  constructor({
    session,
    memory,
    memorySearch,
    nocturneQueue,
    memoryGovernor,
    contextManager,
    aiLibrary,
    hypothesis,
    imageService,
    config,
    logger,
    helpers,
  }) {
    this.session = session;
    this.memory = memory;
    this.memorySearch = memorySearch;
    this.nocturneQueue = nocturneQueue;
    this.memoryGovernor = memoryGovernor;
    this.contextManager = contextManager;
    this.aiLibrary = aiLibrary;
    this.hypothesis = hypothesis;
    this.imageService = imageService;
    this.config = config;
    this.log = logger;
    this.helpers = helpers;
  }

  async build({
    sessionKey,
    userMessage,
    attachments,
    canvasContext,
    orchestratorResult,
    systemPrompt,
  }) {
    const imageAttachments = (attachments || []).filter((attachment) => attachment.type === 'image');
    let messageContent;

    if (imageAttachments.length > 0) {
      const providerConfig = this.config.getProviderConfig();
      const currentModel = this.config.DASHSCOPE_MODEL;
      const imageResult = await this.imageService.processImageAttachments(
        userMessage,
        imageAttachments,
        currentModel,
        providerConfig
      );
      messageContent = imageResult.content;
    } else {
      messageContent = userMessage;
    }

    const contextMemory = await this._buildContextMemory({ sessionKey, userMessage });
    const backgroundTaskNotice = orchestratorResult?.hasBackgroundTask
      ? '\n\n[系统] 用户这条消息已派发后台任务执行（如查邮件），请简短回复「好的，我已经派出去查了，我们继续聊」之类，不要在主对话中调用 email_reader 等工具。'
      : '';
    const canvasSuggestionNotice = this._buildCanvasSuggestion(orchestratorResult);
    const canvasRoundtripNotice = this._buildCanvasRoundtrip(canvasContext);

    const lastUserMsg = typeof messageContent === 'string'
      ? messageContent + contextMemory + backgroundTaskNotice + canvasSuggestionNotice + canvasRoundtripNotice
      : [
          ...messageContent,
          ...(contextMemory ? [{ type: 'text', text: contextMemory }] : []),
          ...(backgroundTaskNotice ? [{ type: 'text', text: backgroundTaskNotice }] : []),
          ...(canvasSuggestionNotice ? [{ type: 'text', text: canvasSuggestionNotice }] : []),
          ...(canvasRoundtripNotice ? [{ type: 'text', text: canvasRoundtripNotice }] : []),
        ];

    this.session.addMessage(
      sessionKey,
      'user',
      typeof messageContent === 'string' ? messageContent : userMessage
    );

    const history = this.session.getHistory(sessionKey);
    const finalSystemPrompt = await this._buildSystemPrompt({
      systemPrompt,
      userMessage,
      history,
      imageAttachments,
      sessionKey,
    });

    const messages = this.contextManager.buildApiMessages(history, finalSystemPrompt, lastUserMsg);
    this.log.info('context window', this.contextManager.summarize(messages));

    return {
      messages: this._injectTaskContext(messages, sessionKey),
      history,
      imageAttachments,
    };
  }

  async _buildContextMemory({ sessionKey, userMessage }) {
    let contextMemory = '';
    try {
      const nocturneAlive = await this.nocturneQueue.isNocturneHealthy();
      if (!nocturneAlive || userMessage.length <= 1) return '';

      const recallIntent = this.helpers.hasRecallIntent(userMessage);
      const projectAnalysisIntent = this.helpers.isProjectAnalysisRequest(userMessage);
      const shouldInjectContextMemory = recallIntent || !projectAnalysisIntent;
      const history = this.session.getHistory(sessionKey) || [];
      const recentContextTexts = recallIntent
        ? history
            .slice(-6)
            .map((message) => (typeof message?.content === 'string' ? message.content : ''))
            .filter(Boolean)
        : [];

      const entityWords = [
        ...this.helpers.extractMemorySearchTerms(userMessage),
        ...recentContextTexts.flatMap((text) => this.helpers.extractMemorySearchTerms(text).slice(0, 2)),
      ];

      const searchWords = [...new Set(entityWords)].slice(0, recallIntent ? 5 : 3);
      const memContents = [];
      const seenUris = new Set();
      const searchResults = await Promise.all(
        searchWords.map((word) =>
          this.memorySearch.searchMemory(word, {
            domain: 'core',
            limit: recallIntent ? 3 : 2,
            include_content: true,
          }).catch(() => ({ ok: false, data: null }))
        )
      );

      for (const result of searchResults) {
        if (!result.ok || !result.data) continue;
        for (const item of result.data) {
          if (seenUris.has(item.uri) || item.uri.includes('/history/')) continue;
          seenUris.add(item.uri);
          const content = this.helpers.stripCotText(item.content || '').slice(0, 200);
          if (!content) continue;
          memContents.push({
            uri: item.uri,
            content: `[${item.uri}] ${content}`,
            priority: item.priority || 2,
            match_score: item.match_score || 0.5,
          });
        }
      }

      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const historyResult = await this.memory.readMemory(
          `core://my_user/history/${todayStr}`,
          { treat404AsDebug: true }
        );
        if (historyResult.ok && historyResult.data) {
          const children = historyResult.data?.node?.children || historyResult.data?.children || [];
          const recent = children.slice(-3);
          for (const child of recent) {
            const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
            if (!childPath) continue;
            const result = await this.memory.readMemory(`core://${childPath}`, { treat404AsDebug: true });
            if (!result.ok) continue;
            const content = result.data?.node?.content || result.data?.content || '';
            if (!content) continue;
            try {
              const sanitized = this.helpers.sanitizeMemoryNodeContent(content);
              const parsed = sanitized.data || JSON.parse(sanitized.content);
              if (parsed.user && parsed.amy) {
                memContents.push({
                  uri: `core://${childPath}`,
                  content: `[近期对话] 用户说：${parsed.user.slice(0, 50)} → AI：${parsed.amy.slice(0, 80)}`,
                  priority: 1,
                  match_score: 0.2,
                });
              }
            } catch {}
          }
        }
      } catch {}

      if (shouldInjectContextMemory) {
        const selectedMemories = this.memoryGovernor.selectForInjection(
          memContents,
          { limit: recallIntent ? 6 : 4, maxChars: recallIntent ? 1000 : 700 }
        );
        if (selectedMemories.length > 0) {
          this.log.info('contextMemory selected', {
            recallIntent,
            projectAnalysisIntent,
            searchWords,
            selectedUris: selectedMemories.map((item) => item.uri),
            count: selectedMemories.length,
          });
          contextMemory = '\n\n[相关记忆]\n' + selectedMemories.map((item) => item.content).join('\n');
        }
      } else {
        this.log.info('contextMemory skipped for project analysis request', {
          recallIntent,
          projectAnalysisIntent,
          searchWords,
        });
      }
    } catch (error) {
      this.log.debug('contextMemory 加载失败，继续对话', { error: error?.message || String(error) });
    }
    return contextMemory;
  }

  _buildCanvasSuggestion(orchestratorResult) {
    if (!orchestratorResult?.canvasIntent?.shouldUseCanvas) return '';
    const suggestedType = orchestratorResult.canvasIntent.artifactType || 'document';
    const reason = orchestratorResult.canvasIntent.reason || '这条请求适合结构化表达';
    return `\n\n[系统] 这条请求适合使用 Canvas 表达。优先考虑调用 canvas 工具创建一个 ${suggestedType} artifact。原因：${reason}。`
      + ' 先在聊天中用一句话说明你要产出什么，再创建 Canvas 内容。';
  }

  _buildCanvasRoundtrip(canvasContext) {
    if (!canvasContext?.activeDocument) return '';
    const summary = {
      intent: canvasContext.intent || 'continue',
      activeDocumentId: canvasContext.activeDocumentId || null,
      activeDocument: {
        id: canvasContext.activeDocument.id,
        title: canvasContext.activeDocument.title,
        artifactType: canvasContext.activeDocument.artifactType,
        mode: canvasContext.activeDocument.mode,
        language: canvasContext.activeDocument.language,
        version: canvasContext.activeDocument.version,
        status: canvasContext.activeDocument.status,
        explanation: canvasContext.activeDocument.explanation || '',
        content: canvasContext.activeDocument.content,
      },
      documents: Array.isArray(canvasContext.documents) ? canvasContext.documents : [],
    };
    return '\n\n[Canvas Context] 以下是当前 Canvas 工作区上下文。'
      + ' 你正在基于这份 artifact 协作，请优先围绕 activeDocument 继续工作。'
      + ' 如果当前任务是 Continue、Explain 或 Rewrite，且你要修改现有成果物，请优先调用 canvas(action="update", documentId=activeDocumentId, ...) 更新当前文档。'
      + ' 只有在确实需要新增并行成果物时，才使用 create。\n'
      + `${JSON.stringify(summary, null, 2)}`;
  }

  async _buildSystemPrompt({ systemPrompt, userMessage, history, imageAttachments, sessionKey }) {
    let hypothesisResult = null;
    if (!userMessage.startsWith('/') && userMessage.length > 15 && imageAttachments.length === 0) {
      this.hypothesis.selectBestApproach(userMessage, systemPrompt, history.slice(-6))
        .then((result) => {
          if (result) hypothesisResult = result;
        })
        .catch(() => {});
    }

    let finalSystemPrompt = systemPrompt;
    if (hypothesisResult?.should_challenge && hypothesisResult?.challenge_point) {
      finalSystemPrompt = systemPrompt + `\n\n[内部指令] 用户这条消息有值得质疑的地方：${hypothesisResult.challenge_point}。请在回复中适当提出，不要一味认同。`;
    }

    const thinkMode = this.session.getThinkMode(sessionKey);
    if (thinkMode && thinkMode !== 'off') {
      const thinkPrompts = {
        low: '\n\n[思考模式：LOW] 允许内部思考，但最终只输出对用户可见的简洁答案。严禁输出思考过程、草稿、自言自语、[cot] 或 <think> 标签。',
        medium: '\n\n[思考模式：MEDIUM] 允许内部思考，但最终只输出结构化结论与行动建议。严禁输出思考过程、草稿、自言自语、[cot] 或 <think> 标签。',
        high: '\n\n[思考模式：HIGH] 允许深度内部推理，但最终只输出清晰完整的正式回复。严禁输出思考过程、草稿、自言自语、[cot] 或 <think> 标签。',
      };
      finalSystemPrompt = finalSystemPrompt + thinkPrompts[thinkMode];
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const timeMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const timeStr = `${timeMap.year}-${timeMap.month}-${timeMap.day} ${timeMap.hour}:${timeMap.minute}:${timeMap.second}`;
    const timeContext = `\n\n[当前时间] ${timeStr} (UTC+8 柳州)`;
    const modelContext = `[当前运行模型] 你当前运行的底层大模型是：\`${this.config.DASHSCOPE_MODEL}\`。当用户问「你是什么大模型」「基于什么模型」时，必须如实回答当前模型名称，严禁说自己是 DeepSeek、GPT、Claude 或其他任何模型。\n\n`;

    let knowledgeContext = '';
    try {
      const knowledge = await this.aiLibrary.searchKnowledge(userMessage);
      knowledgeContext = this.aiLibrary.formatKnowledgeForPrompt(knowledge);
    } catch (error) {
      this.log.debug('AI.library 检索失败，跳过', { error: error?.message || String(error) });
    }

    return modelContext + finalSystemPrompt + timeContext + knowledgeContext;
  }

  _injectTaskContext(messages, sessionKey) {
    const taskContext = this.helpers.getCompletedTasksContext(sessionKey);
    if (!taskContext) return messages;

    const nextMessages = [...messages];
    const lastIdx = nextMessages.length - 1;
    if (nextMessages[lastIdx]?.role === 'user') {
      const content = nextMessages[lastIdx].content;
      nextMessages[lastIdx] = {
        ...nextMessages[lastIdx],
        content: typeof content === 'string'
          ? content + taskContext
          : [...(Array.isArray(content) ? content : []), { type: 'text', text: taskContext }],
      };
      this.log.info('已注入后台任务结果到上下文');
    }
    return nextMessages;
  }
}

module.exports = ContextBuilder;
