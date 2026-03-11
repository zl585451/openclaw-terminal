const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SEGMENT_LEN = 4;
const SEGMENTS = 3;
const COUNT = 60;

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function randomSegment(len) {
  return Array.from({ length: len }, randomChar).join('');
}

function generateKey() {
  const parts = Array.from({ length: SEGMENTS }, () => randomSegment(SEGMENT_LEN));
  return 'OCT-' + parts.join('-');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const seen = new Set();
const keys = [];
while (keys.length < COUNT) {
  const key = generateKey();
  if (seen.has(key)) continue;
  seen.add(key);
  keys.push(key);
}

// 保存明文到 scripts/license_keys.txt
const keysPath = path.join(__dirname, 'license_keys.txt');
fs.writeFileSync(keysPath, keys.join('\n') + '\n', 'utf-8');
console.log('Saved', keys.length, 'keys to', keysPath);

// 计算哈希
const hashes = keys.map(sha256);

// 更新 electron/main.ts
const mainPath = path.join(__dirname, '..', 'electron', 'main.ts');
let mainContent = fs.readFileSync(mainPath, 'utf-8');

const hashArrayContent = hashes.map((h) => `  '${h}'`).join(',\n');
const newBlock = `const VALID_LICENSE_HASHES: string[] = [\n${hashArrayContent}\n];`;

mainContent = mainContent.replace(
  /const VALID_LICENSE_HASHES: string\[\] = \[\s*[\s\S]*?\];/,
  newBlock
);

fs.writeFileSync(mainPath, mainContent, 'utf-8');
console.log('Updated VALID_LICENSE_HASHES in electron/main.ts');

console.log('\nGenerated', keys.length, 'license keys.');
console.log('First 3 keys:');
keys.slice(0, 3).forEach((k) => console.log(' ', k));
