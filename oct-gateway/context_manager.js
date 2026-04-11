/**
 * context_manager.js — 智能上下文窗口管理
 *
 * 目标：在有限的 token 预算内最大化保留对 AI 有用的信息。
 *
 * 策略（按轮次 pair = user + assistant）：
 *   ① 前 KEEP_FIRST_PAIRS 轮：完整保留（建立用户偏好/会话背景）
 *   ② 中间段：assistant 回复截断到 COMPRESS_ASSISTANT_MAX 字符（保留语义，砍冗余）
 *   ③ 后 KEEP_LAST_PAIRS 轮：完整保留（当前任务的直接上下文）
 *
 * 优点（对比原来的盲目滑窗）：
 *   - 不会把「你好，我是 Amy」这类建立 context 的早期消息丢掉
 *   - 中间段 AI 的长篇解释不占用大量 token
 *   - 最近几轮保持完整，AI 可以跟上当前话题
 */

const KEEP_FIRST_PAIRS   = 3;    // 保留最早 N 轮完整（建立会话背景）
const KEEP_LAST_PAIRS    = 6;    // 保留最近 N 轮完整（当前任务上下文）
const COMPRESS_ASSISTANT_MAX = 400; // 中间段 assistant 回复截断到此长度
const HARD_CHAR_LIMIT    = 55000;   // 总字符硬上限（约 1.4万 token，留 system prompt 余量）

/**
 * 把历史消息按 user/assistant 配对成轮次
 * 不完整的尾部（孤立 user 消息）保持原样
 */
function toPairs(chatMessages) {
  const pairs = [];
  let i = 0;
  while (i < chatMessages.length) {
    const msg = chatMessages[i];
    if (msg.role === 'user') {
      if (i + 1 < chatMessages.length && chatMessages[i + 1].role === 'assistant') {
        pairs.push([msg, chatMessages[i + 1]]);
        i += 2;
      } else {
        // 孤立 user（最后一条还没收到回复），wrap as single
        pairs.push([msg]);
        i++;
      }
    } else {
      // 孤立 assistant（不常见）
      pairs.push([msg]);
      i++;
    }
  }
  return pairs;
}

/**
 * 压缩一条 assistant 消息：超出阈值时截断并附注原始长度
 */
function compressAssistant(msg, maxLen) {
  if (msg.role !== 'assistant') return msg;
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (content.length <= maxLen) return msg;
  return {
    ...msg,
    content: content.slice(0, maxLen) + `\n[…已省略 ${content.length - maxLen} 字符]`,
  };
}

/**
 * 核心函数：把原始 session history 转换成发给 API 的 messages 数组
 *
 * @param {Array}  rawHistory    session.getHistory() 返回的消息数组（含 timestamp）
 * @param {string} systemPrompt  本轮构建好的 system prompt（含时间/模型/记忆）
 * @param {string|Array} lastUserMsg  本轮用户消息（已注入 canvas context 等附加信息）
 * @returns {Array}  [{role, content}, ...]，第一条必为 system
 */
function buildApiMessages(rawHistory, systemPrompt, lastUserMsg) {
  // session.addMessage 在本轮用户发言时已经把 userMessage（裸文）加入 history，
  // index.js 里是 history.slice(0, -1) 拿历史、然后单独加 lastUserMsg（含附加 context）。
  // 我们遵循相同约定：rawHistory 最后一条是当前轮 user，我们不用它，用 lastUserMsg 替代。
  const historyWithoutCurrent = rawHistory.slice(0, -1);

  // 只处理 user/assistant；system 消息（如果有）直接过滤掉（会在前面重新注入）
  const chatMsgs = historyWithoutCurrent.filter(m => m.role === 'user' || m.role === 'assistant');

  const pairs = toPairs(chatMsgs);

  let selectedMsgs;

  if (pairs.length <= KEEP_FIRST_PAIRS + KEEP_LAST_PAIRS) {
    // 轮次较少，全部保留，不压缩
    selectedMsgs = chatMsgs;
  } else {
    const firstPairs  = pairs.slice(0, KEEP_FIRST_PAIRS);
    const lastPairs   = pairs.slice(-KEEP_LAST_PAIRS);
    const middlePairs = pairs.slice(KEEP_FIRST_PAIRS, pairs.length - KEEP_LAST_PAIRS);

    // 中间段：压缩 assistant 回复
    const compressedMiddle = middlePairs.map(pair =>
      pair.map(m => compressAssistant(m, COMPRESS_ASSISTANT_MAX))
    );

    selectedMsgs = [
      ...firstPairs.flat(),
      ...compressedMiddle.flat(),
      ...lastPairs.flat(),
    ];
  }

  // 硬上限兜底：若总字符仍超限，从最早的中间段开始丢弃
  // （front 和 tail 已经比较精简，优先保护它们）
  let totalChars = (systemPrompt?.length || 0)
    + selectedMsgs.reduce((s, m) => s + (m.content?.length || 0), 0)
    + (typeof lastUserMsg === 'string' ? lastUserMsg.length : 2000);

  if (totalChars > HARD_CHAR_LIMIT) {
    // 丢弃 first 之后、last 之前的消息（已压缩的中间段），从最旧的开始
    const keepN = KEEP_FIRST_PAIRS * 2 + KEEP_LAST_PAIRS * 2; // rough msg count
    if (selectedMsgs.length > keepN) {
      const front = selectedMsgs.slice(0, KEEP_FIRST_PAIRS * 2);
      const tail  = selectedMsgs.slice(-(KEEP_LAST_PAIRS * 2));
      selectedMsgs = [...front, ...tail];
    }
  }

  // 组装最终 messages
  const apiMessages = [
    { role: 'system', content: systemPrompt || '' },
    ...selectedMsgs.map(m => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: typeof lastUserMsg === 'string' ? lastUserMsg
              : Array.isArray(lastUserMsg) ? lastUserMsg
              : String(lastUserMsg),
    },
  ];

  return apiMessages;
}

/**
 * 估算 token 用量（中文偏保守：字符数 / 1.8）
 */
function estimateTokens(messages) {
  const chars = messages.reduce((s, m) => {
    if (typeof m.content === 'string') return s + m.content.length;
    if (Array.isArray(m.content)) {
      return s + m.content.reduce((ss, c) => ss + (c.text?.length || 0), 0);
    }
    return s;
  }, 0);
  return Math.ceil(chars / 1.8);
}

/**
 * 日志友好的上下文摘要
 */
function summarize(messages) {
  const sys  = messages.filter(m => m.role === 'system').length;
  const user = messages.filter(m => m.role === 'user').length;
  const asst = messages.filter(m => m.role === 'assistant').length;
  const tokens = estimateTokens(messages);
  return { sys, user, asst, total: messages.length, estimatedTokens: tokens };
}

module.exports = { buildApiMessages, estimateTokens, summarize };
