const StreamController = require('./streamController');

class ChatEngine {
  constructor({
    streamChat,
    session,
    postProcessor,
    sanitizeAssistantReply,
    streamControllerFactory,
    logger,
  }) {
    this.streamChat = streamChat;
    this.session = session;
    this.postProcessor = postProcessor;
    this.sanitizeAssistantReply = sanitizeAssistantReply;
    this.streamControllerFactory = streamControllerFactory;
    this.log = logger;
  }

  async execute(request, emitter) {
    const streamCtrl = this.streamControllerFactory(emitter, request.options?.pacingMs);
    const smoother = streamCtrl.createSmoother();
    emitter.onStart?.(streamCtrl);

    await this.streamChat({
      messages: request.messages,
      toolChoice: request.toolChoice || 'auto',
      turnId: request.turnId,
      onDelta: smoother.feed,
      onToolEvent: (evt) => emitter.onToolEvent(evt),
      onDone: (_text, usage, responseModel) => {
        if (streamCtrl.isCancelled()) return;

        emitter.onBeforeDone?.();
        streamCtrl.flush();

        const finalizedReply = streamCtrl.getFullReply() || _text || '';
        let sanitizedReply = this.sanitizeAssistantReply(finalizedReply);
        if (!sanitizedReply || !String(sanitizedReply).trim()) {
          sanitizedReply = '⚠️ 本轮未产出可用内容（可能是模型状态异常）。请重试，或切换模型后再继续。';
          this.log.warn('empty assistant reply coerced to fallback text', {
            turnId: request.turnId || null,
          });
        }
        if (sanitizedReply) {
          this.session.addMessage(request.sessionKey, 'assistant', sanitizedReply);
          this.postProcessor.process({
            userMessage: request.userMessage,
            assistantReply: sanitizedReply,
            sessionKey: request.sessionKey,
            prevAssistantReply: request.prevAssistantReply || '',
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
