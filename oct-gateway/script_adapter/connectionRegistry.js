'use strict';

/**
 * 管理批次事件的 WebSocket 订阅关系。
 * batchId -> Set<connection>
 */

/** @type {Map<string, Set<object>>} */
const batchSubscribers = new Map();

function subscribe(batchId, connection) {
  const normalizedBatchId = String(batchId || '').trim();
  if (!normalizedBatchId || !connection) return;
  if (!batchSubscribers.has(normalizedBatchId)) {
    batchSubscribers.set(normalizedBatchId, new Set());
  }
  batchSubscribers.get(normalizedBatchId).add(connection);
}

function unsubscribe(batchId, connection) {
  const normalizedBatchId = String(batchId || '').trim();
  if (!normalizedBatchId || !connection) return;
  const subs = batchSubscribers.get(normalizedBatchId);
  if (!subs) return;
  subs.delete(connection);
  if (subs.size === 0) {
    batchSubscribers.delete(normalizedBatchId);
  }
}

function broadcast(batchId, eventPayload) {
  const normalizedBatchId = String(batchId || '').trim();
  if (!normalizedBatchId) return;
  const subs = batchSubscribers.get(normalizedBatchId);
  if (!subs || subs.size === 0) return;

  for (const conn of [...subs]) {
    try {
      if (!conn?.isOpen?.()) {
        subs.delete(conn);
        continue;
      }
      conn.send(eventPayload);
    } catch {
      subs.delete(conn);
    }
  }

  if (subs.size === 0) {
    batchSubscribers.delete(normalizedBatchId);
  }
}

function onConnectionClose(connection) {
  if (!connection) return;
  for (const [batchId, subs] of batchSubscribers.entries()) {
    subs.delete(connection);
    if (subs.size === 0) {
      batchSubscribers.delete(batchId);
    }
  }
}

function activeSubscriptions() {
  return [...batchSubscribers.entries()]
    .filter(([, subs]) => subs.size > 0)
    .map(([batchId]) => batchId);
}

module.exports = {
  subscribe,
  unsubscribe,
  broadcast,
  onConnectionClose,
  activeSubscriptions,
};
