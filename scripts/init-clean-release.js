#!/usr/bin/env node
/**
 * 非交互式：从模板生成干净发布版配置（用户/AI）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'docs', '01_system_prompts', 'templates');
const PROMPTS_DIR = path.join(ROOT, 'docs', '01_system_prompts');

const replacements = {
  '{{USER_NAME}}': '用户',
  '{{AI_NAME}}': 'AI',
  '{{TIMEZONE}}': '上海 +8',
  '{{MBTI}}': '（可选）',
  '{{PROJECT_PATH}}': process.cwd(),
  '{{WORK_TIME}}': '工作日',
  '{{WORK_STYLE}}': '简洁直接',
  '{{TECH_STACK}}': '按需填写',
};

function replaceAll(content, map) {
  let r = content;
  for (const [k, v] of Object.entries(map)) {
    r = r.split(k).join(v);
  }
  return r;
}

const files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.template.md'));
for (const file of files) {
  const content = replaceAll(
    fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf-8'),
    replacements
  );
  const outName = file.replace('.template', '');
  fs.writeFileSync(path.join(PROMPTS_DIR, outName), content, 'utf-8');
  console.log('✅', outName);
}
console.log('\n🎉 干净发布版配置已生成');
