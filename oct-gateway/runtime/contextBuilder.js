function parseChineseChapterNumber(input) {
  const raw = String(input || '').trim();
  if (!raw) return NaN;
  if (/^\d+$/.test(raw)) return Number(raw);

  const digitMap = {
    '零': 0,
    '〇': 0,
    '○': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  };
  const unitMap = {
    '十': 10,
    '百': 100,
    '千': 1000,
  };

  let total = 0;
  let current = 0;
  for (const char of raw) {
    if (digitMap[char] != null) {
      current = digitMap[char];
      continue;
    }
    const unit = unitMap[char];
    if (unit != null) {
      total += (current || 1) * unit;
      current = 0;
      continue;
    }
    return NaN;
  }
  return total + current;
}

class ContextBuilder {
  constructor({
    session,
    memory,
    memorySearch,
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
    projectContext,
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
    const projectChapterNotice = await this._buildProjectChapterNotice(userMessage, projectContext);

    const lastUserMsg = typeof messageContent === 'string'
      ? messageContent + contextMemory + backgroundTaskNotice + canvasSuggestionNotice + canvasRoundtripNotice + projectChapterNotice
      : [
          ...messageContent,
          ...(contextMemory ? [{ type: 'text', text: contextMemory }] : []),
          ...(backgroundTaskNotice ? [{ type: 'text', text: backgroundTaskNotice }] : []),
          ...(canvasSuggestionNotice ? [{ type: 'text', text: canvasSuggestionNotice }] : []),
          ...(canvasRoundtripNotice ? [{ type: 'text', text: canvasRoundtripNotice }] : []),
          ...(projectChapterNotice ? [{ type: 'text', text: projectChapterNotice }] : []),
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
      projectContext,
    });

    const recallInjection = await this._buildVectorRecallInjection({ userMessage, sessionKey });
    const messages = this.contextManager.buildApiMessages(history, finalSystemPrompt, lastUserMsg);
    if (recallInjection) {
      messages[0].content += `\n\n${recallInjection}`;
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
      const memoryBackendAlive = await this.memory.isAlive();

      if (!memoryBackendAlive) return '';
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

      const memorySearchResults = await Promise.all(
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

      // ── 结构化记忆结果（身份 / 偏好 / 决策等）──────────────────────────────
      for (const result of memorySearchResults) {
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

      // ── 近期原始对话追加 ───────────────────────────────────────────────────
      if (recallIntent || searchWords.length > 0) {
        try {
          const memoryStore = require('../memory_v2_store');
          const recentTurns = memoryStore.listRecentTurns(recallIntent ? 5 : 3);
          for (const turn of recentTurns) {
            const raw = `${turn.user || ''}\n${turn.assistant || ''}`;
            const shouldUse = recallIntent || searchWords.some((word) => raw.toLowerCase().includes(String(word).toLowerCase()));
            if (!shouldUse) continue;
            memContents.push({
              uri: turn.uri || `core://logs/raw/${String(turn.ts || '').slice(0, 10)}/turn-${turn._index || ''}`,
              content: `[近期对话] 用户说：${String(turn.user || '').slice(0, 70)} -> AI：${String(turn.assistant || '').slice(0, 120)}`,
              priority: 1,
              match_score: recallIntent ? 0.35 : 0.2,
            });
          }
        } catch {}
      }

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
        + '① 默认用 "LR"（从左到右）：主链路横向展开，阶段能力用子节点下挂；只有组织树/纯层级图才用 "TB"。\n'
        + '② 每个节点必须有 group 字段，同类节点放同一 group；group 推荐用「输入层/解析层/AI处理层/人工层/输出层/异常回退」。\n'
        + '③ 主链路控制在 5-7 个节点，节点标签建议 ≤12 个汉字；细节放到每阶段下挂节点，不要排成一根竖线。\n'
        + '④ shape 按语义填写：输入/输出用 "stadium"，判断/条件用 "diamond"，普通处理用 "rect"。\n'
        + '⑤ 有判断/回退时为出边加 label（如"失败"/"不满意"/"通过"），回退边 style 用 "dashed"。\n'
        + '⑥ edges 必须用 "source"/"target"（不是 from/to），ID 与 nodes 里的 id 完全一致。\n'
        + '⑦ 使用 canvas 工具创建 react-flow 类型成果物，content 填入 JSON 字符串。\n'
        + 'JSON 格式：{"title":"...","direction":"LR","nodes":[{"id":"a","label":"...","group":"分组","shape":"rect"}],"edges":[{"source":"a","target":"b","label":"可选","style":"solid"}]}';
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
      return '\n\n[系统] 流程图/示意图输出规则（必须严格遵守）：\n'
        + '简单图（≤6节点，TD方向）：把图谱 JSON 放进 ```json 代码围栏里输出，绝不能把 JSON 直接写在句子或正文里。正确示例：\n'
        + '```json\n{"diagramType":"flowchart","title":"...","direction":"TD","nodes":[{"id":"a","label":"..."}],"edges":[{"from":"a","to":"b"}]}\n```\n'
        + '复杂图（>6节点或有分组）：用 canvas 工具创建 diagram 类型成果物，content 填入 mermaid DSL。\n'
        + '硬性禁止：① 禁止在正文/句子中暴露任何 JSON 或 Mermaid 文本；② 禁止用 ```mermaid 代码块；③ JSON 只能出现在 ```json 围栏内。\n'
        + '出图要克制：标签≤12个汉字、层级清晰、不堆砌节点。';
    }

    if (artifactType === 'ui-draft') {
      return '\n\n[系统] 出图协议：手绘语义化 SVG（目标 = 像 Claude artifact 那样精致，且自动适配明暗主题）。\n'
        + '先用一句话说明，再用 canvas 工具创建成果物：artifactType:"ui-draft"，mode:"html"，content 填一个完整的 `<svg viewBox="0 0 宽 高">…</svg>`（节点用 <rect>+<text> 逐个手绘，连线用 <line>/<path>+箭头 marker）。\n'
        + '【颜色必须全部用 CSS 变量，渲染容器已注入，严禁写死十六进制/rgb——这是主题自适应的关键】：\n'
        + '· 文字：标题 var(--color-text-primary)、副标题/边标签 var(--color-text-secondary)；\n'
        + '· 节点底色 fill:var(--color-surface-raised)；描边 stroke:var(--color-border-tertiary) 宽 0.5~1；\n'
        + '· 分组用语义色（同组同色，最多 4~5 组）：var(--cat-purple) var(--cat-green) var(--cat-amber) var(--cat-blue) var(--cat-pink)，用于节点描边或左侧小色条；\n'
        + '· 主连线/箭头 stroke:var(--color-text-tertiary)。\n'
        + '【排版】：在 <svg> 根节点设一次 font-family:var(--font-sans)；节点 rect rx=8、宽≈150~180、高≈56、同层水平等距、层与层垂直等距；text 用 text-anchor="middle" dominant-baseline="central"，标题 14px/字重500，副标题 12px；用 viewBox 自适应、不要写死 width/height 像素。\n'
        + '【对齐 Claude 的精致感】：扁平（无渐变/无重阴影）、留白充足、细描边、用颜色编码分组并在底部放一个小图例（色块+文字）说明每组含义。\n'
        + '【克制】：主链路≤6 节点、节点标签≤12 字、副标题≤5 字，细节放正文不要堆进图里。';
    }

    const suggestedType = artifactType === 'document' ? 'reading' : (artifactType || 'reading');
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
        content: (() => {
          const raw = canvasContext.activeDocument.content || '';
          const LIMIT = 2000;
          return raw.length > LIMIT
            ? raw.substring(0, LIMIT) + `\n…[已截断，全文 ${raw.length} 字，仅展示前 ${LIMIT} 字]`
            : raw;
        })(),
      },
      documents: Array.isArray(canvasContext.documents) ? canvasContext.documents : [],
    };
    return '\n\n[Canvas Context] 以下是当前 Canvas 工作区上下文。'
      + ' 你正在基于这份 artifact 协作，请优先围绕 activeDocument 继续工作。'
      + ' 如果当前任务是 Continue、Explain 或 Rewrite，且你要修改现有成果物，请优先使用 canvas 工具的 update action，指定 documentId 为当前活跃文档 ID。'
      + ' 只有在确实需要新增并行成果物时，才使用 create action。\n'
      + `${JSON.stringify(summary, null, 2)}`;
  }

  async _buildSystemPrompt({ systemPrompt, userMessage, history, imageAttachments, sessionKey, projectContext }) {
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
    const dateStr = `${timeMap.year}-${timeMap.month}-${timeMap.day}`;
    const timeStr = `${timeMap.year}-${timeMap.month}-${timeMap.day} ${timeMap.hour}:${timeMap.minute}:${timeMap.second}`;
    const timeContext = `\n\n[当前时间] ${timeStr} (UTC+8 Asia/Shanghai)`
      + `\n[权威当前日期] 今天是 ${dateStr}。涉及“今天”“最新”“昨天”“本周”等时效判断时，以本条系统注入日期为准；搜索结果中的发布日期只能作为事件日期，不得反推当前日期。`;
    const modelContext = `[当前运行模型] 你当前运行的底层大模型是：\`${this.config.DASHSCOPE_MODEL}\`。当用户问「你是什么大模型」「基于什么模型」时，必须如实回答当前模型名称，严禁说自己是 DeepSeek、GPT、Claude 或其他任何模型。\n\n`;

    let knowledgeContext = '';
    if (this.config.ai_library?.knowledge_search_enabled === true) {
      try {
        const knowledge = await this.aiLibrary.searchKnowledge(userMessage);
        knowledgeContext = this.aiLibrary.formatKnowledgeForPrompt(knowledge);
      } catch (error) {
        this.log.debug('AI.library 检索失败，跳过', { error: error?.message || String(error) });
      }
    }

    const projectContextSection = this._buildProjectContextSection(projectContext);

    return modelContext + finalSystemPrompt + timeContext + projectContextSection + knowledgeContext;
  }

  _buildProjectContextSection(projectContext) {
    if (!projectContext || !projectContext.id) return '';

    const { title, author, total_chars, chapter_count, chapters } = projectContext;
    const charsLabel = total_chars >= 10000
      ? `${(total_chars / 10000).toFixed(1)} 万字`
      : `${total_chars} 字`;

    const chaptersToShow = Array.isArray(chapters) ? chapters.slice(0, 60) : [];
    const chapterLines = chaptersToShow.map((chapter) => {
      const chapterTitle = chapter.title ? chapter.title : `第 ${chapter.chapter_index + 1} 章`;
      const chapterChars = chapter.char_count ? `（${chapter.char_count} 字）` : '';
      return `  ${chapter.chapter_index + 1}. ${chapterTitle}${chapterChars}`;
    });

    if (Array.isArray(chapters) && chapters.length > 60) {
      chapterLines.push(`  ... 共 ${chapter_count} 章（仅展示前 60 章）`);
    }

    return '\n\n[当前项目]\n'
      + `书名：《${title}》\n`
      + `作者：${author || '未知'}\n`
      + `规模：${chapter_count} 章 · ${charsLabel}\n`
      + `目录：\n${chapterLines.join('\n')}\n`
      + '\n注：以上是用户当前选定的书本项目结构信息。'
      + ' 当用户讨论人物、章节、结构或本书范围内的内容时，应默认优先基于这本书来理解问题。'
      + ' 这里只提供书目与章节结构，不代表你已经拥有具体章节原文。';
  }

  async _buildProjectChapterNotice(userMessage, projectContext) {
    if (!projectContext?.id || !userMessage) return '';
    const chapterIndex = this._extractReferencedChapterIndex(userMessage, projectContext);
    if (chapterIndex == null) return '';

    try {
      const chapterData = await this._fetchProjectChapter(projectContext.id, chapterIndex);
      if (!chapterData?.text?.trim()) return '';
      const title = chapterData.chapter?.title || `第 ${chapterIndex + 1} 章`;
      const trimmedText = String(chapterData.text || '').trim();
      const safeText = trimmedText.length > 12000
        ? `${trimmedText.slice(0, 12000)}\n\n[章节正文过长，已截断前 12000 字用于本轮理解]`
        : trimmedText;
      return `\n\n[当前项目章节正文]\n章节：第 ${chapterIndex + 1} 章《${title}》\n以下内容来自当前项目书库，可直接据此回答本轮关于该章节的问题：\n${safeText}`;
    } catch (error) {
      this.log.debug('project chapter fetch failed, continuing without chapter context', {
        projectId: projectContext.id,
        error: error?.message || String(error),
      });
      return '';
    }
  }

  _extractReferencedChapterIndex(userMessage, projectContext) {
    const text = String(userMessage || '').trim();
    if (!text) return null;

    const directArabic = text.match(/第\s*(\d{1,4})\s*章/);
    if (directArabic) {
      const index = Number(directArabic[1]) - 1;
      return this._isValidProjectChapterIndex(index, projectContext) ? index : null;
    }

    const directChinese = text.match(/第\s*([零一二两三四五六七八九十百千〇○]{1,8})\s*章/);
    if (directChinese) {
      const parsed = parseChineseChapterNumber(directChinese[1]);
      const index = parsed - 1;
      return this._isValidProjectChapterIndex(index, projectContext) ? index : null;
    }

    const looseArabic = text.match(/(?:^|\D)(\d{1,4})\s*章/);
    if (looseArabic) {
      const index = Number(looseArabic[1]) - 1;
      return this._isValidProjectChapterIndex(index, projectContext) ? index : null;
    }

    return null;
  }

  _isValidProjectChapterIndex(index, projectContext) {
    if (!Number.isInteger(index) || index < 0) return false;
    if (Array.isArray(projectContext?.chapters) && projectContext.chapters.length > 0) {
      return projectContext.chapters.some((chapter) => Number(chapter.chapter_index) === index);
    }
    return index < Number(projectContext?.chapter_count || 0);
  }

  async _fetchProjectChapter(projectId, chapterIndex) {
    const base = String((this.config.ai_library && this.config.ai_library.url) || this.config.AI_LIBRARY_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
    const response = await fetch(`${base}/api/library/${encodeURIComponent(projectId)}/chapter/${chapterIndex}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`PROJECT_CHAPTER_HTTP_${response.status}:${body.slice(0, 120)}`);
    }
    const payload = await response.json();
    return {
      chapter: payload?.chapter || null,
      text: String(payload?.text || ''),
    };
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
