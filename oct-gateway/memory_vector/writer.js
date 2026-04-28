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

function buildEmbeddingText({ userText, assistantText }) {
  const user = String(userText || '').trim();
  const assistant = String(assistantText || '').trim().slice(0, 800);
  if (!user && !assistant) return '';
  return `[用户] ${user}\n[AMY] ${assistant}`;
}

function enqueueForEmbedding(rawTurn) {
  if (!config.memory.vectorRecall.enabled) return;
  queue.push(rawTurn);
  if (!processing) {
    processing = true;
    setImmediate(() => processQueue().finally(() => { processing = false; }));
  }
}

async function embedAndStore({ uri, date, session, userText, assistantText, sourceTs }) {
  if (!uri) return;
  if (db.hasVector(uri)) return;

  const text = buildEmbeddingText({ userText, assistantText });
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
};
