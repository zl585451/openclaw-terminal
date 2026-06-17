class MessageRouter {
  constructor({ slashHandler, sessionManager, chatHandler }) {
    this.slash = slashHandler;
    this.session = sessionManager;
    this.chatHandler = chatHandler;
  }

  async handleRequest(request, connection) {
    const { type, method, params, id } = request || {};
    if (type !== 'req') return false;

    if (method === 'chat.send') {
      const userMessage = params?.message || '';
      if (userMessage.startsWith('/')) {
        connection.abortCurrent?.();
        connection.setAbort?.(null);
        connection.stopThinkingPulse?.();
        connection.send?.({ type: 'event', event: 'agent-phase', phase: 'idle' });
        await this.slash.handle(userMessage.trim(), request, connection);
        return true;
      }
      if (!this.chatHandler) {
        return false;
      }
      await this.chatHandler(request, connection);
      return true;
    }

    if (method === 'chat.cancel') {
      connection.abortCurrent?.();
      connection.setAbort?.(null);
      connection.stopThinkingPulse?.();
      connection.send?.({ type: 'event', event: 'agent-phase', phase: 'idle' });
      connection.send?.({
        type: 'res',
        id,
        ok: true,
        payload: { cancelled: true },
      });
      return true;
    }

    if (method === 'sessions.list') {
      connection.send({
        type: 'res',
        id,
        ok: true,
        payload: { sessions: this.session.listSessions() },
      });
      return true;
    }

    connection.send({
      type: 'res',
      id,
      ok: false,
      error: { message: `Unknown method: ${method}` },
    });
    return true;
  }
}

module.exports = MessageRouter;
