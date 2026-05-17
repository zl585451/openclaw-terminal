/**
 * Async vector writer for raw turns.
 */
const config = require('../config');
const { createLogger } = require('../logger');
const db = require('./db');
const { embedOne } = require('../summarizer/embedding_client');

const logger = createLogger('vector_writer');

const queue = [];
let processing = false;

const VECTOR_WRITE_SIGNALS = [
  '记住', '记下来', '以后', '偏好', '决定', '结论', '方案', '架构', '重构',
  '项目', 'OCT', 'OpenClaw', 'AMY', 'Hermes', '记忆', '总结',
  '调研', '对比', '规则', '配置', 'bug', '修复', '实现', '文档',
];

function shouldIndexTurn({ userText, assistantText, tools = [], attachments = [] }) {
  const writeConfig = config.memory?.vectorRecall?.write || {};
  if (writeConfig.mode === 'all') return true;
  if (writeConfig.mode === 'off') return false;

  const user = String(userText || '').trim();
  const assistant = String(assistantText || '').trim();
  const minUserChars = Number(writeConfig.minUserChars || 12);
  if (user.length < minUserChars && assistant.length < 80) return false;
  if (Array.isArray(tools) && tools.length > 0) return true;
  if (Array.isArray(attachments) && attachments.length > 0) return true;
  if (/[?？]$/.test(user) && user.length < 24 && assistant.length < 160) return false;

  const haystack = `${user}\n${assistant}`.toLowerCase();
  if (VECTOR_WRITE_SIGNALS.some((term) => haystack.includes(String(term).toLowerCase()))) return true;
  if (user.length >= 80 || assistant.length >= 500) return true;
  return false;
}

function buildEmbeddingText({ userText, assistantText, tools = [] }) {
  const user = String(userText || '').trim();
  const assistantLimit = Number(config.memory?.vectorRecall?.write?.assistantPreviewChars || 360);
  const assistant = String(assistantText || '').trim().slice(0, assistantLimit);
  if (!user && !assistant) return '';
  const toolLine = Array.isArray(tools) && tools.length ? `\n[工具] ${tools.join(', ')}` : '';
  return `[用户] ${user}\n[AMY摘要] ${assistant}${toolLine}`;
}

function enqueueForEmbedding(rawTurn) {
  if (!config.memory.vectorRecall.enabled) return;
  queue.push(rawTurn);
  if (!processing) {
    processing = true;
    setImmediate(() => processQueue().finally(() => { processing = false; }));
  }
}

async function embedAndStore({ uri, date, session, userText, assistantText, tools = [], sourceTs }) {
  if (!uri) return;
  if (db.hasVector(uri)) return;

  const text = buildEmbeddingText({ userText, assistantText, tools });
  if (text.length < 5) return;

  const vector = await embedOne(text);
  const embedding = config.memory.vectorRecall.embedding;
  db.insertVector({
    uri,
    date,
    session,
    userText,
    assistantText,
    sourceTs,
    textPreview: text.slice(0, 500),
    vector,
    model: embedding.model,
    version: embedding.version,
  });
  db.clearFailure(uri);
  logger.info('[VectorWriter] 已写入', { uri });
}

async function processQueue() {
  while (queue.length > 0) {
    const turn = queue.shift();
    try {
      await embedAndStore(turn);
    } catch (error) {
      logger.error('[VectorWriter] 处理失败', { uri: turn?.uri, error: error?.message || String(error) });
      try { db.recordFailure(turn?.uri, error?.message || String(error)); } catch {}
    }
  }
}

module.exports = {
  enqueueForEmbedding,
  processQueue,
  embedAndStore,
  buildEmbeddingText,
  shouldIndexTurn,
};
