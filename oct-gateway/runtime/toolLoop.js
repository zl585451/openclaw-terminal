class ToolLoop {
  constructor({
    toolLoader,
    log,
    streamChat,
    buildToolSignature,
    maxToolRounds,
    maxIdenticalToolSignatures,
  }) {
    this.toolLoader = toolLoader;
    this.log = log;
    this.streamChat = streamChat;
    this.buildToolSignature = buildToolSignature;
    this.maxToolRounds = maxToolRounds;
    this.maxIdenticalToolSignatures = maxIdenticalToolSignatures;
  }

  async handleToolCalls({
    toolCalls,
    toolRound,
    toolSignatures,
    fullText,
    totalUsage,
    responseModel,
    assistantResponseMessage,
    truncatedMessages,
    onDelta,
    onDone,
    onError,
    onToolEvent,
    flushThinkAtEnd,
    turnId,
  }) {
    const normalizedToolCalls = toolCalls.filter(Boolean);
    const toolSignature = this.buildToolSignature(normalizedToolCalls);
    const repeatedCount = toolSignatures.filter((signature) => signature === toolSignature).length;

    if (toolRound >= this.maxToolRounds || repeatedCount >= this.maxIdenticalToolSignatures) {
      const stopReason =
        toolRound >= this.maxToolRounds
          ? `工具探索轮次已达到上限（${this.maxToolRounds} 轮）`
          : '检测到重复的工具调用模式';
      const gracefulStop =
        `${fullText ? `${fullText}\n\n` : ''}` +
        `⚠️ ${stopReason}，我先停止继续自动试探工具，避免一直卡住。` +
        `\n\n目前已拿到一部分工具结果，但还没整理成最终结论。你可以：` +
        `\n1. 让我基于当前结果直接总结` +
        `\n2. 把问题缩小到更明确的文件或模块` +
        `\n3. 让我优先用 read_file 分析，少用命令行工具`;
      this.log.warn('tool loop guard triggered', {
        toolRound,
        repeatedCount,
        signaturePreview: toolSignature.slice(0, 240),
      });
      flushThinkAtEnd();
      onDone(gracefulStop, totalUsage, responseModel);
      return true;
    }

    this.log.info('tool_calls', { count: normalizedToolCalls.length, toolRound: toolRound + 1, turnId: turnId || null });
    const toolResults = [];
    for (const toolCall of normalizedToolCalls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch {}
      this.log.info('tool call', { name: toolCall.function.name, args, turnId: turnId || null });
      const toolName = toolCall.function.name;
      const toolTimeoutMs = this.toolLoader.getToolMeta?.(toolName)?.timeoutMs || 30000;

      if (onToolEvent) {
        try { onToolEvent({ type: 'tool_call', tool: toolName, args, callId: toolCall.id, state: 'executing' }); } catch {}
      }

      const _toolStart = Date.now();
      let toolFailed = false;
      const result = await Promise.race([
        this.toolLoader.executeTool(toolName, args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`工具 ${toolName} 超时（${Math.round(toolTimeoutMs / 1000)}秒）`)), toolTimeoutMs)
        ),
      ]).catch((error) => {
        toolFailed = true;
        this.log.error(`工具 ${toolName} 执行失败`, {
          ms: Date.now() - _toolStart,
          error: error.message,
          timeoutMs: toolTimeoutMs,
          turnId: turnId || null,
        });
        if (onToolEvent) {
          try { onToolEvent({ type: 'tool_result', tool: toolName, callId: toolCall.id, state: 'error', error: error.message, elapsedMs: Date.now() - _toolStart }); } catch {}
        }
        return `工具执行失败: ${error.message}，请稍后重试或换个方式表达需求。`;
      });

      if (!toolFailed) {
        this.log.info('tool done', {
          name: toolName,
          ms: Date.now() - _toolStart,
          round: toolRound + 1,
          timeoutMs: toolTimeoutMs,
          turnId: turnId || null,
        });
      }

      if (result && typeof result === 'object' && result.workbenchEvent && onToolEvent) {
        try {
          onToolEvent({
            type: 'workbench',
            action: result.workbenchEvent.action,
            payload: result.workbenchEvent.payload,
          });
        } catch {}
      } else if (result && typeof result === 'object' && result.canvasEvent && onToolEvent) {
        try {
          onToolEvent({
            type: 'canvas',
            action: result.canvasEvent.action,
            payload: result.canvasEvent.payload,
          });
        } catch {}
      }

      if (onToolEvent) {
        let resultPreview = '';
        try {
          resultPreview = JSON.stringify(result).slice(0, 200);
        } catch {
          resultPreview = '[unserializable tool result]';
        }
        try {
          onToolEvent({
            type: 'tool_result',
            tool: toolName,
            callId: toolCall.id,
            state: 'done',
            resultPreview,
            elapsedMs: Date.now() - _toolStart,
          });
        } catch {}
      }

      toolResults.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify(result),
      });
    }

    const assistantToolMessage = assistantResponseMessage && typeof assistantResponseMessage === 'object'
      ? {
          role: 'assistant',
          content: assistantResponseMessage.content || '',
          tool_calls: normalizedToolCalls,
        }
      : {
          role: 'assistant',
          content: '',
          tool_calls: normalizedToolCalls,
        };

    const continuedMessages = [
      ...truncatedMessages,
      assistantToolMessage,
      ...toolResults,
    ];
    await this.streamChat({
      messages: continuedMessages,
      onDelta,
      onDone,
      onError,
      onToolEvent,
      preserveToolChain: true,
      toolRound: toolRound + 1,
      toolSignatures: [...toolSignatures, toolSignature].slice(-8),
      turnId,
    });
    return true;
  }
}

module.exports = ToolLoop;
