const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_HISTORY = 50;
const CACHE_DIR = process.env.OCT_CACHE_DIR || path.join(os.homedir(), '.oct-gateway');
const SESSIONS_FILE = path.join(CACHE_DIR, 'sessions.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      return new Map(Object.entries(data));
    }
  } catch (e) {
    console.warn('[Session] 加载缓存失败:', e.message);
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
      console.warn('[Session] 保存缓存失败:', e.message);
    }
    saveTimer = null;
  }, 500);
}

const sessions = loadSessions();
console.log('[Session] 已加载 ' + sessions.size + ' 个历史会话');

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
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  saveSessions();
}

function clearSession(sessionKey) {
  sessions.delete(sessionKey);
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
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const [key, messages] of sessions.entries()) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.timestamp && lastMsg.timestamp < sevenDaysAgo) {
      sessions.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log('[Session] 清理了 ' + cleaned + ' 个过期会话');
    saveSessions();
  }
}

cleanOldSessions();

module.exports = { getHistory, addMessage, clearSession, listSessions, isFirstMessage, setThinkMode, getThinkMode, clearThinkMode };
