// 这个脚本用于更新 main.ts 中的 VALID_LICENSE_HASHES
// 读取 new_licenses.json 并生成新的 main.ts 文件

const fs = require('fs');
const path = require('path');

// 读取新生成的授权码哈希
const licensesPath = path.join(__dirname, 'new_licenses.json');
const licenses = JSON.parse(fs.readFileSync(licensesPath, 'utf-8'));

// 生成哈希数组字符串
const hashesArray = licenses.map((item: any) => `  '${item.hash}'`).join(',\n');
const newConstant = `const VALID_LICENSE_HASHES: string[] = [\n${hashesArray}\n];`;

// 读取 main.ts
const mainPath = path.join(__dirname, '..', 'electron', 'main.ts');
let mainContent = fs.readFileSync(mainPath, 'utf-8');

// 用正则替换 VALID_LICENSE_HASHES 数组
const regex = /const VALID_LICENSE_HASHES: string\[\] = \[[\s\S]*?\];/;
const newMainContent = mainContent.replace(regex, newConstant);

// 写回 main.ts
fs.writeFileSync(mainPath, newMainContent, 'utf-8');

console.log('✅ 已更新 electron/main.ts 中的 VALID_LICENSE_HASHES');
console.log(`✅ 共 ${licenses.length} 个授权码`);
console.log('\n前 10 个授权码：');
licenses.slice(0, 10).forEach((item: any, i: number) => {
  console.log(`  ${i + 1}. ${item.code}`);
});
