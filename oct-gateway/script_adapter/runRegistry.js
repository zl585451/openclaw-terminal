const runs = new Map();

function registerRun(record) {
  const now = new Date().toISOString();
  const normalized = {
    ...record,
    status: record.status || 'running',
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now,
  };
  runs.set(normalized.taskId, normalized);
  return normalizeRecord(normalized);
}

function getRun(taskId) {
  const record = runs.get(String(taskId || ''));
  return record || null;
}

function updateRun(taskId, patch) {
  const record = getRun(taskId);
  if (!record) return null;
  const updated = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  runs.set(record.taskId, updated);
  return normalizeRecord(updated);
}

function cancelRun(taskId, reason = 'cancelled_by_user') {
  const record = getRun(taskId);
  if (!record) {
    return { success: false, error: 'run_not_found', taskId: String(taskId || '') };
  }

  if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
    return {
      success: false,
      error: `run_already_${record.status}`,
      taskId: record.taskId,
      status: record.status,
    };
  }

  try {
    record.abortController?.abort?.(reason);
  } catch {}

  const snapshot = updateRun(record.taskId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
    error: reason,
  });
  return { success: true, taskId: record.taskId, status: 'cancelled', run: snapshot };
}

function listRuns() {
  return Array.from(runs.values())
    .map(normalizeRecord)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
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
