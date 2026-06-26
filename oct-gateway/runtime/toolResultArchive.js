'use strict';

/**
 * Tool Result Archive
 *
 * 把工具调用的完整结果落盘到 JSONL 文件，避免在 messages 里反复塞原文。
 * 模型可以通过 recall_tool_result(callId) 工具按需取回完整内容。
 *
 * 文件位置: <gateway_root>/data/tool_results.jsonl
 * 一行一条记录，append-only。
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');

const log = createLogger('toolResultArchive');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'tool_results.jsonl');

// 默认截断阈值（字符数）。超过此值的工具结果会被截断后再返回给模型。
const DEFAULT_MAX_CHARS = 2500;

// 工具白名单：这些工具的结果通常很大，必须截断
const HIGH_VOLUME_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'http_request',
  'read_file',
  'read_document',
  'memory_search',
]);

function ensureArchiveDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    log.warn('确保归档目录失败', { error: err?.message });
  }
}

/**
 * 把工具结果存档到 JSONL 文件
 *
 * @param {object} entry
 * @param {string} entry.callId - tool_call_id
 * @param {string} entry.toolName
 * @param {object} entry.args
 * @param {*} entry.result - 完整结果（任意类型）
 * @param {string} [entry.turnId]
 * @param {string} [entry.sessionKey]
 */
function archiveToolResult(entry) {
  ensureArchiveDir();
  const record = {
    timestamp: new Date().toISOString(),
    callId: entry.callId,
    toolName: entry.toolName,
    args: entry.args,
    turnId: entry.turnId || null,
    sessionKey: entry.sessionKey || null,
    result: entry.result,
  };
  try {
    fs.appendFileSync(ARCHIVE_FILE, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    log.warn('工具结果归档失败', { callId: entry.callId, error: err?.message });
  }
}

/**
 * 按 callId 查询完整结果
 *
 * @param {string} callId
 * @returns {object|null}
 */
function recallToolResult(callId) {
  if (!fs.existsSync(ARCHIVE_FILE)) return null;
  try {
    const content = fs.readFileSync(ARCHIVE_FILE, 'utf-8');
    const lines = content.trim().split('\n').reverse();
    for (const line of lines) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record.callId === callId) return record;
      } catch {
        // 损坏的行跳过
      }
    }
  } catch (err) {
    log.warn('回读工具结果失败', { callId, error: err?.message });
  }
  return null;
}

/**
 * 智能截断工具结果
 *
 * 策略:
 * - 高产出工具（web_search/web_fetch 等）默认截断
 * - 普通工具仅在结果超长时截断
 * - 截断后保留前 60% + 后 30% + 中间提示
 *
 * @param {string} toolName
 * @param {*} rawResult - 原始工具结果
 * @param {string} callId
 * @param {object} [options]
 * @param {number} [options.maxChars] - 字符阈值（默认 DEFAULT_MAX_CHARS）
 * @returns {{truncated: boolean, value: *, originalSize: number}}
 */
function truncateToolResult(toolName, rawResult, callId, options = {}) {
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;

  const serialized = typeof rawResult === 'string'
    ? rawResult
    : JSON.stringify(rawResult);

  const originalSize = serialized.length;

  if (originalSize <= maxChars) {
    return { truncated: false, value: rawResult, originalSize };
  }

  const isHighVolume = HIGH_VOLUME_TOOLS.has(toolName);
  if (!isHighVolume && originalSize <= maxChars * 1.5) {
    return { truncated: false, value: rawResult, originalSize };
  }

  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = Math.floor(maxChars * 0.3);
  const head = serialized.slice(0, headSize);
  const tail = serialized.slice(-tailSize);

  const summary = `${head}\n\n[...中间已省略 ${originalSize - headSize - tailSize} 字符...]\n\n${tail}\n\n[工具结果已截断，完整原文 ${originalSize} 字符已存档，callId=${callId}，如需完整内容可调用 recall_tool_result 工具]`;

  return { truncated: true, value: summary, originalSize };
}

module.exports = {
  archiveToolResult,
  recallToolResult,
  truncateToolResult,
  DEFAULT_MAX_CHARS,
  HIGH_VOLUME_TOOLS,
};
