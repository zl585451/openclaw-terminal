/**
 * 历史摘要兼容层。当前产品主链已经改为 raw turn JSONL + 分层摘要；
 * 本文件仅保留旧函数定义，供历史代码安全调用。
 */

const config = require('./config');
const memory = require('./memory');
const { sanitizeAssistantReply } = require('./cot_sanitize');
const memoryGovernor = require('./memory_governor');
const { createLogger } = require('./logger');
const log = createLogger('memory_history');

const DOMAIN = 'core';
const HISTORY_BASE = 'my_user/history';

function extractHttpStatusFromError(errText) {
  const s = String(errText || '');
  const m = s.match(/HTTP\s+(\d{3})\b/);
  return m ? (m[1] | 0) : null;
}

function inferType(userMsg) {
  const s = (userMsg || '').trim();
  if (/^(帮我|写|改|修|加|实现|做一下|检查)/.test(s) || s.includes('代码') || s.includes('文件')) return 'task';
  if (s.length < 30 && /\?|？|怎么|什么|哪|谁|多少/.test(s)) return 'query';
  return 'chat';
}

function nowFragments() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return {
    datePath: `${Y}-${M}-${D}`,
    timePath: `${h}-${m}-${sec}`,
    timestamp: `${Y}-${M}-${D} ${h}:${m}:${sec}`,
  };
}

/**
 * 确保父路径存在（逐级"先读后写"）。
 * 规则：读成功跳过；404 则写入占位内容；其它错误抛出。
 * 不包含 fullPath 自身，仅其父级。
 * 
 * 注意：当前默认后端为 Memory v2，本函数大多只在兼容路径下被调用。
 */
async function ensurePathExists(domain, fullPath) {
  return;
}

/**
 * 保存一轮对话摘要到 core://my_user/history/YYYY-MM-DD/HH-MM-SS
 *
 * @deprecated v0.4.0 起不再被调用，由 memory_raw_log.js 的 saveRawTurn 取代。
 * 旧行为：用 AI 压缩对话后写入 core://my_user/history/...。
 * 保留函数定义仅供历史参考，实际调用方已在 postProcessor.js 中移除。
 *
 * @param {string} userMsg - 用户消息原文
 * @param {string} amyReply - AMY 回复原文
 * @param {string} [type] - 'chat' | 'task' | 'query'，不传则自动推断
 */
async function saveHistorySummary(userMsg, amyReply, type) {
  log.debug('saveHistorySummary called', { memoryConfig: config.memory || null });

  if (!config.memory || config.memory.auto_save_history !== true) {
    log.debug('auto_save_history disabled, skip');
    return;
  }

  const alive = await memory.isAlive();
  if (!alive) return;

  const maxUser = (config.memory.compress_length && config.memory.compress_length.user) || 100;
  const maxAmy = (config.memory.compress_length && config.memory.compress_length.amy) || 200;
  const cleanAmyReply = sanitizeAssistantReply(amyReply || '');

  const { datePath, timePath, timestamp } = nowFragments();
  const pathSeg = `${HISTORY_BASE}/${datePath}/${timePath}`;
  const uri = `core://${pathSeg}`;

  const t = type || inferType(userMsg);
  const payload = {
    timestamp,
    user: (userMsg || '').slice(0, maxUser),
    amy: cleanAmyReply.slice(0, maxAmy),
    type: t,
    feedback: null,
  };
  const routed = memoryGovernor.routeRecord({
    source: 'history_summary',
    uri,
    content: JSON.stringify(payload, null, 0),
    priority: 2,
    disclosure: '',
    userMsg,
    assistantReply: cleanAmyReply,
  });

  if (routed.decision === 'reject') {
    log.debug('history summary rejected by governor', { uri, reason: routed.reason });
    return;
  }
  log.info('history summary governor decision', {
    originalUri: uri,
    targetUri: routed.uri,
    decision: routed.decision,
    layer: routed.layer,
    reason: routed.reason,
  });

  const targetUri = routed.uri;
  const content = routed.content;
  const targetParts = targetUri.match(/^([^:]+):\/\/(.+)$/);
  const targetDomain = targetParts ? targetParts[1] : DOMAIN;
  const targetPathSeg = targetParts ? targetParts[2] : pathSeg;

  try {
    log.debug('write history summary', { uri: targetUri, originalUri: uri, type: t, layer: routed.layer });
    await ensurePathExists(targetDomain, targetPathSeg);
    const r = await memory.createMemory(targetUri, content, routed.priority ?? 2, routed.disclosure ?? '');
    if (r.ok) {
      log.info('history summary written', { uri: targetUri, originalUri: uri, decision: routed.decision });
    } else if (!r.error?.includes('already exists')) {
      const wr = await memory.writeMemory(targetUri, content, routed.priority ?? 2, routed.disclosure ?? '');
      if (wr.ok) log.info('history summary written', { uri: targetUri, originalUri: uri, decision: routed.decision });
      else log.error('history summary write failed', { uri: targetUri, originalUri: uri, error: wr.error });
    }
  } catch (e) {
    log.error('history summary exception', { uri: targetUri, originalUri: uri, error: e?.message || String(e) });
  }
}

/**
 * 启动时清理超过 max_history_days 的历史。
 * 当前 raw turn 按日期 JSONL 分片存储，这里不再负责清理。
 */
async function cleanupOldHistory() {
  return;
}

module.exports = { saveHistorySummary, cleanupOldHistory, ensurePathExists, inferType, nowFragments };
