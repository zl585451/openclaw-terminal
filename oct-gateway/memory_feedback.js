/**
 * 反馈闭环：少爷说「好/不对/应该是」自动记录，启动时加载最近反馈注入上下文。
 */

const config = require('./config');
const memory = require('./memory');
const memoryHistory = require('./memory_history');

const DOMAIN = 'core';
const FEEDBACK_POSITIVE = 'agent/feedback/positive';
const FEEDBACK_NEGATIVE = 'agent/feedback/negative';
const CORRECTIONS = 'agent/corrections';

const POSITIVE_TRIGGERS = [
  '好', '好了', '对的', '就这样', '完美', '牛逼',
  '谢谢你', '太棒了', '满意',
];
const NEGATIVE_TRIGGERS = [
  '不对', '错了', '不是这意思', '理解错了',
  '太长了', '太短了', '废话多',
  '算了', '没用', '做不到',
];
const CORRECTION_PATTERNS = [
  { re: /应该是\s*(.+)/, reason: '应该是' },
  { re: /以后不要\s*(.+)/, reason: '以后不要' },
  { re: /记住\s*(.+)/, reason: '记住' },
];

function detectFeedbackType(userMsg) {
  const s = (userMsg || '').trim();
  if (!s) return null;
  for (const t of POSITIVE_TRIGGERS) {
    if (s === t || s.startsWith(t + ' ') || s.endsWith(' ' + t) || s.includes(t)) {
      return { type: 'positive', reason: t };
    }
  }
  for (const t of NEGATIVE_TRIGGERS) {
    if (s === t || s.startsWith(t + ' ') || s.endsWith(' ' + t) || s.includes(t)) {
      return { type: 'negative', reason: t };
    }
  }
  for (const { re, reason } of CORRECTION_PATTERNS) {
    if (re.test(s)) return { type: 'correction', reason };
  }
  return null;
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

function getBasePath(type) {
  if (type === 'positive') return FEEDBACK_POSITIVE;
  if (type === 'negative') return FEEDBACK_NEGATIVE;
  return CORRECTIONS;
}

/**
 * 检测并保存反馈（在 onDone 中调用，失败不阻塞）
 */
async function detectAndSaveFeedback(userMsg, amyReply) {
  if (!config.memory || config.memory.auto_save_feedback !== true) return;

  const detected = detectFeedbackType(userMsg);
  if (!detected) return;

  const alive = await memory.isAlive();
  if (!alive) return;

  const maxUser = 100;
  const maxAmy = 200;
  const { datePath, timePath, timestamp } = nowFragments();
  const base = getBasePath(detected.type);
  const pathSeg = `${base}/${datePath}/${timePath}`;
  const uri = `${DOMAIN}://${pathSeg}`;

  const payload = {
    timestamp,
    user_message: (userMsg || '').slice(0, maxUser),
    amy_reply: (amyReply || '').slice(0, maxAmy),
    feedback_type: detected.type,
    reason: detected.reason,
    action_taken: detected.type === 'correction' ? '已更新规则' : '已写入记忆',
  };
  const content = JSON.stringify(payload, null, 0);

  try {
    await memoryHistory.ensurePathExists(DOMAIN, pathSeg);
    const r = await memory.createMemory(uri, content, 2, '');
    if (r.ok) {
      console.log('[Memory] 反馈已写入:', uri);
    }
  } catch (e) {
    // 静默
  }
}

/**
 * 收集某路径下所有叶子路径（agent/feedback/positive/YYYY-MM-DD/HH-MM-SS），按路径排序取最近 N 条
 */
async function getRecentLeafPaths(basePath, limit) {
  const r = await memory.readMemory(`${DOMAIN}://${basePath}`);
  if (!r.ok || !r.data) return [];
  const children = r.data?.node?.children || r.data?.children || [];
  const datePaths = [];
  for (const c of children) {
    const raw = c.path || c.uri?.replace(/^[^:]+:\/\//, '') || '';
    const seg = raw.split('/').pop() || raw;
    if (seg && /^\d{4}-\d{2}-\d{2}$/.test(seg)) {
      datePaths.push(raw.includes(basePath) ? raw : `${basePath}/${seg}`);
    }
  }
  datePaths.sort().reverse();
  const leaves = [];
  for (const datePath of datePaths.slice(0, 14)) {
    const r2 = await memory.readMemory(`${DOMAIN}://${datePath}`);
    if (!r2.ok) continue;
    const timeChildren = r2.data?.node?.children || r2.data?.children || [];
    for (const tc of timeChildren) {
      const rawT = tc.path || tc.uri?.replace(/^[^:]+:\/\//, '') || '';
      const timeSeg = rawT.split('/').pop() || rawT;
      if (timeSeg && /^\d{2}-\d{2}-\d{2}$/.test(timeSeg)) {
        const full = rawT.includes(datePath) ? rawT : `${datePath}/${timeSeg}`;
        leaves.push(full);
      }
    }
    if (leaves.length >= limit) break;
  }
  leaves.sort().reverse();
  return leaves.slice(0, limit);
}

/**
 * 启动时加载最近反馈，拼成精简文本注入 system prompt
 */
async function loadFeedbackForBoot() {
  if (!config.memory || config.memory.load_feedback_on_boot !== true) return '';

  const alive = await memory.isAlive();
  if (!alive) return '';

  const positiveLimit = 5;
  const negativeLimit = 5;
  const correctionsLimit = 10;
  const sections = [];

  try {
    const posPaths = await getRecentLeafPaths(FEEDBACK_POSITIVE, positiveLimit);
    if (posPaths.length > 0) {
      const lines = [];
      for (const p of posPaths) {
        const r = await memory.readMemory(`${DOMAIN}://${p}`);
        if (r.ok && r.data) {
          const node = r.data?.node || r.data;
          const raw = node?.content || node?.content_snippet || '';
          try {
            const j = JSON.parse(raw);
            lines.push(`- 少爷说「${j.reason}」→ ${(j.amy_reply || '').slice(0, 50)}...`);
          } catch {
            lines.push(`- ${raw.slice(0, 60)}...`);
          }
        }
      }
      if (lines.length) {
        sections.push(`### 少爷喜欢的回复（最近${lines.length}条）\n${lines.join('\n')}`);
      }
    }
  } catch (e) {}

  try {
    const negPaths = await getRecentLeafPaths(FEEDBACK_NEGATIVE, negativeLimit);
    if (negPaths.length > 0) {
      const lines = [];
      for (const p of negPaths) {
        const r = await memory.readMemory(`${DOMAIN}://${p}`);
        if (r.ok && r.data) {
          const node = r.data?.node || r.data;
          const raw = node?.content || node?.content_snippet || '';
          try {
            const j = JSON.parse(raw);
            lines.push(`- 少爷说「${j.reason}」→ 避免类似：${(j.amy_reply || '').slice(0, 50)}...`);
          } catch {
            lines.push(`- ${raw.slice(0, 60)}...`);
          }
        }
      }
      if (lines.length) {
        sections.push(`### 少爷不喜欢的回复（最近${lines.length}条）\n${lines.join('\n')}`);
      }
    }
  } catch (e) {}

  try {
    const corPaths = await getRecentLeafPaths(CORRECTIONS, correctionsLimit);
    if (corPaths.length > 0) {
      const lines = [];
      for (const p of corPaths) {
        const r = await memory.readMemory(`${DOMAIN}://${p}`);
        if (r.ok && r.data) {
          const node = r.data?.node || r.data;
          const raw = node?.content || node?.content_snippet || '';
          try {
            const j = JSON.parse(raw);
            lines.push(`- ${j.reason}：${(j.user_message || '').slice(0, 60)}...`);
          } catch {
            lines.push(`- ${raw.slice(0, 60)}...`);
          }
        }
      }
      if (lines.length) {
        sections.push(`### 少爷纠正的规则（最近${lines.length}条）\n${lines.join('\n')}`);
      }
    }
  } catch (e) {}

  if (sections.length === 0) return '';
  return '\n\n## 📌 反馈与纠正（启动时加载）\n\n' + sections.join('\n\n');
}

module.exports = { detectFeedbackType, detectAndSaveFeedback, loadFeedbackForBoot };
