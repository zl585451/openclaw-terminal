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
      onDelta: smoother.feed,
      onToolEvent: (evt) => emitter.onToolEvent(evt),
      onDone: (_text, usage, responseModel) => {
        if (streamCtrl.isCancelled()) return;

        emitter.onBeforeDone?.();
        streamCtrl.flush();

        const finalizedReply = streamCtrl.getFullReply() || _text || '';
        const sanitizedReply = this.sanitizeAssistantReply(finalizedReply);
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
        });
        this.log.info('stream done', { len: sanitizedReply.length });
      },
      onError: (err) => {
        if (streamCtrl.isCancelled()) return;
        emitter.onError(err);
      },
    });

    return streamCtrl;
  }
}

module.exports = ChatEngine;
