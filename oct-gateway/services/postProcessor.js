const { sanitizeAssistantReply } = require('../cot_sanitize');
const memoryRawLog = require('../memory_raw_log');

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
    this.log = logger;
  }

  process({ userMessage, assistantReply, sessionKey, prevAssistantReply, toolsUsed, attachments }) {
    this.nocturneQueue.enqueue(
      () => this.memoryFeedback.detectAndSaveFeedback(userMessage, assistantReply),
      'memoryFeedback'
    );
    this.nocturneQueue.enqueue(
      () => this.detectAndSaveParking(userMessage, sessionKey),
      'detectAndSaveParking'
    );
    this.nocturneQueue.enqueue(
      () => memoryRawLog.saveRawTurn({
        userMessage,
        assistantReply,
        sessionKey,
        toolsUsed: toolsUsed || [],
        attachments: attachments || [],
        dedupeKey: memoryRawLog.makeRawTurnDedupeKey({ userMessage, assistantReply, sessionKey }),
      }),
      'saveRawTurn'
    );
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

  async extractAndSaveMemory(userMsg, assistantReply) {
    // 已在 v0.4.0 禁用：由 L2/L1/L0 三级摘要系统取代。
    // 旧行为：触发词检测 + AI 生成 50 字摘要；问题是 URI 混乱、上下文丢失。
    this.log.debug('[Memory] extractAndSaveMemory 已禁用（由三级摘要取代）');
    return;

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
