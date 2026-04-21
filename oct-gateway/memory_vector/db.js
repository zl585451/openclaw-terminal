/**
 * Vector database wrapper for P3 semantic recall.
 * Dependencies are loaded lazily so disabled recall does not affect gateway boot.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { createLogger } = require('../logger');

const logger = createLogger('vector_db');

let db = null;
let sqliteVec = null;

function normalizeVector(vector) {
  const values = Array.isArray(vector) ? vector.map(Number) : [];
  const norm = Math.sqrt(values.reduce((sum, n) => sum + n * n, 0));
  if (!Number.isFinite(norm) || norm <= 0) return values;
  return values.map((n) => n / norm);
}

function serializeVector(vector) {
  const normalized = normalizeVector(vector);
  if (sqliteVec && typeof sqliteVec.serializeFloat32 === 'function') {
    return sqliteVec.serializeFloat32(normalized);
  }
  return Buffer.from(new Float32Array(normalized).buffer);
}

function resolveDbPath() {
  const rawPath = config.memory.vectorRecall.dbPath || path.join(__dirname, '..', 'runtime_data', 'vectors.db');
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(__dirname, '..', rawPath);
}

function initDatabase() {
  if (db) return db;

  const Database = require('better-sqlite3');
  sqliteVec = require('sqlite-vec');

  const absPath = resolveDbPath();
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  db = new Database(absPath);
  sqliteVec.load(db);

  const dimensions = config.memory.vectorRecall.embedding.dimensions;
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS raw_vectors USING vec0(
      embedding FLOAT[${dimensions}]
    );

    CREATE TABLE IF NOT EXISTS raw_meta (
      rowid INTEGER PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      session TEXT,
      text_preview TEXT,
      user_text TEXT,
      assistant_text TEXT,
      source_ts TEXT,
      created_at TEXT NOT NULL,
      embedding_model TEXT,
      embedding_version INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_raw_meta_date ON raw_meta(date);
    CREATE INDEX IF NOT EXISTS idx_raw_meta_uri ON raw_meta(uri);
    CREATE INDEX IF NOT EXISTS idx_raw_meta_model_version ON raw_meta(embedding_model, embedding_version);

    CREATE TABLE IF NOT EXISTS embedding_failed (
      uri TEXT PRIMARY KEY,
      last_error TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT
    );
  `);

  logger.info('[VectorDB] 已初始化', { path: absPath, dimensions });
  return db;
}

function ensureVectorShape(vector) {
  const expected = config.memory.vectorRecall.embedding.dimensions;
  if (!Array.isArray(vector) || vector.length !== expected) {
    throw new Error(`VECTOR_DIMENSION_MISMATCH: expected ${expected}, got ${Array.isArray(vector) ? vector.length : 0}`);
  }
}

function hasVector(uri) {
  const database = initDatabase();
  return !!database.prepare('SELECT 1 FROM raw_meta WHERE uri = ?').get(uri);
}

function insertVector({ uri, date, session, userText, assistantText, textPreview, sourceTs, vector, model, version }) {
  const database = initDatabase();
  ensureVectorShape(vector);

  const existing = database.prepare('SELECT rowid FROM raw_meta WHERE uri = ?').get(uri);
  if (existing) return { inserted: false, rowid: existing.rowid };

  const vecBuffer = serializeVector(vector);
  const tx = database.transaction(() => {
    const meta = database.prepare(`
      INSERT INTO raw_meta (
        uri, date, session, text_preview, user_text, assistant_text,
        source_ts, created_at, embedding_model, embedding_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uri,
      date,
      session || 'default',
      textPreview || '',
      userText || '',
      assistantText || '',
      sourceTs || '',
      new Date().toISOString(),
      model || '',
      version || 1
    );

    const rowid = Number(meta.lastInsertRowid);
    if (!Number.isInteger(rowid) || rowid <= 0) {
      throw new Error(`VECTOR_ROWID_INVALID: ${String(meta.lastInsertRowid)}`);
    }
    database.prepare('INSERT INTO raw_vectors (rowid, embedding) VALUES (?, ?)').run(BigInt(rowid), vecBuffer);
    return rowid;
  });

  return { inserted: true, rowid: tx() };
}

function searchSimilar(queryVector, opts = {}) {
  const database = initDatabase();
  ensureVectorShape(queryVector);

  const recallCfg = config.memory.vectorRecall.recall;
  const embeddingCfg = config.memory.vectorRecall.embedding;
  const topK = opts.topK ?? recallCfg.topK;
  const threshold = opts.threshold ?? recallCfg.threshold;
  const vecBuffer = serializeVector(queryVector);

  const rows = database.prepare(`
    SELECT
      m.uri, m.date, m.session, m.text_preview, m.user_text, m.assistant_text,
      m.source_ts, m.created_at, m.embedding_model, m.embedding_version,
      v.distance
    FROM raw_vectors v
    JOIN raw_meta m ON m.rowid = v.rowid
    WHERE v.embedding MATCH ?
      AND k = ?
      AND m.embedding_model = ?
      AND m.embedding_version = ?
    ORDER BY v.distance
  `).all(vecBuffer, Math.max(topK * 3, topK), embeddingCfg.model || '', embeddingCfg.version || 1);

  const now = Date.now();
  const sameSessionWindowMs = recallCfg.sameSessionWindowMs || 0;
  let results = rows.map((row) => ({
    ...row,
    distance: Number(row.distance),
    similarity: Math.max(0, 1 - Number(row.distance) / 2),
  }));

  if (opts.excludeDate) results = results.filter((row) => row.date !== opts.excludeDate);
  if (opts.excludeSession && recallCfg.excludeSameSession !== false) {
    results = results.filter((row) => {
      if (row.session !== opts.excludeSession) return true;
      if (!sameSessionWindowMs || !row.source_ts) return false;
      const ts = Date.parse(row.source_ts);
      return Number.isFinite(ts) ? now - ts > sameSessionWindowMs : false;
    });
  }

  return results.filter((row) => row.similarity >= threshold).slice(0, topK);
}

function getStats() {
  const database = initDatabase();
  const total = database.prepare('SELECT COUNT(*) AS c FROM raw_meta').get().c;
  const byDate = database.prepare(`
    SELECT date, COUNT(*) AS c FROM raw_meta
    GROUP BY date ORDER BY date DESC LIMIT 30
  `).all();
  const failed = database.prepare('SELECT COUNT(*) AS c FROM embedding_failed').get().c;
  const latest = database.prepare(`
    SELECT uri, date, source_ts, created_at, embedding_model, embedding_version
    FROM raw_meta
    ORDER BY rowid DESC
    LIMIT 1
  `).get() || null;
  const latestFailure = database.prepare(`
    SELECT uri, last_error, attempts, last_attempt_at
    FROM embedding_failed
    ORDER BY last_attempt_at DESC
    LIMIT 1
  `).get() || null;
  return { total, byDate, failed, latest, latestFailure, dbPath: resolveDbPath() };
}

function recordFailure(uri, error) {
  const database = initDatabase();
  database.prepare(`
    INSERT INTO embedding_failed (uri, last_error, attempts, last_attempt_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(uri) DO UPDATE SET
      last_error = excluded.last_error,
      attempts = attempts + 1,
      last_attempt_at = excluded.last_attempt_at
  `).run(uri, String(error || ''), new Date().toISOString());
}

function clearFailure(uri) {
  const database = initDatabase();
  database.prepare('DELETE FROM embedding_failed WHERE uri = ?').run(uri);
}

function listFailures(limit = 100) {
  const database = initDatabase();
  return database.prepare(`
    SELECT * FROM embedding_failed
    WHERE attempts < 10
    ORDER BY last_attempt_at ASC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  initDatabase,
  insertVector,
  searchSimilar,
  getStats,
  hasVector,
  recordFailure,
  clearFailure,
  listFailures,
  normalizeVector,
};
