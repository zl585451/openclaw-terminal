'use strict';

const { normalizeRenderBlocks } = require('../services/renderBlocksNormalizer');

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

    // ── Agent 短路：专职 Agent 已完成（含 clarify 暂停），直接终止，跳过 AMY streamChat ──
    if (orchResult.agentResult) {
      const ar = orchResult.agentResult;
      const agentName = orchResult.agent || 'Agent';

      // 通知前端：agent 阶段结束
      connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });

      if (ar.status === 'waiting_user_reply') {
        // request_clarify 暂停：clarify 事件已由 sendToolEvent 推送，此处只发空 done 供前端触发抑制
        log.info('agent_clarify_pause', { agent: agentName, turnsUsed: ar.turnsUsed });
        try { session.addMessage(sessionKey, 'user', userMessage); } catch {}
        connection.send({
          type: 'event',
          event: 'chat',
          payload: { text: '', state: 'done', done: true, turnId, agentName },
        });
        stopKeepalive?.();
        return;
      }

      // 正常完成（status === 'completed' 或旧格式无 status）
      const agentReply = normalizeReply(ar.result || '');
      log.info('agent_result_shortcut', {
        agent: agentName,
        turnsUsed: ar.turnsUsed,
        tokensUsed: ar.tokensUsed,
        replyLen: agentReply.length,
      });

      // 把结果存入 session history（让后续对话能感知到）
      try { session.addMessage(sessionKey, 'user', userMessage); } catch {}
      if (agentReply) {
        try { session.addMessage(sessionKey, 'assistant', agentReply); } catch {}
      }

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
          tokensUsed: ar.tokensUsed,
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
      onSegment: (seg) => {
        // B1: 段协议双发（与裸 delta 并行）。前端在 B2 前忽略，仅作影子观测。
        if (cancelled || !connection.isOpen() || !seg) return;
        connection.send({
          type: 'event',
          event: 'chat',
          payload: { turnId, seg },
        });
      },
      onAnswerReset: () => {
        // 工具续轮：通知前端清空当前流式气泡的正文（保留气泡与工具卡片），
        // 等下一轮最终答案重新填充，避免上一轮正文与最终答案重复堆叠。
        if (cancelled || !connection.isOpen()) return;
        if (keepalivePhase === 'streaming') keepalivePhase = 'waiting_continuation';
        connection.send({
          type: 'event',
          event: 'chat',
          payload: { reset: true, state: 'reset', done: false, turnId },
        });
      },
      onBeforeDone: () => {
        connection.setAbort?.(null);
        connection.stopThinkingPulse?.();
      },
      onDone: ({ reply, usage, model: responseModel, turnId: doneTurnId }) => {
        stopKeepalive();
        if (cancelled || !connection.isOpen()) return;
        const normalizedReply = normalizeReply(reply);
        const donePayload = { text: normalizedReply, state: 'done', done: true, turnId: doneTurnId || turnId };
        const renderProtocol = normalizeRenderBlocks(normalizedReply);
        if (
          renderProtocol
          && renderProtocol.source !== 'markdown'
          && Array.isArray(renderProtocol.blocks)
          && renderProtocol.blocks.length > 0
          && (!Array.isArray(renderProtocol.errors) || renderProtocol.errors.length === 0)
        ) {
          donePayload.renderBlocks = renderProtocol.blocks;
          donePayload.renderProtocol = {
            version: renderProtocol.version,
            source: renderProtocol.source,
            errors: renderProtocol.errors || [],
          };
        }
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
