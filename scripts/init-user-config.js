#!/usr/bin/env node
/**
 * OCT Terminal 用户配置初始化向导
 *
 * 从 templates/ 生成个性化配置，替换 "少爷" 和 "AMY" 等占位符。
 * 可重复运行，覆盖前会确认。
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'docs', '01_system_prompts', 'templates');
const PROMPTS_DIR = path.join(ROOT, 'docs', '01_system_prompts');
const GATEWAY_DIR = path.join(ROOT, 'oct-gateway');

const GATEWAY_FILES = [
  'ai.js',
  'index.js',
  'memory_feedback.js',
  'self_eval.js',
  'clarification_memory.js',
  'tools.js',
  'image_analyzer.js',
  'hypothesis.js',
  'mobile.html',
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultVal) {
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultVal}]: `, (answer) => {
      const v = (answer || '').trim();
      resolve(v || defaultVal);
    });
  });
}

function askConfirm(question, defaultYes = true) {
  return new Promise((resolve) => {
    const hint = defaultYes ? 'Y/n' : 'y/N';
    rl.question(`${question} [${hint}]: `, (answer) => {
      const a = (answer || '').trim().toLowerCase();
      if (a === '') resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes' || a === '是');
    });
  });
}

function replaceAll(content, replacements) {
  let result = content;
  for (const [from, to] of Object.entries(replacements)) {
    result = result.split(from).join(to);
  }
  return result;
}

async function main() {
  console.log('\n🦞 OCT Terminal 初始化向导\n');
  console.log('将为你的 AI 助手生成个性化配置，替换模板中的占位符。\n');

  const userName = await ask('你希望 AI 怎么称呼你？', '用户');
  const aiName = await ask('给你的 AI 助手起个名字？', 'AI');
  const timezone = await ask('你的时区？', '上海 +8');
  const projectPath = await ask('默认项目路径？（例：E:\\projects\\my-app）', process.cwd());
  const mbti = await ask('MBTI 类型？（可选，直接回车跳过）', '');
  const workTime = await ask('常用工作时间？（例：9:00-18:00）', '工作日');
  const workStyle = await ask('工作模式？（例：简洁直接）', '简洁直接');
  const techStack = await ask('常用技术栈？（例：React, Node.js）', '按需填写');

  const replacements = {
    '{{USER_NAME}}': userName,
    '{{AI_NAME}}': aiName,
    '{{TIMEZONE}}': timezone,
    '{{PROJECT_PATH}}': projectPath,
    '{{MBTI}}': mbti || '（可选）',
    '{{WORK_TIME}}': workTime,
    '{{WORK_STYLE}}': workStyle,
    '{{TECH_STACK}}': techStack,
  };

  // 检查是否已有生成的 prompt 文件
  const existingFiles = ['SOUL.md', 'AGENTS.md', 'USER.md', 'OCT_PROTOCOL.md', 'CLARIFICATION_PROTOCOL.md']
    .filter((f) => fs.existsSync(path.join(PROMPTS_DIR, f)));

  if (existingFiles.length > 0) {
    const overwrite = await askConfirm(
      `检测到已有配置文件 (${existingFiles.join(', ')})，是否覆盖？`,
      false
    );
    if (!overwrite) {
      console.log('\n已取消，未做任何修改。');
      rl.close();
      return;
    }
  }

  // 1. 从模板生成 prompt 文件
  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error('❌ 模板目录不存在:', TEMPLATE_DIR);
    rl.close();
    process.exit(1);
  }

  const templateFiles = fs.readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.template.md'));

  for (const file of templateFiles) {
    const templatePath = path.join(TEMPLATE_DIR, file);
    let content = fs.readFileSync(templatePath, 'utf-8');
    content = replaceAll(content, replacements);
    const outputName = file.replace('.template', '');
    const outputPath = path.join(PROMPTS_DIR, outputName);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`✅ ${outputName}`);
  }

  // 2. 更新 oct-gateway 中的硬编码（支持干净版 用户/AI 及旧版 少爷/AMY）
  const gatewayReplacements = [
    [/少爷/g, userName],
    [/用户/g, userName],
    [/AMY（🐰）/g, aiName],
    [/AMY/g, aiName],
    [/AI/g, aiName],
  ];

  for (const fileName of GATEWAY_FILES) {
    const filePath = path.join(GATEWAY_DIR, fileName);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    for (const [pattern, replacement] of gatewayReplacements) {
      content = content.replace(pattern, replacement);
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ oct-gateway/${fileName}`);
  }

  console.log('\n🎉 初始化完成！');
  console.log('   - 提示词已写入 docs/01_system_prompts/');
  console.log('   - Gateway 代码中的称呼已更新');
  console.log('   - 重启 OCT 或 Gateway 即可使用新配置\n');
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
