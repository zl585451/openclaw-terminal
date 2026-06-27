const {
  archiveToolResult,
  truncateToolResult,
} = require('./toolResultArchive');
const { summarizeToolResult } = require('./toolResultSummarizer');

function isStructuredToolResult(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shouldPauseForUserReply(result) {
  return isStructuredToolResult(result) && result.status === 'waiting_user_reply';
}

function shouldFinalizeWithMessage(result) {
  return isStructuredToolResult(result)
    && result.status === 'completed'
    && typeof result.message === 'string'
    && result.message.trim().length > 0;
}

function serializeToolResultForModel(result) {
  if (typeof result === 'string') return result;
  if (!isStructuredToolResult(result)) return JSON.stringify(result);

  const preferredParts = [];
  if (typeof result.message === 'string' && result.message.trim()) {
    preferredParts.push(result.message.trim());
  }
  if (typeof result.error === 'string' && result.error.trim()) {
    preferredParts.push(`错误: ${result.error.trim()}`);
  }
  if (typeof result.hint === 'string' && result.hint.trim()) {
    preferredParts.push(`提示: ${result.hint.trim()}`);
  }
  if (preferredParts.length > 0) {
    return preferredParts.join('\n');
  }

  return JSON.stringify(result);
}

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
    onRoundReset,
    flushThinkAtEnd,
    turnId,
    _omniRouteResolved,
    _disableExternalOmniRoute,
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
        `⚠️ ${stopReason}，已自动停止以避免卡住。` +
        `\n\n已拿到部分工具结果。你可以：` +
        `\n1. 让我基于当前结果直接完成` +
        `\n2. 缩小任务范围后重试` +
        `\n3. 换一种方式描述你的需求`;
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
    let shouldStopAfterToolRound = false;
    const finalizedToolMessages = [];
    for (const toolCall of normalizedToolCalls) {
      let args = {};
      try {
        const toolAdapter = require('./toolAdapter');
        args = toolAdapter.cleanAndParseArguments(toolCall.function.arguments || '{}');
      } catch (err) {
        this.log.error('tool arguments parsing failed', { name: toolCall.function.name, error: err.message });
        const result = `ERROR: Failed to parse arguments for tool "${toolCall.function.name}". Details: ${err.message}`;
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: result,
        });
        if (onToolEvent) {
          try {
            onToolEvent({
              type: 'tool_result',
              tool: toolCall.function.name,
              callId: toolCall.id,
              state: 'error',
              resultPreview: result,
            });
          } catch {}
        }
        continue;
      }
      this.log.info('tool call', { name: toolCall.function.name, args, turnId: turnId || null });
      const toolName = toolCall.function.name;

      const KNOWN_TOOL_NAMES = new Set(
        (this.toolLoader.getDefinitions?.() || [])
          .map((def) => String(def?.function?.name || '').trim())
          .filter(Boolean)
      );

      if (!KNOWN_TOOL_NAMES.has(toolName)) {
        this.log.error('tool execution intercepted: tool is not registered', { toolName, turnId: turnId || null });
        const result = `ERROR: Tool "${toolName}" is not registered or allowed.`;
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: result,
        });
        if (onToolEvent) {
          try {
            onToolEvent({
              type: 'tool_result',
              tool: toolName,
              callId: toolCall.id,
              state: 'error',
              resultPreview: result,
            });
          } catch {}
        }
        continue;
      }

      const toolTimeoutMs = this.toolLoader.getToolMeta?.(toolName)?.timeoutMs || 30000;

      if (onToolEvent) {
        try { onToolEvent({ type: 'tool_call', tool: toolName, args, callId: toolCall.id, state: 'executing' }); } catch {}
      }

      const _toolStart = Date.now();
      let toolFailed = false;
      const result = await Promise.race([
        this.toolLoader.executeTool(toolName, args, { onToolEvent }),
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
        } catch (err) {
          this.log.warn('workbenchEvent 转发失败', { error: err?.message });
        }
      } else if (result && typeof result === 'object' && result.canvasEvent && onToolEvent) {
        try {
          onToolEvent({
            type: 'canvas',
            action: result.canvasEvent.action,
            payload: result.canvasEvent.payload,
          });
        } catch (err) {
          this.log.warn('canvasEvent 转发失败', { error: err?.message });
        }
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

      // 1. 先把完整结果归档
      try {
        archiveToolResult({
          callId: toolCall.id,
          toolName,
          args,
          result,
          turnId: turnId || null,
        });
      } catch (e) {
        this.log.warn('archiveToolResult 失败', { error: e?.message });
      }

      if (shouldPauseForUserReply(result)) {
        shouldStopAfterToolRound = true;
        continue;
      }

      if (shouldFinalizeWithMessage(result)) {
        finalizedToolMessages.push(result.message.trim());
        continue;
      }

      // 2. 截断后再放进 messages
      const { truncated, value: truncatedResult, originalSize } = truncateToolResult(
        toolName,
        result,
        toolCall.id,
      );

      if (truncated) {
        this.log.info('工具结果已截断', {
          tool: toolName,
          callId: toolCall.id,
          originalSize,
          turnId: turnId || null,
        });
      }

      const contentForModel = serializeToolResultForModel(truncatedResult);
      const summarized = await summarizeToolResult(toolName, contentForModel);

      if (summarized.mode === 'noop') {
        this.log.debug?.('tool result summarizer noop', {
          toolName,
          reason: summarized.reason,
        });
      } else {
        this.log.info('tool result summarizer', {
          toolName,
          mode: summarized.mode,
          latencyMs: summarized.latencyMs,
          originalChars: contentForModel.length,
          finalChars: summarized.text.length,
        });
      }

      toolResults.push({
        tool_call_id: toolCall.id,
        tool_name: toolName,
        role: 'tool',
        content: summarized.text,
        ...(toolCall?.extra_content?.google_native
          ? {
              google_native_content: {
                role: 'user',
                parts: [{
                  functionResponse: {
                    name: toolName,
                    response: { output: summarized.text },
                  },
                }],
              },
            }
          : {}),
      });

    }

    if (shouldStopAfterToolRound) {
      flushThinkAtEnd();
      onDone('', totalUsage, responseModel);
      return true;
    }

    if (finalizedToolMessages.length > 0) {
      flushThinkAtEnd();
      onDone(finalizedToolMessages.join('\n\n'), totalUsage, responseModel);
      return true;
    }

    const assistantToolMessage = assistantResponseMessage && typeof assistantResponseMessage === 'object'
      ? {
          role: 'assistant',
          content: assistantResponseMessage.content || '',
          ...(typeof assistantResponseMessage.reasoning_content === 'string'
            && assistantResponseMessage.reasoning_content.length > 0
            ? { reasoning_content: assistantResponseMessage.reasoning_content }
            : {}),
          tool_calls: normalizedToolCalls,
          ...(assistantResponseMessage.google_native_content
            ? { google_native_content: assistantResponseMessage.google_native_content }
            : {}),
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
    // 进入下一轮续写前清空上一轮已输出的正文：续写轮会重新生成完整答案，
    // 若不清空，上一轮正文会与最终答案在同一气泡里累加，造成内容重复输出。
    if (typeof onRoundReset === 'function') {
      try { onRoundReset(); } catch {}
    }
    await this.streamChat({
      messages: continuedMessages,
      onDelta,
      onDone,
      onError,
      onToolEvent,
      onRoundReset,
      preserveToolChain: true,
      toolRound: toolRound + 1,
      toolSignatures: [...toolSignatures, toolSignature].slice(-8),
      turnId,
      capability: 'default',
      _omniRouteResolved,
      _disableExternalOmniRoute,
    });
    return true;
  }
}

module.exports = ToolLoop;
