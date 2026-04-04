/**
 * 对话摘要自动写入 Nocturne：core://my_user/history/YYYY-MM-DD/HH-MM-SS
 * 受 config.memory.auto_save_history 控制，写入失败不阻塞对话。
 */

const config = require('./config');
const memory = require('./memory');
const { sanitizeAssistantReply } = require('./cot_sanitize');
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
 * 注意：使用 writeMemory 而非 createMemory，因为 Nocturne 对空节点返回 404。
 */
async function ensurePathExists(domain, fullPath) {
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length <= 1) return;

  for (let i = 1; i < parts.length; i++) {
    const path = parts.slice(0, i).join('/');
    const uri = `${domain}://${path}`;

    // 先检查是否已存在
    const rr = await memory.readMemory(uri, { treat404AsDebug: true });
    if (rr.ok) {
      log.debug('ensurePathExists: path exists', { uri });
      continue;
    }

    const status = extractHttpStatusFromError(rr.error);
    if (status !== 404) {
      log.warn('ensurePathExists: read failed (non-404)', { uri, error: rr.error });
      throw new Error(rr.error || 'read failed');
    }

    // 404：路径不存在，用 writeMemory 创建并写入占位内容
    const placeholderContent = JSON.stringify({ type: 'directory', label: parts[i - 1] });
    const wr = await memory.writeMemory(uri, placeholderContent, 2, '', { ensureParent: true });
    if (wr.ok) {
      log.info('ensurePathExists: created', { uri });
    } else {
      const wStatus = extractHttpStatusFromError(wr.error);
      if (wStatus === 422) {
        log.debug('ensurePathExists: path already exists (422)', { uri });
      } else {
        log.error('ensurePathExists: write failed', { uri, error: wr.error });
        throw new Error(wr.error || 'write failed');
      }
    }
  }
}

/**
 * 保存一轮对话摘要到 core://my_user/history/YYYY-MM-DD/HH-MM-SS
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
  const content = JSON.stringify(payload, null, 0);

  try {
    log.debug('write history summary', { uri, type: t });
    await ensurePathExists(DOMAIN, pathSeg);
    const r = await memory.createMemory(uri, content, 2, '');
    if (r.ok) {
      log.info('history summary written', { uri });
    } else if (!r.error?.includes('already exists')) {
      const wr = await memory.writeMemory(uri, content, 2, '');
      if (wr.ok) log.info('history summary written', { uri });
      else log.error('history summary write failed', { uri, error: wr.error });
    }
  } catch (e) {
    log.error('history summary exception', { uri, error: e?.message || String(e) });
  }
}

/**
 * 启动时清理超过 max_history_days 的历史（需 Nocturne 支持按 path 删除或列出子节点）
 * 当前为占位：若后端无 delete 接口则仅打日志。
 */
async function cleanupOldHistory() {
  if (!config.memory || config.memory.auto_save_history !== true) return;
  const maxDays = (config.memory.max_history_days || 7) | 0;
  if (maxDays <= 0) return;

  const alive = await memory.isAlive();
  if (!alive) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const r = await memory.readMemory(`core://${HISTORY_BASE}`, { treat404AsDebug: true });
    if (!r.ok || !r.data) return;
    const children = r.data?.node?.children || r.data?.children || [];
    for (const ch of children) {
      const name = (ch.path || ch.name || '').split('/').pop() || '';
      if (name < cutoffStr) {
        // 可选：调用 delete 接口删除 core://my_user/history/YYYY-MM-DD
        log.debug('history cleanup candidate', { date: name, note: 'needs Nocturne delete api' });
      }
    }
  } catch (e) {
    // 忽略
  }
}

module.exports = { saveHistorySummary, cleanupOldHistory, ensurePathExists, inferType, nowFragments };
