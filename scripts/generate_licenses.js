const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I, O, 1, 0

function generateCode() {
  let code = 'OCT-';
  for (let i = 0; i < 3; i++) {
    if (i > 0) code += '-';
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return code;
}

function generateHash(code) {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// 生成 100 个授权码
const codes = [];
const hashes = [];
for (let i = 0; i < 100; i++) {
  let code = generateCode();
  let hash = generateHash(code);
  codes.push({ code, hash });
}

// 输出授权码列表（给少爷分发用）
console.log('===== 新授权码列表（100 个）=====');
codes.forEach((item, i) => console.log((i+1).toString().padStart(3) + '. ' + item.code));

// 输出哈希数组（替换 main.ts 用）
console.log('\n\n===== VALID_LICENSE_HASHES 数组（复制到 main.ts）=====');
console.log('const VALID_LICENSE_HASHES: string[] = [');
console.log(hashes.map(h => "  '" + h + "'").join(',\n'));
console.log('];');

// 保存授权码列表到文件
const outputPath = path.join(__dirname, 'new_licenses.txt');
const content = codes.map((item, i) => `${(i+1).toString().padStart(3)}. ${item.code}`).join('\n');
fs.writeFileSync(outputPath, content, 'utf-8');
console.log('\n\n✅ 授权码列表已保存到:', outputPath);

// 同时保存 JSON 格式
const jsonPath = path.join(__dirname, 'new_licenses.json');
fs.writeFileSync(jsonPath, JSON.stringify(codes, null, 2), 'utf-8');
console.log('✅ JSON 格式已保存到:', jsonPath);
