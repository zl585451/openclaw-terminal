'use strict';

/**
 * oct-gateway/agents/agent_runner.js
 *
 * Agent 执行引擎。
 *
 * 职责：
 *   1. 接收 BaseAgent 实例 + 任务对象，构建独立会话 messages
 *   2. 用工具白名单过滤 tool_loader.getDefinitions()
 *   3. 以非流式（stream: false）方式循环调用 OpenAI 兼容 API，支持工具调用
 *   4. 通过 onAgentEvent(event) 向外推送状态事件
 *   5. 返回 { result, turnsUsed, tokensUsed }
 *
 * 设计原则：
 *   - Agent 每次执行是独立会话，不共享主 session messages
 *   - 工具循环结束条件：finish_reason === 'stop' | 无 tool_calls | 超过 maxTurns
 *   - 超时由 AbortController 控制，整体计时（含所有工具轮次）
 */

const config = require('../config');
const toolLoader = require('../tool_loader');
const { createLogger } = require('../logger');

const log = createLogger('agent_runner');

function isStructuredToolResult(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shouldPauseForUserReply(result) {
  return isStructuredToolResult(result) && result.status === 'waiting_user_reply';
}

// ─────────────────────────────────────────────────────────────────
// 内部工具：解析 provider 配置
// ─────────────────────────────────────────────────────────────────

/**
 * 根据 modelId 解析 { baseUrl, apiKey, model }。
 * 优先调用 config.getProviderConfig()，若不可用则降级到直接读取字段。
 *
 * @param {string|null} modelId
 * @param {string[]} [allowedTools]
 * @returns {{ baseUrl: string, apiKey: string, model: string }}
 */
function resolveProviderConfig(modelId, allowedTools = []) {
  if (Array.isArray(allowedTools) && allowedTools.length > 0) {
    try {
      const omniRoute = require('../runtime/omniRoute');
      const resolved = omniRoute.resolveCapability('default', {
        originalResolve: () => {
          const pc = config.getProviderConfig();
          const baseUrl = pc.baseUrl || config.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
          const apiKey = pc.apiKey || config.DASHSCOPE_API_KEY || '';
          const model = modelId || config.DASHSCOPE_MODEL || config.OCT_MODEL || 'qwen-plus';
          return { id: pc.id, providerId: pc.id, baseUrl, apiKey, model };
        }
      });
      if (resolved) {
        return { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, model: resolved.model };
      }
    } catch (err) {
      // ignore
    }
  }

  // 使用当前全局 provider 配置（支持运行时切换 provider）
  const pc = config.getProviderConfig();
  const baseUrl = pc.baseUrl || config.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
  const apiKey = pc.apiKey || config.DASHSCOPE_API_KEY || '';
  // modelId 优先由 Agent 指定；否则用全局当前模型
  const model = modelId || config.DASHSCOPE_MODEL || config.OCT_MODEL || 'qwen-plus';
  return { baseUrl, apiKey, model };
}

// ─────────────────────────────────────────────────────────────────
// 内部工具：过滤工具定义
// ─────────────────────────────────────────────────────────────────

/**
 * 从 tool_loader 取全量工具。
 * 历史上这里会按 Agent 白名单裁剪，但这会把 OCT 的基础宿主能力挡在外面。
 * 现在改为：已注册工具默认全部可见，由更底层的“已注册工具校验 / 参数校验 / 工具自身执行逻辑”兜底。
 *
 * @param {string[]} allowedTools - 兼容旧签名，当前不再用于裁剪
 * @returns {object[]} OpenAI function calling 格式的工具定义数组
 */
function buildToolDefinitions(allowedTools) {
  return toolLoader.getDefinitions();
}

// ─────────────────────────────────────────────────────────────────
// 内部工具：执行单次工具调用
// ─────────────────────────────────────────────────────────────────

/**
 * 执行一个 tool_call，返回结果字符串（出错时返回错误描述）。
 *
 * @param {object} toolCall - OpenAI tool_call 对象
 * @param {string} toolCall.id
 * @param {object} toolCall.function
 * @param {string} toolCall.function.name
 * @param {string} toolCall.function.arguments - JSON 字符串
 * @param {string[]} allowedTools - 兼容旧签名，当前不再用于二次拒绝
 * @param {Function} onEvent - 事件推送回调
 * @returns {Promise<{ content: string, pauseForUserReply: boolean }>} 工具返回内容（字符串化）与是否等待用户回复
 */
async function executeToolCall(toolCall, allowedTools, onEvent) {
  const toolName = toolCall.function?.name;
  const callId = toolCall.id || `tc_${Date.now()}`;

  let args = {};
  try {
    const toolAdapter = require('../runtime/toolAdapter');
    args = toolAdapter.cleanAndParseArguments(toolCall.function.arguments || '{}');
  } catch (err) {
    log.error(`工具参数解析失败: ${toolName}`, { callId, error: err.message });
    const errMsg = `ERROR: Failed to parse arguments for tool "${toolName}". Details: ${err.message}`;
    onEvent({ type: 'tool_result', tool: toolName, callId, state: 'error', resultPreview: errMsg });
    return { content: errMsg, pauseForUserReply: false };
  }

  onEvent({ type: 'tool_call', tool: toolName, args, callId, state: 'executing' });

  try {
    const rawResult = await toolLoader.executeTool(toolName, args, { onToolEvent: onEvent });
    // 统一序列化为字符串
    const resultStr = typeof rawResult === 'string'
      ? rawResult
      : JSON.stringify(rawResult, null, 2);

    const preview = resultStr.length > 200 ? resultStr.slice(0, 200) + '...' : resultStr;
    onEvent({ type: 'tool_result', tool: toolName, callId, state: 'done', resultPreview: preview });

    return {
      content: resultStr,
      pauseForUserReply: shouldPauseForUserReply(rawResult),
    };
  } catch (err) {
    const errMsg = err?.message || String(err);
    log.error(`工具执行失败: ${toolName}`, { callId, error: errMsg });
    onEvent({ type: 'tool_result', tool: toolName, callId, state: 'error', resultPreview: errMsg });
    return { content: `ERROR: ${errMsg}`, pauseForUserReply: false };
  }
}

// ─────────────────────────────────────────────────────────────────
// 内部工具：单次非流式 API 请求
// ─────────────────────────────────────────────────────────────────

/**
 * 向 OpenAI 兼容接口发起一次非流式请求。
 *
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {object[]} opts.messages
 * @param {object[]} opts.tools       - 工具定义（可空数组）
 * @param {AbortSignal} opts.signal   - AbortController signal
 * @returns {Promise<object>}         - OpenAI chat completion response 对象
 */
async function callApi({ baseUrl, apiKey, model, messages, tools, signal }) {
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model,
    messages,
    stream: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // Gemini OpenAI 兼容层使用 x-goog-api-key
  if (baseUrl.includes('generativelanguage.googleapis.com') ||
      baseUrl.includes('aiplatform.googleapis.com')) {
    headers['x-goog-api-key'] = apiKey;
    delete headers['Authorization'];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '(无响应体)');
    throw new Error(`API 请求失败 [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  return data;
}

// ─────────────────────────────────────────────────────────────────
// 主入口：runAgent
// ─────────────────────────────────────────────────────────────────

/**
 * 运行一个 Agent，执行完整的工具循环并返回最终结果。
 *
 * @param {object} opts
 * @param {import('./base_agent')} opts.agent         - BaseAgent 子类实例
 * @param {object} opts.task                          - 任务对象
 * @param {string} [opts.task.taskId]                 - 任务 ID（用于事件标识）
 * @param {string} [opts.task.instruction]            - 主要指令
 * @param {string} [opts.task.userContext]            - 用户上下文
 * @param {string} [opts.task.sessionKey]             - 来源 session key
 * @param {string[]} [opts.task.allowedTools]         - 可在调用时追加/覆盖工具白名单
 * @param {Function} [opts.onAgentEvent]              - 事件回调 (event) => void
 * @returns {Promise<{ result: string, turnsUsed: number, tokensUsed: number }>}
 */
async function runAgent({ agent, task, onAgentEvent }) {
  const taskId = task.taskId || `agent_${Date.now()}`;
  const agentName = agent.name || 'UnnamedAgent';

  // 空操作兜底，避免调用方未传 onAgentEvent 时崩溃
  const onEvent = typeof onAgentEvent === 'function' ? onAgentEvent : () => {};

  onEvent({ type: 'agent_status', agent: agentName, status: 'running', taskId });

  // ── 1. 构建工具白名单（task 级可追加） ───────────────────────────
  const mergedAllowedTools = Array.from(new Set([
    ...(agent.allowedTools || []),
    ...(task.allowedTools || []),
  ]));
  const toolDefs = buildToolDefinitions(mergedAllowedTools);

  // ── 2. 解析 provider 配置 ────────────────────────────────────────
  const { baseUrl, apiKey, model } = resolveProviderConfig(agent.model, mergedAllowedTools);
  log.info(`[${agentName}] 启动`, { taskId, model, baseUrl: baseUrl.slice(0, 40) + '...' });

  // ── 3. 构建 system prompt（含额外上下文） ────────────────────────
  let systemContent = agent.systemPrompt || '';
  try {
    const extra = await agent.buildExtraContext(task);
    if (extra && extra.trim()) {
      systemContent = systemContent
        ? `${systemContent}\n\n${extra.trim()}`
        : extra.trim();
    }
  } catch (err) {
    log.warn(`[${agentName}] buildExtraContext 异常，已忽略`, { error: err?.message });
  }

  // ── 4. 初始化独立 messages 列表 ──────────────────────────────────
  const messages = [];
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }

  const userContent = agent.formatUserMessage(task);
  if (!userContent) {
    const errMsg = 'formatUserMessage 返回空内容，无法执行任务';
    log.error(`[${agentName}] ${errMsg}`, { taskId });
    onEvent({ type: 'agent_status', agent: agentName, status: 'error', taskId, message: errMsg });
    throw new Error(errMsg);
  }
  messages.push({ role: 'user', content: userContent });

  // ── 5. AbortController（整体超时） ──────────────────────────────
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Agent "${agentName}" 超时（${agent.timeoutMs}ms）`));
  }, agent.timeoutMs);

  let turnsUsed = 0;
  let tokensUsed = 0;
  let finalResult = '';

  try {
    // ── 6. 工具循环 ───────────────────────────────────────────────
    for (let turn = 0; turn < agent.maxTurns; turn++) {
      turnsUsed = turn + 1;
      log.debug(`[${agentName}] 第 ${turnsUsed} 轮请求`, { taskId, messages: messages.length });

      let response;
      try {
        response = await callApi({
          baseUrl,
          apiKey,
          model,
          messages,
          tools: toolDefs,
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          throw new Error(`Agent "${agentName}" 请求超时或被中止`);
        }
        throw err;
      }

      // 累计 token 用量
      if (response.usage) {
        tokensUsed += response.usage.total_tokens || 0;
      }

      const choice = response.choices?.[0];
      if (!choice) {
        throw new Error(`API 返回无 choices，响应：${JSON.stringify(response).slice(0, 300)}`);
      }

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      const finishReason = choice.finish_reason;
      const toolCalls = assistantMsg.tool_calls;

      // ── 6a. 无工具调用 / stop → 结束循环 ─────────────────────
      if (finishReason === 'stop' || !toolCalls || toolCalls.length === 0) {
        finalResult = typeof assistantMsg.content === 'string'
          ? assistantMsg.content
          : JSON.stringify(assistantMsg.content);
        log.info(`[${agentName}] 完成`, { taskId, turnsUsed, tokensUsed, finishReason });
        break;
      }

      // ── 6b. 有工具调用 → 逐一执行并追加 tool messages ────────
      log.debug(`[${agentName}] 执行 ${toolCalls.length} 个工具`, {
        taskId,
        tools: toolCalls.map((tc) => tc.function?.name),
      });

      let shouldStopForUserReply = false;
      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(toolCall, mergedAllowedTools, onEvent);
        if (toolResult.pauseForUserReply) {
          finalResult = '';
          log.info(`[${agentName}] request_clarify 等待用户回复，停止续轮`, { taskId, callId: toolCall.id });
          shouldStopForUserReply = true;
          break;
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult.content,
        });
      }

      if (shouldStopForUserReply) {
        break;
      }

      // ── 6c. 超过最大轮次 → 强制结束 ──────────────────────────
      if (turn + 1 >= agent.maxTurns) {
        log.warn(`[${agentName}] 达到 maxTurns(${agent.maxTurns})，强制结束`, { taskId });
        // 取最后一条 assistant 文本作为结果（可能为空）
        finalResult = typeof assistantMsg.content === 'string'
          ? assistantMsg.content
          : `[已达最大工具循环轮次 ${agent.maxTurns}，任务可能未完整完成]`;
        break;
      }
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    const errMsg = err?.message || String(err);
    log.error(`[${agentName}] 执行异常`, { taskId, error: errMsg });
    onEvent({ type: 'agent_status', agent: agentName, status: 'error', taskId, message: errMsg });
    throw err;
  }

  clearTimeout(timeoutHandle);

  onEvent({ type: 'agent_status', agent: agentName, status: 'done', taskId });

  return {
    result: finalResult,
    turnsUsed,
    tokensUsed,
  };
}

module.exports = { runAgent };
