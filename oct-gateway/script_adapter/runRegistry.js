'use strict';

/**
 * runRegistry.js
 *
 * 单次执行运行注册表。
 * 使用内存热缓存 + SQLite 持久化双写，支持 Gateway 重启后的历史恢复。
 */

const persistence = require('./persistence');

/** @type {Map<string, object>} */
const cache = new Map();

function registerRun(record) {
  const now = new Date().toISOString();
  const normalized = {
    taskId: record.taskId,
    planId: record.planId || null,
    taskTitle: record.taskTitle || '',
    status: record.status || 'running',
    sheet: record.sheet || null,
    abortController: record.abortController || null,
    createdAt: record.createdAt || now,
    updatedAt: now,
    completedAt: null,
    error: null,
  };
  cache.set(normalized.taskId, normalized);
  persistence.createSingleRun({
    taskId: normalized.taskId,
    planId: normalized.planId,
    taskTitle: normalized.taskTitle,
  });
  return normalizeRecord(normalized);
}

function getRun(taskId) {
  const normalizedTaskId = String(taskId || '');
  const cached = cache.get(normalizedTaskId);
  if (cached) return normalizeRecord(cached);
  return persistence.getSingleRun(normalizedTaskId);
}

function updateRun(taskId, patch) {
  const normalizedTaskId = String(taskId || '');
  const record = cache.get(normalizedTaskId);
  if (record) {
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    cache.set(record.taskId, record);
  }
  persistence.updateSingleRun(normalizedTaskId, patch);
  return getRun(normalizedTaskId);
}

function cancelRun(taskId, reason = 'cancelled_by_user') {
  const normalizedTaskId = String(taskId || '');
  const record = cache.get(normalizedTaskId);
  if (!record) {
    const persisted = persistence.getSingleRun(normalizedTaskId);
    if (!persisted) {
      return { success: false, error: 'run_not_found', taskId: normalizedTaskId };
    }
    return { success: false, error: `run_already_${persisted.status}`, taskId: persisted.taskId };
  }

  if (['completed', 'failed', 'cancelled', 'interrupted'].includes(record.status)) {
    return { success: false, error: `run_already_${record.status}`, taskId: record.taskId };
  }

  try {
    record.abortController?.abort?.(reason);
  } catch {}

  const now = new Date().toISOString();
  Object.assign(record, {
    status: 'cancelled',
    completedAt: now,
    error: reason,
    updatedAt: now,
  });
  cache.set(record.taskId, record);
  persistence.updateSingleRun(record.taskId, {
    status: 'cancelled',
    completedAt: now,
    error: reason,
  });

  return { success: true, taskId: record.taskId, status: 'cancelled', run: normalizeRecord(record) };
}

function listRuns(limit = 20) {
  const inMemory = [...cache.values()].filter((record) => record.status === 'running' || record.status === 'pending');
  const historical = persistence.listSingleRuns(limit);
  const inMemoryIds = new Set(inMemory.map((record) => record.taskId));
  const merged = [
    ...inMemory.map(normalizeRecord),
    ...historical.filter((record) => !inMemoryIds.has(record.taskId)),
  ];
  merged.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  return merged.slice(0, limit);
}

function normalizeRecord(record) {
  return {
    taskId: record.taskId,
    planId: record.planId,
    taskTitle: record.taskTitle,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    error: record.error,
  };
}

module.exports = {
  registerRun,
  getRun,
  updateRun,
  cancelRun,
  listRuns,
};
