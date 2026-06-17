const StreamController = require('./streamController');
const { TurnSegmentTracker } = require('./turnSegmentTracker');

class ChatEngine {
  constructor({
    streamChat,
    session,
    postProcessor,
    sanitizeAssistantReply,
    normalizeAssistantMarkdown,
    streamControllerFactory,
    logger,
  }) {
    this.streamChat = streamChat;
    this.session = session;
    this.postProcessor = postProcessor;
    this.sanitizeAssistantReply = sanitizeAssistantReply;
    this.normalizeAssistantMarkdown = normalizeAssistantMarkdown || ((text) => text);
    this.streamControllerFactory = streamControllerFactory;
    this.log = logger;
  }

  async execute(request, emitter) {
    const streamCtrl = this.streamControllerFactory(emitter, request.options?.pacingMs);
    // 段追踪器：把内部文本 delta、工具、终止信号翻译为对外 segment 事件。
    const segments = new TurnSegmentTracker({
      turnId: request.turnId,
      emit: (seg) => { try { emitter.onSegment?.(seg); } catch { /* segment emission must not break the stream */ } },
    });
    if (typeof streamCtrl.attachSegmentTracker === 'function') {
      streamCtrl.attachSegmentTracker(segments);
    }
    const smoother = streamCtrl.createSmoother();
    emitter.onStart?.(streamCtrl);

    await this.streamChat({
      messages: request.messages,
      toolChoice: request.toolChoice || 'auto',
      turnId: request.turnId,
      capability: request.capability,
      onDelta: smoother.feed,
      onToolEvent: (evt) => {
        // 段边界：工具开始→闭文本段开 tool_use 段；工具结束→闭 tool_use 段。
        if (evt?.type === 'tool_call') segments.toolOpen(evt.tool, evt.callId);
        else if (evt?.type === 'tool_result') segments.toolResult();
        emitter.onToolEvent(evt);
      },
      onRoundReset: () => {
        // 进入下一轮工具续写前，清空上一轮已输出的正文（后端缓冲 + 前端气泡），
        // 确保最终答案只保留最后一轮，杜绝跨轮累加导致的重复输出。
        if (streamCtrl.isCancelled()) return;
        streamCtrl.resetReply();
        segments.closeCurrent();
        emitter.onAnswerReset?.();
      },
      onDone: (_text, usage, responseModel) => {
        if (streamCtrl.isCancelled()) return;

        emitter.onBeforeDone?.();
        streamCtrl.flush();
        // B1: 闭合最后一段并发 finish（stopReason 显式枚举；B1 先用 end_turn）。
        segments.finish('end_turn');

        const finalizedReply = streamCtrl.getFullReply() || _text || '';
        let sanitizedReply = this.sanitizeAssistantReply(finalizedReply);
        sanitizedReply = this.normalizeAssistantMarkdown(sanitizedReply);
        if (!sanitizedReply || !String(sanitizedReply).trim()) {
          if (finalizedReply && String(finalizedReply).trim()) {
            sanitizedReply = '';
            this.log.info('assistant reply suppressed after protocol normalization', {
              turnId: request.turnId || null,
            });
          } else {
            sanitizedReply = '⚠️ 本轮未产出可用内容（可能是模型状态异常）。请重试，或切换模型后再继续。';
            this.log.warn('empty assistant reply coerced to fallback text', {
              turnId: request.turnId || null,
            });
          }
        }
        if (sanitizedReply && String(sanitizedReply).trim()) {
          this.session.addMessage(request.sessionKey, 'assistant', sanitizedReply);
          this.postProcessor.process({
            userMessage: request.userMessage,
            assistantReply: sanitizedReply,
            sessionKey: request.sessionKey,
            prevAssistantReply: request.prevAssistantReply || '',
            toolsUsed: [],
            attachments: [],
          });
        }

        emitter.onDone({
          reply: sanitizedReply,
          usage,
          model: responseModel,
          turnId: request.turnId,
        });
        this.log.info('stream done', { len: sanitizedReply.length, turnId: request.turnId || null });
      },
      onError: (err) => {
        if (streamCtrl.isCancelled()) return;
        this.log.error('stream error', { turnId: request.turnId || null, error: err?.message || String(err) });
        emitter.onError(err);
      },
    });

    return streamCtrl;
  }
}

module.exports = ChatEngine;
