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
    workbenchContext,
    orchestratorResult,
    systemPrompt,
  }) {
    const imageAttachments = (attachments || []).filter((attachment) => attachment.type === 'image');
    const audioAttachments = (attachments || []).filter((attachment) => attachment.type === 'audio');
    const providerConfig = this.config.getProviderConfig();
    const currentModel = this.config.DASHSCOPE_MODEL;
    let messageContent;

    if (imageAttachments.length > 0) {
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

    if (audioAttachments.length > 0) {
      const supportsInlineAudio = this._supportsInlineAudio(providerConfig, currentModel);
      if (supportsInlineAudio) {
        const baseParts = Array.isArray(messageContent)
          ? [...messageContent]
          : [{ type: 'text', text: String(messageContent || userMessage || '请分析这段音频') }];
        for (const attachment of audioAttachments) {
          const audioPart = this._toInputAudioPart(attachment);
          if (audioPart) baseParts.push(audioPart);
        }
        messageContent = baseParts;
        this.log.info('audio attachments routed inline', {
          providerId: providerConfig?.id,
          model: currentModel,
          audioCount: audioAttachments.length,
        });
      } else {
        const list = audioAttachments.map((item) => item.fileName || 'audio').join(', ');
        messageContent = `${String(messageContent || userMessage || '')}\n\n[音频附件] ${list}\n当前模型/路由未启用音频直传，请切换到 Google Gemini（Vertex OpenAI）后再试。`.trim();
        this.log.info('audio attachments fallback to text', {
          providerId: providerConfig?.id,
          model: currentModel,
          audioCount: audioAttachments.length,
        });
      }
    }

    const contextMemory = await this._buildContextMemory({ sessionKey, userMessage });
    const backgroundTaskNotice = this.config.ENABLE_BACKGROUND_TASK_DISPATCH === true && orchestratorResult?.hasBackgroundTask
      ? '\n\n[系统] 用户这条消息已派发后台任务执行（如查邮件），请简短回复「好的，我已经派出去查了，我们继续聊」之类，不要在主对话中调用 email_reader 等工具。'
      : '';
    const canvasSuggestionNotice = this._buildCanvasSuggestion(orchestratorResult);
    const canvasRoundtripNotice = this._buildCanvasRoundtrip(workbenchContext);

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

    const recallInjection = await this._buildVectorRecallInjection({ userMessage, sessionKey });
    const messages = this.contextManager.buildApiMessages(history, finalSystemPrompt, lastUserMsg);
    if (recallInjection) {
      messages.splice(1, 0, { role: 'system', content: recallInjection });
    }
    this.log.info('context window', this.contextManager.summarize(messages));

    return {
      messages: this._injectTaskContext(messages, sessionKey),
      history,
      imageAttachments,
      audioAttachments,
    };
  }

  async _buildVectorRecallInjection({ userMessage, sessionKey }) {
    if (!this.config.memory?.vectorRecall?.enabled) return '';
    try {
      const recaller = require('../memory_vector/recaller');
      const result = await recaller.recall(userMessage, sessionKey || 'default');
      if (result.skipped || !result.hits?.length) {
        this.log.debug('vector recall skipped', {
          reason: result.reason || 'no_hits',
          latencyMs: result.latencyMs || 0,
        });
        return '';
      }
      this.log.info('vector recall injected', {
        hits: result.hits.length,
        latencyMs: result.latencyMs,
      });
      return recaller.buildRecallInjection(result.hits);
    } catch (error) {
      this.log.warn('vector recall failed, continuing without injection', { error: error?.message || String(error) });
      return '';
    }
  }

  _supportsInlineAudio(providerConfig, modelId) {
    const providerId = String(providerConfig?.id || '').toLowerCase();
    const model = String(modelId || '').toLowerCase();
    return providerId === 'google' || model.includes('gemini');
  }

  _toInputAudioPart(attachment) {
    if (!attachment?.content) return null;
    const mimeType = String(attachment.mimeType || 'audio/mpeg').toLowerCase();
    const payload = String(attachment.content || '');
    const data = (() => {
      // Vertex OpenAI 兼容层在 input_audio.data 字段里需要纯 base64 或 URI；
      // data URL 会被当作 base64 解析并报 INVALID_ARGUMENT。
      const m = payload.match(/^data:[^;]+;base64,(.+)$/i);
      return (m?.[1] || payload).trim();
    })();

    const format = (() => {
      if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'audio/mp3';
      if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'audio/wav';
      return mimeType;
    })();

    return {
      type: 'input_audio',
      input_audio: {
        data,
        format,
      },
    };
  }

  async _buildContextMemory({ sessionKey, userMessage }) {
    let contextMemory = '';
    try {
      const nocturneAlive = await this.nocturneQueue.isNocturneHealthy();

      if (!nocturneAlive) return '';
      if (userMessage.length <= 1) return '';

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

      const nocturneSearchResults = await Promise.all(
        searchWords.map((word) =>
          this.memorySearch.searchMemory(word, {
            domain: 'core',
            limit: recallIntent ? 3 : 2,
            include_content: true,
          }).catch(() => ({ ok: false, data: null }))
        )
      );

      const memContents = [];
      const seenTexts = new Set();
      const seenUris = new Set();

      // ── Nocturne 结果（身份 / 偏好等结构化数据）──────────────────────────────
      for (const result of nocturneSearchResults) {
        if (!result.ok || !result.data) continue;
        for (const item of result.data) {
          if (seenUris.has(item.uri) || item.uri.includes('/history/')) continue;
          seenUris.add(item.uri);
          const rawContent = this.helpers.stripCotText(item.content || '').slice(0, 200);
          if (!rawContent) continue;
          const textKey = rawContent.slice(0, 60).toLowerCase();
          if (seenTexts.has(textKey)) continue;
          seenTexts.add(textKey);
          memContents.push({
            uri: item.uri,
            content: `[${item.uri}] ${rawContent}`,
            priority: item.priority || 2,
            match_score: item.match_score || 0.5,
          });
        }
      }

      // ── 3. 今日历史对话追加 ─────────────────────────────────────────────────
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

      // ── 4. 注入 ─────────────────────────────────────────────────────────────
      if (shouldInjectContextMemory) {
        const selectedMemories = this.memoryGovernor.selectForInjection(
          memContents,
          { limit: recallIntent ? 7 : 5, maxChars: recallIntent ? 1100 : 800 }
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
    const { artifactType, reason } = orchestratorResult.canvasIntent;
    const msg = orchestratorResult.userMessage || '';

    if (artifactType === 'react-flow') {
      const isComplex = msg.length > 40 || /完整|详细|全部|所有|包括/.test(msg);
      const baseRules = '【结构图输出规则】\n'
        + '① 方向一律用 "TB"（从上到下），禁止用 LR。\n'
        + '② 每个节点必须有 group 字段，同类节点放同一 group。\n'
        + '③ 有判断/条件时，节点加 "shape":"diamond"，并为每条出边加 label（如"是"/"否"）。\n'
        + '④ edges 必须用 "source"/"target"（不是 from/to），ID 与 nodes 里的 id 完全一致。\n'
        + '⑤ 使用 canvas 工具创建 react-flow 类型成果物，content 填入 JSON 字符串。\n'
        + 'JSON 格式：{"title":"...","direction":"TB","nodes":[{"id":"a","label":"...","group":"分组","shape":"rect"}],"edges":[{"source":"a","target":"b","label":"可选"}]}';
      return isComplex
        ? `\n\n[系统] 执行【结构图输出协议】。复杂场景：10-12 节点、3-5 group。同组同类 >3 必须合并。先一句话说明，再输出结构图。\n${baseRules}`
        : `\n\n[系统] 执行【结构图输出协议】。简单场景：6-8 节点、2-3 group。先一句话说明，再输出结构图。\n${baseRules}`;
    }

    if (artifactType === 'echart') {
      return '\n\n[系统] 图表数据必须用 [echart]...[/echart] 标签包裹输出，格式如下：\n'
        + '[echart]{"title":"图表标题","option":{...标准ECharts option...}}[/echart]\n'
        + '禁止在正文输出原始 JSON、禁止使用 [canvas] 标签、禁止输出代码块。\n'
        + '图表 JSON 只放在 [echart] 标签内，其余内容正常用中文回复。';
    }

    if (artifactType === 'diagram') {
      return '\n\n[系统] 流程图/示意图输出规则：'
        + '简单图（≤6节点，TD方向）直接用 ```json 代码块输出图谱 JSON，格式：{"diagramType":"flowchart","title":"...","direction":"TD","nodes":[{"id":"a","label":"..."},...],"edges":[{"from":"a","to":"b"},...]}。'
        + '复杂图（>6节点或有分组）使用 canvas 工具创建 diagram 类型成果物，content 填入 mermaid DSL。'
        + '禁止直接输出 Mermaid DSL 到正文，禁止使用 ```mermaid 代码块，禁止在正文暴露 JSON。';
    }

    const suggestedType = artifactType || 'document';
    return `\n\n[系统] 这条请求适合使用 Canvas 表达。使用 canvas 工具创建 ${suggestedType} 类型成果物。${reason || '这条请求适合结构化表达'}`;
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
      + ' 如果当前任务是 Continue、Explain 或 Rewrite，且你要修改现有成果物，请优先使用 canvas 工具的 update action，指定 documentId 为当前活跃文档 ID。'
      + ' 只有在确实需要新增并行成果物时，才使用 create action。\n'
      + `${JSON.stringify(summary, null, 2)}`;
  }

  async _buildSystemPrompt({ systemPrompt, userMessage, history, imageAttachments, sessionKey }) {
    // 会话稳定性止血：暂时停用并发 hypothesis sidecar。
    // 该 sidecar 通过独立 streamChat 运行，历史上会与主 turn 形成并发链路，
    // 触发 turnId 混流与“主会话空收尾”的风险（见 2026-04-17 会话断开排查）。
    // 后续若恢复，需要改为“同 turn 同链路、禁工具、可观测可隔离”的实现。
    const hypothesisResult = null;

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
    if (this.config.ENABLE_BACKGROUND_TASK_DISPATCH !== true) return messages;
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
