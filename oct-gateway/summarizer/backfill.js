/**
 * Backfill vector embeddings from L3 raw logs in Nocturne.
 */
const memory = require('../memory');
const config = require('../config');
const { createLogger } = require('../logger');
const db = require('../memory_vector/db');
const { embedAndStore } = require('../memory_vector/writer');

const logger = createLogger('vector_backfill');

function nodeContent(result) {
  return result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
}

function nodeChildren(result) {
  return result?.data?.node?.children || result?.data?.children || result?.node?.children || result?.children || [];
}

function uriFromChild(child) {
  if (child?.uri) return child.uri;
  if (child?.path) return `core://${child.path}`;
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listRawDates() {
  const result = await memory.readMemory('core://logs/raw', { treat404AsDebug: true });
  if (!result.ok) return [];
  return nodeChildren(result)
    .map((child) => child.name || child.path?.split('/').pop() || child.uri?.split('/').pop() || '')
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
}

async function listDayTurns(dateStr) {
  const result = await memory.readMemory(`core://logs/raw/${dateStr}`, { treat404AsDebug: true });
  if (!result.ok) return [];
  return nodeChildren(result).map(uriFromChild).filter(Boolean);
}

async function parseRawTurn(uri) {
  const result = await memory.readMemory(uri, { treat404AsDebug: true });
  if (!result.ok) return null;
  const content = nodeContent(result);
  try {
    return JSON.parse(content || '{}');
  } catch (error) {
    logger.warn('[Backfill] 原始日志 JSON 解析失败', { uri, error: error?.message || String(error) });
    return null;
  }
}

async function backfillDay(dateStr, onProgress) {
  const uris = await listDayTurns(dateStr);
  const intervalMs = config.memory.vectorRecall.backfill.intervalMs || 200;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const uri of uris) {
    if (db.hasVector(uri)) {
      skipped += 1;
      continue;
    }

    const raw = await parseRawTurn(uri);
    if (!raw || (!raw.user && !raw.assistant)) {
      skipped += 1;
      continue;
    }

    try {
      await embedAndStore({
        uri,
        date: dateStr,
        session: raw.session || 'default',
        userText: raw.user || '',
        assistantText: raw.assistant || '',
        sourceTs: raw.ts || '',
      });
      processed += 1;
      if (onProgress) onProgress({ dateStr, uri, processed, skipped, failed });
      await sleep(intervalMs);
    } catch (error) {
      failed += 1;
      db.recordFailure(uri, error?.message || String(error));
      logger.error('[Backfill] 单条失败', { uri, error: error?.message || String(error) });
    }
  }

  return { dateStr, total: uris.length, processed, skipped, failed };
}

async function backfillAll(onProgress) {
  const dates = await listRawDates();
  const results = [];
  logger.info('[Backfill] 开始回填', { dateCount: dates.length });

  for (const dateStr of dates) {
    const result = await backfillDay(dateStr, onProgress);
    results.push(result);
    logger.info('[Backfill] 完成一天', result);
  }

  return results.reduce((acc, item) => ({
    dates: acc.dates + 1,
    total: acc.total + item.total,
    processed: acc.processed + item.processed,
    skipped: acc.skipped + item.skipped,
    failed: acc.failed + item.failed,
  }), { dates: 0, total: 0, processed: 0, skipped: 0, failed: 0 });
}

async function retryFailed() {
  const rows = db.listFailures(100);
  let success = 0;
  let stillFailed = 0;
  const intervalMs = config.memory.vectorRecall.backfill.intervalMs || 200;

  for (const row of rows) {
    try {
      const raw = await parseRawTurn(row.uri);
      const date = String(row.uri || '').match(/\/logs\/raw\/(\d{4}-\d{2}-\d{2})\//)?.[1];
      if (!raw || !date) {
        stillFailed += 1;
        continue;
      }
      await embedAndStore({
        uri: row.uri,
        date,
        session: raw.session || 'default',
        userText: raw.user || '',
        assistantText: raw.assistant || '',
        sourceTs: raw.ts || '',
      });
      success += 1;
      await sleep(intervalMs);
    } catch (error) {
      stillFailed += 1;
      db.recordFailure(row.uri, error?.message || String(error));
    }
  }

  return { total: rows.length, success, stillFailed };
}

module.exports = {
  listRawDates,
  listDayTurns,
  backfillDay,
  backfillAll,
  retryFailed,
};
