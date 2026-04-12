const { sanitizeAssistantReply } = require('../cot_sanitize');

class PostProcessor {
  constructor({
    memoryModule,
    sessionModule,
    streamChat,
    memoryGovernor,
    memoryFeedback,
    memoryHistory,
    clarificationMemory,
    nocturneQueue,
    mem0Client,
    logger,
  }) {
    this.memory = memoryModule;
    this.session = sessionModule;
    this.streamChat = streamChat;
    this.memoryGovernor = memoryGovernor;
    this.memoryFeedback = memoryFeedback;
    this.memoryHistory = memoryHistory;
    this.clarificationMemory = clarificationMemory;
    this.nocturneQueue = nocturneQueue;
    this.mem0Client = mem0Client || null;
    this.log = logger;
  }

  process({ userMessage, assistantReply, sessionKey, prevAssistantReply }) {
    this.nocturneQueue.enqueue(
      () => this.memoryFeedback.detectAndSaveFeedback(userMessage, assistantReply),
      'memoryFeedback'
    );
    this.nocturneQueue.enqueue(
      () => this.detectAndSaveParking(userMessage, sessionKey),
      'detectAndSaveParking'
    );
    this.nocturneQueue.enqueue(
      () => this.memoryHistory.saveHistorySummary(userMessage, assistantReply),
      'memoryHistory'
    );
    this._extractMemoryWithFallback(userMessage, assistantReply);
    this.nocturneQueue.enqueue(
      () => this.clarificationMemory.detectAndSaveClarification(
        userMessage,
        assistantReply,
        prevAssistantReply
      ),
      'clarificationMemory'
    );
  }

  async detectAndSaveParking(userMsg, sessionKey) {
    const msg = (userMsg || '').trim();
    const parkingTriggers = [
      '停车', '先记下来', '稍后处理', '先放着',
      '待会处理', '暂时记录', '先不管', '记一下',
      '回头再说', '先搁置',
    ];

    const isParking = parkingTriggers.some((trigger) => msg.includes(trigger));
    if (!isParking) return;

    let content = msg;
    for (const trigger of parkingTriggers) {
      content = content.replace(trigger, '').replace(/[：:]/g, '').trim();
    }
    if (!content || content.length < 2) return;

    const alive = await this.memory.isAlive();
    if (!alive) return;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    const uri = `core://my_user/daily/${dateStr}/parking_lot/${timeStr}`;

    await this.memory.writeMemory(uri, JSON.stringify({
      item: content,
      time: now.toTimeString().slice(0, 5),
      done: false,
      session: sessionKey,
    }), 1, '停车场待办，下次会话开始时检查');

    this.log.info('parking saved', { content });
  }

  /**
   * 快速判断用户消息是否可能含有值得提取的个人事实。
   * 命中任意一个信号才调 Mem0，否则直接跳过，节省 LLM 费用。
   *
   * 信号分两类：
   *   强信号（中文第一人称）：我、我的、我是、我有、我在、我喜欢…
   *   弱信号（个人信息关键词）：名字、工作、住、喜欢、讨厌、习惯、生日、家、学、会…
   */
  _shouldExtractMemory(userMessage) {
    if (!userMessage || userMessage.trim().length < 4) return false;
    const msg = userMessage;

    // ── 排除项：图片 / 截图 / 文件发送（无论是否含「我」）──────────────────
    // \u56fe\u7247=图片 \u622a\u56fe=截图 \u56fe\u50cf=图像 \u7167\u7247=照片
    // \u9644\u4ef6=附件 \u6587\u4ef6=文件
    const imageWords = ['\u56fe\u7247', '\u622a\u56fe', '\u56fe\u50cf', '\u7167\u7247', '\u9644\u4ef6'];
    const actionWords = ['\u53d1\u9001', '\u5206\u4eab', '\u4e0a\u4f20', '\u53d1\u4e86', '\u770b\u770b'];
    const hasImage = imageWords.some((w) => msg.includes(w));
    const hasAction = actionWords.some((w) => msg.includes(w));
    // 纯图片操作（短消息 + 图片词）或（图片词 + 动作词）
    if (hasImage && (hasAction || msg.trim().length < 15)) return false;
    // 消息极短且只说"看看这个" / "帮我看" 类
    if (msg.trim().length < 10 && /[\u770b\u8fd9\u8fd9\u4e2a\u90a3\u4e2a]/.test(msg)) return false;

    // 强信号：包含第一人称
    // 使用 Unicode 转义避免文件编码问题
    // \u6211 = 我
    if (/\u6211/.test(msg)) return true;

    // 弱信号：包含个人信息相关词汇
    const weakSignals = [
      '\u540d\u5b57',   // 名字
      '\u53eb\u505a',   // 叫做
      '\u5de5\u4f5c',   // 工作
      '\u804c\u4e1a',   // 职业
      '\u4f4f\u5728',   // 住在
      '\u5bb6\u4e61',   // 家乡
      '\u751f\u65e5',   // 生日
      '\u5e74\u9f84',   // 年龄
      '\u5b66\u4e60',   // 学习
      '\u7231\u597d',   // 爱好
      '\u559c\u6b22',   // 喜欢
      '\u8ba8\u538c',   // 讨厌
      '\u4e60\u60ef',   // 习惯
      '\u76ee\u6807',   // 目标
      '\u8ba1\u5212',   // 计划
    ];
    if (weakSignals.some((w) => msg.includes(w))) return true;

    // 英文弱信号
    const enSignals = /\b(my |i am |i'm |i have |i like |i hate |i work |i live |my name)\b/i;
    if (enSignals.test(msg)) return true;

    return false;
  }

  /**
   * 记忆提取路由：Mem0 优先，不可用时回退到 Nocturne extractAndSaveMemory
   * 前置过滤：消息不含个人信息信号时直接跳过，避免无意义的 LLM 调用
   */
  _extractMemoryWithFallback(userMessage, assistantReply) {
    const self = this;
    // 异步检查 Mem0 存活，不阻塞 process() 返回
    (async () => {
      try {
        const mem0Alive = self.mem0Client && await self.mem0Client.isAlive();
        if (mem0Alive) {
          // ── 前置过滤：消息不含个人信息信号则跳过 ──────────────────────
          if (!self._shouldExtractMemory(userMessage)) {
            self.log.debug('mem0 skip: no personal info signal', {
              preview: (userMessage || '').slice(0, 30),
            });
            return;
          }
          // Mem0 路径：直接异步调用，不经过 nocturneQueue
          self.mem0Client.addMemory(userMessage, assistantReply).catch((e) => {
            self.log.warn('mem0.addMemory failed, fallback to nocturne', {
              error: e?.message || String(e),
            });
            // Mem0 失败时降级到 Nocturne
            self.nocturneQueue.enqueue(
              () => self.extractAndSaveMemory(userMessage, assistantReply),
              'extractAndSaveMemory_fallback'
            );
          });
        } else {
          // Mem0 不可用：原有 Nocturne 路径
          self.nocturneQueue.enqueue(
            () => self.extractAndSaveMemory(userMessage, assistantReply),
            'extractAndSaveMemory'
          );
        }
      } catch (e) {
        // 兜底：任何异常都走 Nocturne 路径
        self.log.warn('_extractMemoryWithFallback error, using nocturne', {
          error: e?.message || String(e),
        });
        self.nocturneQueue.enqueue(
          () => self.extractAndSaveMemory(userMessage, assistantReply),
          'extractAndSaveMemory'
        );
      }
    })();
  }

  async extractAndSaveMemory(userMsg, assistantReply) {
    try {
      const nocturneAlive = await this.memory.isAlive();
      if (!nocturneAlive) return;

      const cleanAssistantReply = sanitizeAssistantReply(assistantReply || '');
      const triggers = [
        '记住', '记一下', '我喜欢', '我不喜欢', '以后', '永远',
        '我的', '我们的', '项目', '决定', '完成了', '发布了',
      ];
      const hasSignal = triggers.some(
        (trigger) => userMsg.includes(trigger) || cleanAssistantReply.includes(trigger)
      );
      if (!hasSignal) return;

      await this.streamChat({
        messages: [
          {
            role: 'system',
            content: '你是记忆提炼助手。从对话中提炼值得长期记忆的关键信息。输出格式：\nURI: core://xxx/xxx\nContent: 简洁的记忆内容（50字内）\nPriority: 1或2\nDisclosure: 触发条件\n\n如果没有值得记忆的内容，只输出：SKIP',
          },
          {
            role: 'user',
            content: `用户说：${userMsg.slice(0, 200)}\nAI回复：${cleanAssistantReply.slice(0, 200)}`,
          },
        ],
        onDelta: () => {},
        onDone: async (text) => {
          if (!text || text.includes('SKIP')) return;
          const uriMatch = text.match(/URI:\s*(\S+)/);
          const contentMatch = text.match(/Content:\s*(.+?)(?=\n|$)/s);
          const priorityMatch = text.match(/Priority:\s*(\d)/);
          const disclosureMatch = text.match(/Disclosure:\s*(.+?)(?=\n|$)/s);
          if (!uriMatch || !contentMatch) return;

          const uri = uriMatch[1].trim();
          const content = contentMatch[1].trim();
          const priority = parseInt(priorityMatch?.[1] || '2', 10);
          const disclosure = (disclosureMatch?.[1] || '').trim();
          const blockedPaths = ['taskboard', 'tasks', 'parking', 'parking_lot'];
          const isBlocked = blockedPaths.some((pathPart) => uri.toLowerCase().includes(pathPart));
          if (isBlocked) {
            this.log.debug('memory extract skip blocked path', { uri });
            return;
          }

          const routed = this.memoryGovernor.routeRecord({
            source: 'extract_memory',
            uri,
            content,
            priority,
            disclosure,
            userMsg,
            assistantReply: cleanAssistantReply,
          });

          if (routed.decision === 'reject') {
            this.log.debug('memory governor rejected extracted memory', { uri, reason: routed.reason });
            return;
          }

          await this.memory.writeMemory(
            routed.uri,
            routed.content,
            routed.priority ?? priority,
            routed.disclosure ?? disclosure
          );
          this.log.info('memory extracted write ok', {
            uri: routed.uri,
            originalUri: uri,
            contentLen: routed.content.length,
            priority: routed.priority ?? priority,
            decision: routed.decision,
            layer: routed.layer,
          });
        },
        onError: () => {},
      });
    } catch {
      // 静默失败
    }
  }
}

module.exports = PostProcessor;
