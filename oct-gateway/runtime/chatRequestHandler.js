'use strict';

function createChatRequestHandler({
  orchestrator,
  contextBuilder,
  chatEngine,
  systemPromptReady,
  session,
  normalizeAssistantText,
  sendCanvasTransportEvent,
  logger,
}) {
  if (!orchestrator || !contextBuilder || !chatEngine || !systemPromptReady || !session) {
    throw new Error('createChatRequestHandler requires orchestrator, contextBuilder, chatEngine, systemPromptReady, and session');
  }

  const normalizeReply = typeof normalizeAssistantText === 'function'
    ? normalizeAssistantText
    : (raw) => (typeof raw === 'string' ? raw.trim() : '');
  const log = logger || console;

  return async function handleChatRequest(request, connection) {
    const params = request?.params || {};
    const turnId = request?.id || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionKey = params?.sessionKey || 'main';
    const userMessage = params?.message || '';
    const attachments = params?.attachments || [];
    const workbenchContext = params?.workbenchContext || params?.canvasContext || null;
    const projectContext = params?.projectContext || null;
    let keepalivePhase = 'waiting_first_token';
    let keepaliveToolName = null;
    const keepaliveStartTime = Date.now();
    let keepaliveTimer = null;
    const stopKeepalive = () => {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
    };

    const sendToolEvent = (evt) => {
      if (evt?.type === 'tool_call') {
        keepalivePhase = 'tool_running';
        keepaliveToolName = evt.tool || null;
      } else if (evt?.type === 'tool_result') {
        keepalivePhase = 'waiting_continuation';
        keepaliveToolName = null;
      }
      if (!connection.isOpen()) return;
      if ((evt?.type === 'workbench' || evt?.type === 'canvas') && evt.action) {
        sendCanvasTransportEvent(connection, evt.action, evt.payload || {}, evt.type === 'workbench' ? 'workbench' : 'canvas');
        return;
      }
      if (evt?.type === 'clarify_open' && evt?.payload?.spec) {
        connection.send({
          type: 'event',
          event: 'clarify',
          payload: { spec: evt.payload.spec },
        });
        return;
      }
      connection.send({ type: 'event', event: 'tool', payload: evt });
      if (evt.type === 'tool_call') {
        connection.send({ type: 'event', event: 'agent-phase', phase: 'tool_executing', tool: evt.tool });
      }
      if (evt.type === 'tool_result') {
        connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
      }
      // Agent 状态事件 → 单独推送 agent_status phase
      if (evt.type === 'agent_status') {
        connection.send({
          type: 'event',
          event: 'agent-phase',
          phase: evt.status === 'running' ? 'agent_running' : evt.status === 'done' ? 'thinking' : 'idle',
          agent: evt.agent,
        });
      }
    };

    const orchResult = await orchestrator.dispatch(userMessage, sessionKey, sendToolEvent);

    // ── Agent 短路：专职 Agent 执行完成，直接发结果给用户，跳过 AMY streamChat ──
    if (orchResult.agentResult && orchResult.agentResult.result) {
      const agentReply = normalizeReply(orchResult.agentResult.result);
      const agentName = orchResult.agent || 'Agent';
      log.info('agent_result_shortcut', {
        agent: agentName,
        turnsUsed: orchResult.agentResult.turnsUsed,
        tokensUsed: orchResult.agentResult.tokensUsed,
        replyLen: agentReply.length,
      });

      // 把结果存入 session history（让后续对话能感知到）
      try { session.addMessage(sessionKey, 'user', userMessage); } catch {}
      if (agentReply) {
        try { session.addMessage(sessionKey, 'assistant', agentReply); } catch {}
      }

      // 通知前端：agent 阶段结束
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
      // 推送 agent_status done 事件
      connection.send({
        type: 'event',
        event: 'tool',
        payload: { type: 'agent_status', agent: agentName, status: 'done', taskId: `orch_${turnId}` }
      });
      // 推送最终回复
      connection.send({
        type: 'event',
        event: 'chat',
        payload: {
          text: agentReply,
          state: 'done',
          done: true,
          turnId,
          agentName,
          tokensUsed: orchResult.agentResult.tokensUsed,
        },
      });

      stopKeepalive?.();
      return;
    }

    const systemPrompt = await systemPromptReady;
    const { messages, history } = await contextBuilder.build({
      sessionKey,
      userMessage,
      attachments,
      workbenchContext,
      orchestratorResult: orchResult,
      systemPrompt,
      projectContext,
    });

    connection.send({ type: 'event', event: 'agent-phase', phase: 'thinking' });
    connection.startThinkingPulse?.(8000);
    connection.abortCurrent?.();
    let cancelled = false;
    connection.setAbort?.(() => { cancelled = true; });

    const prevAssistantReplyForPost = history.filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';
    keepaliveTimer = setInterval(() => {
      if (!connection.isOpen()) return;
      const elapsed = Date.now() - keepaliveStartTime;
      try {
        connection.send({
          type: 'event',
          event: 'keepalive',
          payload: {
            phase: keepalivePhase,
            elapsedMs: elapsed,
            toolName: keepaliveToolName,
          },
        });
      } catch {
        // ignore keepalive failures
      }
    }, 2000);

    await chatEngine.execute({
      turnId,
      sessionKey,
      userMessage,
      messages,
      prevAssistantReply: prevAssistantReplyForPost,
      toolChoice: orchResult?.canvasIntent?.shouldUseCanvas ? { type: 'function', function: { name: 'canvas' } } : 'auto',
      options: {
        pacingMs: typeof params?.pacingMs === 'number' ? params.pacingMs : 4,
      },
    }, {
      onStart: (streamCtrl) => {
        connection.setAbort?.(() => {
          cancelled = true;
          streamCtrl.cancel();
        });
      },
      onDelta: (chunk) => {
        if (cancelled || !connection.isOpen()) return;
        if (keepalivePhase === 'waiting_first_token') keepalivePhase = 'streaming';
        connection.send({
          type: 'event',
          event: 'chat',
          payload: { delta: chunk, state: 'delta', done: false, turnId },
        });
      },
      onToolEvent: sendToolEvent,
      onBeforeDone: () => {
        connection.setAbort?.(null);
        connection.stopThinkingPulse?.();
      },
      onDone: ({ reply, usage, model: responseModel, turnId: doneTurnId }) => {
        stopKeepalive();
        if (cancelled || !connection.isOpen()) return;
        const normalizedReply = normalizeReply(reply);
        const donePayload = { text: normalizedReply, state: 'done', done: true, turnId: doneTurnId || turnId };
        if (usage) donePayload.usage = usage;
        if (responseModel) donePayload.model = responseModel;
        connection.send({ type: 'event', event: 'chat', payload: donePayload });
        connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
      },
      onError: (err) => {
        stopKeepalive();
        if (cancelled) return;
        connection.setAbort?.(null);
        connection.stopThinkingPulse?.();
        log.error('AI error', { error: err?.message || String(err), turnId });
        if (!connection.isOpen()) return;
        connection.send({
          type: 'event',
          event: 'chat',
          payload: { text: `❌ AI 调用失败：${err.message}`, state: 'done', done: true, turnId },
        });
        connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
      },
    });
  };
}

module.exports = { createChatRequestHandler };
