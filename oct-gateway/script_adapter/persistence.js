'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function ensureSchema() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      book_title TEXT NOT NULL,
      selected_chapter_indices TEXT NOT NULL,
      status TEXT NOT NULL,
      total_chapters INTEGER NOT NULL,
      completed_chapters INTEGER DEFAULT 0,
      failed_chapters INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      estimated_cost REAL,
      actual_cost REAL DEFAULT 0,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS chapter_runs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      chapter_title TEXT,
      source_chars INTEGER,
      status TEXT NOT NULL,
      sheet TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      cost REAL DEFAULT 0,
      attempt INTEGER DEFAULT 1,
      FOREIGN KEY (batch_id) REFERENCES batch_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS single_runs (
      task_id TEXT PRIMARY KEY,
      plan_id TEXT,
      task_title TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sheet TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gate_decisions (
      gate_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      chapter_run_id TEXT NOT NULL,
      gate_type TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_note TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      FOREIGN KEY (chapter_run_id) REFERENCES chapter_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_runs_batch ON chapter_runs(batch_id, chapter_index);
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_single_runs_status ON single_runs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gate_decisions_run ON gate_decisions(chapter_run_id, status);
  `);
  try {
    database.exec('ALTER TABLE chapter_runs ADD COLUMN pending_gate_id TEXT');
  } catch {}
  try {
    database.exec('ALTER TABLE chapter_runs ADD COLUMN pending_gate_type TEXT');
  } catch {}
}

function createBatch(batch) {
  const database = getDb();
  const insertBatch = database.prepare(`
    INSERT INTO batch_jobs (
      id, book_id, book_title, selected_chapter_indices, status, total_chapters,
      completed_chapters, failed_chapters, created_at, updated_at, started_at,
      completed_at, estimated_cost, actual_cost, config
    ) VALUES (
      @id, @book_id, @book_title, @selected_chapter_indices, @status, @total_chapters,
      @completed_chapters, @failed_chapters, @created_at, @updated_at, @started_at,
      @completed_at, @estimated_cost, @actual_cost, @config
    )
  `);
  const insertChapter = database.prepare(`
    INSERT INTO chapter_runs (
      id, batch_id, book_id, chapter_index, chapter_title, source_chars,
      status, sheet, error_message, started_at, completed_at, duration_ms, cost, attempt
    ) VALUES (
      @id, @batch_id, @book_id, @chapter_index, @chapter_title, @source_chars,
      @status, @sheet, @error_message, @started_at, @completed_at, @duration_ms, @cost, @attempt
    )
  `);

  const tx = database.transaction((payload) => {
    insertBatch.run({
      id: payload.id,
      book_id: payload.bookId,
      book_title: payload.bookTitle,
      selected_chapter_indices: JSON.stringify(payload.selectedChapterIndices || []),
      status: payload.status || 'pending',
      total_chapters: payload.totalChapters,
      completed_chapters: 0,
      failed_chapters: 0,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt,
      started_at: payload.startedAt || null,
      completed_at: payload.completedAt || null,
      estimated_cost: payload.estimatedCost ?? null,
      actual_cost: payload.actualCost ?? 0,
      config: JSON.stringify(payload.config || {}),
    });

    for (const chapterRun of payload.chapterRuns || []) {
      insertChapter.run({
        id: chapterRun.id,
        batch_id: payload.id,
        book_id: payload.bookId,
        chapter_index: chapterRun.chapterIndex,
        chapter_title: chapterRun.chapterTitle || null,
        source_chars: chapterRun.sourceChars ?? null,
        status: chapterRun.status || 'pending',
        sheet: chapterRun.sheet ? JSON.stringify(chapterRun.sheet) : null,
        error_message: chapterRun.errorMessage || null,
        started_at: chapterRun.startedAt || null,
        completed_at: chapterRun.completedAt || null,
        duration_ms: chapterRun.durationMs ?? null,
        cost: chapterRun.cost ?? 0,
        attempt: chapterRun.attempt ?? 1,
      });
    }
  });

  tx(batch);
  return getBatch(batch.id);
}

function getBatch(batchId) {
  const database = getDb();
  const batchRow = database.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(String(batchId || ''));
  if (!batchRow) return null;
  return {
    batch: normalizeBatchRow(batchRow),
    chapterRuns: listChapterRuns(batchId),
  };
}

function listBatches(limit = 20, offset = 0) {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM batch_jobs
    ORDER BY datetime(created_at) DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit) || 20, Number(offset) || 0);
  return rows.map(normalizeBatchRow);
}

function listChapterRuns(batchId) {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM chapter_runs
    WHERE batch_id = ?
    ORDER BY chapter_index ASC, attempt ASC
  `).all(String(batchId || ''));
  return rows.map(normalizeChapterRunRow);
}

function getChapterRun(batchId, chapterIndex) {
  const database = getDb();
  const row = database.prepare(`
    SELECT * FROM chapter_runs
    WHERE batch_id = ? AND chapter_index = ?
    ORDER BY attempt DESC
    LIMIT 1
  `).get(String(batchId || ''), Number(chapterIndex));
  return row ? normalizeChapterRunRow(row) : null;
}

function updateBatchStatus(batchId, status, patch = {}) {
  return updateBatch(batchId, { ...patch, status });
}

function updateBatch(batchId, patch = {}) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(String(batchId || ''));
  if (!existing) return null;
  const next = {
    ...normalizeBatchRow(existing),
    ...patch,
    id: existing.id,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };
  database.prepare(`
    UPDATE batch_jobs
    SET book_id = @book_id,
        book_title = @book_title,
        selected_chapter_indices = @selected_chapter_indices,
        status = @status,
        total_chapters = @total_chapters,
        completed_chapters = @completed_chapters,
        failed_chapters = @failed_chapters,
        created_at = @created_at,
        updated_at = @updated_at,
        started_at = @started_at,
        completed_at = @completed_at,
        estimated_cost = @estimated_cost,
        actual_cost = @actual_cost,
        config = @config
    WHERE id = @id
  `).run({
    id: existing.id,
    book_id: next.bookId,
    book_title: next.bookTitle,
    selected_chapter_indices: JSON.stringify(next.selectedChapterIndices || []),
    status: next.status,
    total_chapters: next.totalChapters,
    completed_chapters: next.completedChapters ?? 0,
    failed_chapters: next.failedChapters ?? 0,
    created_at: next.createdAt,
    updated_at: next.updatedAt,
    started_at: next.startedAt || null,
    completed_at: next.completedAt || null,
    estimated_cost: next.estimatedCost ?? null,
    actual_cost: next.actualCost ?? 0,
    config: JSON.stringify(next.config || {}),
  });
  return getBatch(batchId);
}

function updateChapterRun(runId, updates = {}) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM chapter_runs WHERE id = ?').get(String(runId || ''));
  if (!existing) return null;
  const next = {
    ...normalizeChapterRunRow(existing),
    ...updates,
    id: existing.id,
  };
  database.prepare(`
    UPDATE chapter_runs
    SET batch_id = @batch_id,
        book_id = @book_id,
        chapter_index = @chapter_index,
        chapter_title = @chapter_title,
        source_chars = @source_chars,
        status = @status,
        sheet = @sheet,
        error_message = @error_message,
        started_at = @started_at,
        completed_at = @completed_at,
        duration_ms = @duration_ms,
        cost = @cost,
        attempt = @attempt,
        pending_gate_id = @pending_gate_id,
        pending_gate_type = @pending_gate_type
    WHERE id = @id
  `).run({
    id: existing.id,
    batch_id: next.batchId,
    book_id: next.bookId,
    chapter_index: next.chapterIndex,
    chapter_title: next.chapterTitle || null,
    source_chars: next.sourceChars ?? null,
    status: next.status,
    sheet: next.sheet ? JSON.stringify(next.sheet) : null,
    error_message: next.errorMessage || null,
    started_at: next.startedAt || null,
    completed_at: next.completedAt || null,
    duration_ms: next.durationMs ?? null,
    cost: next.cost ?? 0,
    attempt: next.attempt ?? 1,
    pending_gate_id: next.pendingGateId || null,
    pending_gate_type: next.pendingGateType || null,
  });
  refreshBatchCounters(next.batchId);
  return getChapterRun(next.batchId, next.chapterIndex);
}

function rerunChapter(batchId, chapterIndex) {
  const database = getDb();
  const existing = database.prepare(`
    SELECT * FROM chapter_runs
    WHERE batch_id = ? AND chapter_index = ?
    ORDER BY attempt DESC
    LIMIT 1
  `).get(String(batchId || ''), Number(chapterIndex));
  if (!existing) return null;
  const nextAttempt = Number(existing.attempt || 1) + 1;
  const runId = `run-${String(batchId || '')}-${Number(chapterIndex)}-a${nextAttempt}`;
  database.prepare(`
    INSERT INTO chapter_runs (
      id, batch_id, book_id, chapter_index, chapter_title, source_chars,
      status, sheet, error_message, started_at, completed_at, duration_ms, cost, attempt
    ) VALUES (
      @id, @batch_id, @book_id, @chapter_index, @chapter_title, @source_chars,
      'pending', NULL, NULL, NULL, NULL, NULL, 0, @attempt
    )
  `).run({
    id: runId,
    batch_id: String(batchId || ''),
    book_id: existing.book_id,
    chapter_index: Number(chapterIndex),
    chapter_title: existing.chapter_title,
    source_chars: existing.source_chars,
    attempt: nextAttempt,
  });
  refreshBatchCounters(batchId);
  return getChapterRun(batchId, chapterIndex);
}

function deleteBatch(batchId) {
  const database = getDb();
  database.prepare('DELETE FROM batch_jobs WHERE id = ?').run(String(batchId || ''));
  return { success: true };
}

function findNextPendingChapter(batchId) {
  const database = getDb();
  const row = database.prepare(`
    SELECT chapter_index
    FROM chapter_runs
    WHERE batch_id = ? AND status = 'pending'
    ORDER BY chapter_index ASC, attempt DESC
    LIMIT 1
  `).get(String(batchId || ''));
  return row ? Number(row.chapter_index) : null;
}

function listRunningBatches() {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM batch_jobs
    WHERE status = 'running'
    ORDER BY datetime(updated_at) DESC
  `).all();
  return rows.map(normalizeBatchRow);
}

function refreshBatchCounters(batchId) {
  const database = getDb();
  const summary = database.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN status = 'completed' THEN cost ELSE 0 END) AS actual_cost
    FROM (
      SELECT chapter_index, status, cost
      FROM chapter_runs
      WHERE batch_id = ?
      GROUP BY chapter_index
      HAVING MAX(attempt)
    )
  `).get(String(batchId || ''));
  const batch = getBatch(batchId);
  if (!batch) return null;
  return updateBatch(batchId, {
    completedChapters: Number(summary?.completed_count || 0),
    failedChapters: Number(summary?.failed_count || 0),
    actualCost: Number(summary?.actual_cost || 0),
  });
}

function createSingleRun({ taskId, planId, taskTitle }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO single_runs
      (task_id, plan_id, task_title, status, created_at, updated_at)
    VALUES (@taskId, @planId, @taskTitle, 'running', @now, @now)
  `).run({
    taskId,
    planId: planId || null,
    taskTitle: taskTitle || '',
    now,
  });
  return getSingleRun(taskId);
}

function updateSingleRun(taskId, patch = {}) {
  const now = new Date().toISOString();
  const updates = [];
  const params = { taskId, now };

  if (patch.status !== undefined) {
    updates.push('status = @status');
    params.status = patch.status;
  }
  if (patch.sheet !== undefined) {
    updates.push('sheet = @sheet');
    params.sheet = typeof patch.sheet === 'string' ? patch.sheet : JSON.stringify(patch.sheet);
  }
  if (patch.error !== undefined) {
    updates.push('error = @error');
    params.error = patch.error;
  }
  if (patch.completedAt !== undefined) {
    updates.push('completed_at = @completedAt');
    params.completedAt = patch.completedAt;
  }
  if (patch.planId !== undefined) {
    updates.push('plan_id = @planId');
    params.planId = patch.planId;
  }

  if (updates.length === 0) return getSingleRun(taskId);
  updates.push('updated_at = @now');
  getDb().prepare(`UPDATE single_runs SET ${updates.join(', ')} WHERE task_id = @taskId`).run(params);
  return getSingleRun(taskId);
}

function getSingleRun(taskId) {
  const row = getDb().prepare('SELECT * FROM single_runs WHERE task_id = ?').get(String(taskId || ''));
  if (!row) return null;
  return {
    taskId: row.task_id,
    planId: row.plan_id,
    taskTitle: row.task_title,
    status: row.status,
    sheet: parseJson(row.sheet, null),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function listSingleRuns(limit = 20, offset = 0) {
  const rows = getDb().prepare(`
    SELECT * FROM single_runs ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?
  `).all(Number(limit) || 20, Number(offset) || 0);
  return rows.map((row) => getSingleRun(row.task_id)).filter(Boolean);
}

function recoverInterruptedRuns() {
  getDb().prepare(`
    UPDATE single_runs
    SET status = 'interrupted', updated_at = ?
    WHERE status IN ('running', 'pending')
  `).run(new Date().toISOString());
}

function createGateDecision({ gateId, batchId, chapterRunId, gateType }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO gate_decisions
      (gate_id, batch_id, chapter_run_id, gate_type, status, created_at)
    VALUES (@gateId, @batchId, @chapterRunId, @gateType, 'pending', @now)
  `).run({
    gateId,
    batchId,
    chapterRunId,
    gateType: gateType || 'review',
    now,
  });
}

function resolveGateDecision(gateId, { status, reviewerNote }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE gate_decisions
    SET status = @status, reviewer_note = @reviewerNote, decided_at = @now
    WHERE gate_id = @gateId
  `).run({
    gateId,
    status,
    reviewerNote: reviewerNote || null,
    now,
  });
}

function getGateDecision(gateId) {
  return getDb().prepare('SELECT * FROM gate_decisions WHERE gate_id = ?').get(String(gateId || '')) || null;
}

function getPendingGatesForBatch(batchId) {
  return getDb().prepare(`
    SELECT * FROM gate_decisions WHERE batch_id = ? AND status = 'pending'
  `).all(String(batchId || ''));
}

function getDb() {
  if (db) return db;
  ensureDir(getUserDataDir());
  const dbPath = path.join(getUserDataDir(), 'script_adapter.sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSchema();
  return db;
}

function getUserDataDir() {
  if (process.env.OCT_USER_DATA_DIR) return process.env.OCT_USER_DATA_DIR;
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'openclaw-terminal');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'openclaw-terminal');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'openclaw-terminal');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeBatchRow(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.book_title,
    selectedChapterIndices: parseJson(row.selected_chapter_indices, []),
    status: row.status,
    totalChapters: Number(row.total_chapters || 0),
    completedChapters: Number(row.completed_chapters || 0),
    failedChapters: Number(row.failed_chapters || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    estimatedCost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    actualCost: row.actual_cost == null ? 0 : Number(row.actual_cost),
    config: parseJson(row.config, {}),
  };
}

function normalizeChapterRunRow(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    bookId: row.book_id,
    chapterIndex: Number(row.chapter_index),
    chapterTitle: row.chapter_title || null,
    sourceChars: row.source_chars == null ? null : Number(row.source_chars),
    status: row.status,
    sheet: parseJson(row.sheet, null),
    errorMessage: row.error_message || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    cost: row.cost == null ? 0 : Number(row.cost),
    attempt: Number(row.attempt || 1),
    pendingGateId: row.pending_gate_id || null,
    pendingGateType: row.pending_gate_type || null,
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  ensureSchema,
  createBatch,
  getBatch,
  listBatches,
  listChapterRuns,
  getChapterRun,
  updateBatch,
  updateBatchStatus,
  updateChapterRun,
  rerunChapter,
  deleteBatch,
  findNextPendingChapter,
  listRunningBatches,
  refreshBatchCounters,
  createSingleRun,
  updateSingleRun,
  getSingleRun,
  listSingleRuns,
  recoverInterruptedRuns,
  createGateDecision,
  resolveGateDecision,
  getGateDecision,
  getPendingGatesForBatch,
};
