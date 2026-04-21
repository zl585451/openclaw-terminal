/**
 * L3 原始对话日志
 * 每轮对话结束后无条件写入完整原文
 * URI 结构：core://logs/raw/YYYY-MM-DD/<timestamp>-<seq>
 */
const memory = require('./memory');
const config = require('./config');
const { createLogger } = require('./logger');
const crypto = require('crypto');

const logger = createLogger('raw_log');

let dailySeqCounter = {
  date: '',
  seq: 0,
};
const savedDedupeKeys = new Set();

function makeRawTurnDedupeKey({ userMessage, assistantReply, sessionKey }) {
  const hash = crypto
    .createHash('sha256')
    .update(String(sessionKey || 'default'))
    .update('\n---user---\n')
    .update(String(userMessage || '').trim())
    .update('\n---assistant---\n')
    .update(String(assistantReply || '').trim())
    .digest('hex');
  return `raw-turn:${hash}`;
}

function nextSeq() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailySeqCounter.date !== today) {
    dailySeqCounter = { date: today, seq: 0 };
  }
  dailySeqCounter.seq += 1;
  return String(dailySeqCounter.seq).padStart(4, '0');
}

/**
 * 写入一轮原始对话
 * @param {Object} params
 * @param {string} params.userMessage - 用户消息原文
 * @param {string} params.assistantReply - AMY 回复原文
 * @param {string} params.sessionKey - 会话标识
 * @param {Array<string>} params.toolsUsed - 本轮调用的工具名列表
 * @param {Array<string>} params.attachments - 附件引用
 */
async function saveRawTurn({
  userMessage,
  assistantReply,
  sessionKey,
  toolsUsed = [],
  attachments = [],
  dedupeKey = '',
}) {
  if (!userMessage && !assistantReply) return;
  const normalizedDedupeKey = String(dedupeKey || '').trim();
  if (normalizedDedupeKey && savedDedupeKeys.has(normalizedDedupeKey)) {
    logger.debug('[RawLog] 跳过重复原始日志写入', { dedupeKey: normalizedDedupeKey });
    return { skipped: true, reason: 'memory_dedupe', dedupeKey: normalizedDedupeKey };
  }

  const alive = await memory.isAlive();
  if (!alive) {
    logger.warn('[RawLog] Nocturne 不在线，跳过原始日志写入');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const seq = nextSeq();
  const uri = `core://logs/raw/${dateStr}/T${timeStr}-${seq}`;

  const payload = {
    ts: now.toISOString(),
    session: sessionKey || 'default',
    user: userMessage || '',
    assistant: assistantReply || '',
    tools: toolsUsed,
    attachments,
    meta: {
      userLen: (userMessage || '').length,
      assistantLen: (assistantReply || '').length,
      dedupeKey: normalizedDedupeKey,
    },
  };

  try {
    if (normalizedDedupeKey) {
      const dedupeUri = `core://logs/raw_dedupe/${normalizedDedupeKey}`;
      const exists = await memory.readMemory(dedupeUri, { treat404AsDebug: true });
      if (exists.ok) {
        savedDedupeKeys.add(normalizedDedupeKey);
        logger.debug('[RawLog] 跳过重复原始日志写入（持久去重命中）', { dedupeKey: normalizedDedupeKey });
        return { skipped: true, reason: 'persistent_dedupe', dedupeKey: normalizedDedupeKey };
      }
    }

    await memory.writeMemory(
      uri,
      JSON.stringify(payload),
      2,
      '原始对话日志'
    );
    logger.info('[RawLog] 原始对话已写入', {
      uri,
      userLen: payload.meta.userLen,
      assistantLen: payload.meta.assistantLen,
    });
    if (normalizedDedupeKey) {
      savedDedupeKeys.add(normalizedDedupeKey);
      try {
        await memory.writeMemory(
          `core://logs/raw_dedupe/${normalizedDedupeKey}`,
          JSON.stringify({ uri, ts: payload.ts, session: payload.session }),
          3,
          '原始对话去重索引'
        );
      } catch (err) {
        logger.debug('[RawLog] 去重索引写入失败（不阻塞）', { error: err?.message || String(err) });
      }
    }
    if (config.memory.vectorRecall.enabled) {
      try {
        const { enqueueForEmbedding } = require('./memory_vector/writer');
        enqueueForEmbedding({
          uri,
          date: dateStr,
          session: sessionKey || 'default',
          userText: userMessage || '',
          assistantText: assistantReply || '',
          sourceTs: payload.ts,
        });
      } catch (err) {
        logger.warn('[RawLog] 入队 embedding 失败（不阻塞主流程）', { error: err?.message || String(err) });
      }
    }
    return { skipped: false, uri, dedupeKey: normalizedDedupeKey };
  } catch (err) {
    logger.error('[RawLog] 写入失败', { uri, error: err.message });
    return { skipped: false, error: err.message, uri, dedupeKey: normalizedDedupeKey };
  }
}

module.exports = { saveRawTurn, makeRawTurnDedupeKey };
