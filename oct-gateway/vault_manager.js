const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getVaultPath() {
  if (process.env.OCT_VAULT_PATH) return process.env.OCT_VAULT_PATH;
  const baseDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'openclaw-terminal')
    : path.join(os.homedir(), '.config', 'openclaw-terminal');
  return path.join(baseDir, 'vault.enc');
}

const VAULT_FILE = getVaultPath();
const VAULT_VERSION = 1;

function normalizeKey(key) {
  return (key || '').trim().toLowerCase().replace(/\s+/g, '_');
}
const PBKDF2_ITERATIONS = 200000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const GCM_IV_LEN = 16;
const GCM_TAG_LEN = 16;
const SALT_LEN = 32;

// 内存中的解锁状态（进程退出自动清除）
let _unlockedData = null;
let _derivedKey = null;
let _lockTimer = null;
const AUTO_LOCK_MS = 30 * 60 * 1000; // 30分钟无操作自动锁定

// 派生密钥
function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(
    masterPassword, salt,
    PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST
  );
}

// 加密
function encrypt(data, key) {
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

// 解密
function decrypt(buf, key) {
  const iv = buf.subarray(0, GCM_IV_LEN);
  const tag = buf.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN);
  const encrypted = buf.subarray(GCM_IV_LEN + GCM_TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// 保险箱是否存在
function vaultExists() {
  return fs.existsSync(VAULT_FILE);
}

// 保险箱是否已解锁
function isUnlocked() {
  return _unlockedData !== null;
}

// 重置自动锁定计时器
function resetLockTimer() {
  if (_lockTimer) clearTimeout(_lockTimer);
  _lockTimer = setTimeout(() => {
    lock();
    console.log('[Vault] 自动锁定（30分钟无操作）');
  }, AUTO_LOCK_MS);
}

// 创建新保险箱
function create(masterPassword) {
  if (vaultExists()) throw new Error('保险箱已存在，请先解锁');

  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(masterPassword, salt);
  const initialData = { version: VAULT_VERSION, items: {} };
  const encrypted = encrypt(initialData, key);

  // 文件格式：[SALT(32)] + [ENCRYPTED_DATA]
  const buf = Buffer.concat([salt, encrypted]);

  // 确保目录存在
  const dir = path.dirname(VAULT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(VAULT_FILE, buf);

  _unlockedData = initialData;
  _derivedKey = key;
  resetLockTimer();

  console.log('[Vault] 保险箱已创建并解锁');
  return { success: true };
}

// 解锁保险箱
function unlock(masterPassword) {
  if (!vaultExists()) throw new Error('保险箱不存在，请先创建');

  try {
    const buf = fs.readFileSync(VAULT_FILE);
    const salt = buf.subarray(0, SALT_LEN);
    const encrypted = buf.subarray(SALT_LEN);

    const key = deriveKey(masterPassword, salt);
    const data = decrypt(encrypted, key);

    _unlockedData = data;
    _derivedKey = key;
    resetLockTimer();

    console.log('[Vault] 保险箱已解锁，条目数:', Object.keys(data.items).length);
    return { success: true, itemCount: Object.keys(data.items).length };
  } catch (e) {
    console.error('[Vault] 解锁失败（密码错误或文件损坏）');
    throw new Error('密码错误或保险箱文件损坏');
  }
}

// 锁定保险箱
function lock() {
  _unlockedData = null;
  _derivedKey = null;
  if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
  console.log('[Vault] 保险箱已锁定');
}

// 保存到磁盘（内部方法）
function _save() {
  if (!_unlockedData || !_derivedKey) throw new Error('保险箱未解锁');

  const buf = fs.readFileSync(VAULT_FILE);
  const salt = buf.subarray(0, SALT_LEN);
  const encrypted = encrypt(_unlockedData, _derivedKey);

  fs.writeFileSync(VAULT_FILE, Buffer.concat([salt, encrypted]));
}

// 存入凭证
function setItem(refName, label, value, category = 'general', riskLevel = 'normal') {
  if (!isUnlocked()) throw new Error('保险箱未解锁，请先解锁');
  resetLockTimer();

  const key = normalizeKey(refName);
  _unlockedData.items[key] = {
    label,
    value,
    category,    // api_key / email / wallet / password / token / general
    riskLevel,   // normal / high / critical
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastUsedAt: null
  };

  _save();
  console.log(`[Vault] 已存入: ${key} (${category})`);
  return { success: true };
}

// 获取凭证值（用于实际执行，执行后调用方负责不保留明文）
function getItem(refName) {
  if (!isUnlocked()) throw new Error('保险箱未解锁');
  resetLockTimer();

  const key = normalizeKey(refName);
  let item = _unlockedData.items[key];
  let resolvedKey = key;

  // 如果找不到，尝试模糊匹配（兼容旧数据）
  if (!item) {
    const fuzzyKey = Object.keys(_unlockedData.items).find(k =>
      normalizeKey(k) === key || k.includes((refName || '').trim())
    );
    if (fuzzyKey) {
      item = _unlockedData.items[fuzzyKey];
      resolvedKey = fuzzyKey;
    } else {
      throw new Error(`凭证 "${refName}" 不存在`);
    }
  }

  _unlockedData.items[resolvedKey].lastUsedAt = Date.now();
  _save();

  return item.value;
}

// 列出所有凭证（只返回元数据，不返回 value）
function listItems() {
  if (!isUnlocked()) throw new Error('保险箱未解锁');
  resetLockTimer();

  return Object.entries(_unlockedData.items).map(([key, item]) => ({
    refName: key,
    label: item.label,
    category: item.category,
    riskLevel: item.riskLevel,
    lastUsedAt: item.lastUsedAt,
    createdAt: item.createdAt
  }));
}

// 删除凭证
function deleteItem(refName) {
  if (!isUnlocked()) throw new Error('保险箱未解锁');
  resetLockTimer();

  const key = normalizeKey(refName);
  let resolvedKey = key;
  if (!_unlockedData.items[key]) {
    const fuzzyKey = Object.keys(_unlockedData.items).find(k =>
      normalizeKey(k) === key || k.includes((refName || '').trim())
    );
    if (fuzzyKey) resolvedKey = fuzzyKey;
    else throw new Error(`凭证 "${refName}" 不存在`);
  }
  delete _unlockedData.items[resolvedKey];
  _save();

  console.log(`[Vault] 已删除: ${resolvedKey}`);
  return { success: true };
}

// 更换主密码
function changeMasterPassword(oldPassword, newPassword) {
  if (!vaultExists()) throw new Error('保险箱不存在');

  // 用旧密码验证并读取
  const buf = fs.readFileSync(VAULT_FILE);
  const salt = buf.subarray(0, SALT_LEN);
  const encrypted = buf.subarray(SALT_LEN);
  const oldKey = deriveKey(oldPassword, salt);

  let data;
  try {
    data = decrypt(encrypted, oldKey);
  } catch {
    throw new Error('旧密码错误');
  }

  // 用新密码重新加密（新盐）
  const newSalt = crypto.randomBytes(SALT_LEN);
  const newKey = deriveKey(newPassword, newSalt);
  const newEncrypted = encrypt(data, newKey);

  fs.writeFileSync(VAULT_FILE, Buffer.concat([newSalt, newEncrypted]));

  _derivedKey = newKey;
  console.log('[Vault] 主密码已更换');
  return { success: true };
}

module.exports = {
  vaultExists, isUnlocked,
  create, unlock, lock,
  setItem, getItem, listItems, deleteItem,
  changeMasterPassword
};
