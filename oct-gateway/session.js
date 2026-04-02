const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLogger } = require('./logger');
const log = createLogger('session');

// ═══════════════════════════════════════════════════════════════
// 会话数据瘦身优化
// ═══════════════════════════════════════════════════════════════
const MAX_HISTORY = 30; // 从 50 降到 30，减少内存占用
const MAX_HISTORY_CHARS = 40000; // 约 2 万 token，留 system prompt 余量
const SESSION_EXPIRE_DAYS = 3; // 从 7 天缩短到 3 天
const CACHE_DIR = process.env.OCT_CACHE_DIR || path.join(os.homedir(), '.oct-gateway');
const SESSIONS_FILE = path.join(CACHE_DIR, 'sessions.json');

// 限制单个会话的消息条数
const MAX_MESSAGES_PER_SESSION = 30;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 会话消息裁剪：保留系统消息 + 最近 N 条
function trimSession(messages) {
  if (!messages || messages.length <= MAX_MESSAGES_PER_SESSION) return messages;
  
  const systemMsgs = messages.filter(m => m.role === 'system');
  const recentMsgs = messages
    .filter(m => m.role !== 'system')
    .slice(-MAX_MESSAGES_PER_SESSION);
  
  return [...systemMsgs, ...recentMsgs];
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      return new Map(Object.entries(data));
    }
  } catch (e) {
    log.warn('load cache failed', { error: e?.message || String(e) });
  }
  return new Map();
}

let saveTimer = null;
function saveSessions() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj = Object.fromEntries(sessions);
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      log.warn('save cache failed', { error: e?.message || String(e) });
    }
    saveTimer = null;
  }, 500);
}

const sessions = loadSessions();
log.info('loaded sessions', { count: sessions.size });

// 思考模式存储（每个会话独立）
const thinkModes = new Map();

function getSession(sessionKey) {
  if (!sessions.has(sessionKey)) {
    sessions.set(sessionKey, []);
  }
  return sessions.get(sessionKey);
}

function getHistory(sessionKey) {
  return getSession(sessionKey);
}

function addMessage(sessionKey, role, content) {
  const history = getSession(sessionKey);
  history.push({ role, content, timestamp: Date.now() });
  
  // 应用裁剪：保留最近消息
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  
  // 额外裁剪：确保单个会话不超过限制
  const trimmed = trimSession(history);
  if (trimmed.length !== history.length) {
    history.length = 0;
    history.push(...trimmed);
  }
  
  // 按总字符裁剪（从最早的消息开始删，但保留至少 2 条保证对话完整性）
  let totalChars = history.reduce((s, m) => s + (m.content?.length || 0), 0);
  while (totalChars > MAX_HISTORY_CHARS && history.length > 2) {
    const removed = history.shift();
    totalChars -= (removed.content?.length || 0);
  }
  
  saveSessions();
}

function clearSession(sessionKey) {
  sessions.delete(sessionKey);
  thinkModes.delete(sessionKey); // 清理会话时同步删除思考模式，避免 Map 泄漏
  saveSessions();
}

function listSessions() {
  return [...sessions.keys()];
}

function isFirstMessage(sessionKey) {
  return getSession(sessionKey).length === 0;
}

// 设置思考模式
function setThinkMode(sessionKey, level) {
  thinkModes.set(sessionKey, level);
}

// 获取思考模式
function getThinkMode(sessionKey) {
  return thinkModes.get(sessionKey) || 'off';
}

// 清除思考模式
function clearThinkMode(sessionKey) {
  thinkModes.delete(sessionKey);
}

function cleanOldSessions() {
  const expireThreshold = Date.now() - SESSION_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const [key, messages] of sessions.entries()) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.timestamp && lastMsg.timestamp < expireThreshold) {
      sessions.delete(key);
      thinkModes.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.info('cleaned old sessions', { cleaned, expireDays: SESSION_EXPIRE_DAYS });
    saveSessions();
  }
}

cleanOldSessions();

module.exports = { getHistory, addMessage, clearSession, listSessions, isFirstMessage, setThinkMode, getThinkMode, clearThinkMode };
