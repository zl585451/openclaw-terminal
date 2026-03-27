/**
 * OpenClaw Skills 兼容适配器
 * 解析 SKILL.md，将技能描述注入系统提示词（而非注册为工具）
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, 'skills');

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const yaml = match[1];
  const body = match[2];

  // 简单解析 YAML（只取 name 和 description）
  const name = (yaml.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const description = (yaml.match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  const userInvocable = !(yaml.includes('user-invocable: false'));

  // 检查依赖的 bins（需要的外部命令）
  const binsMatch = yaml.match(/"bins":\s*\[([^\]]+)\]/);
  const requiredBins = binsMatch
    ? binsMatch[1].split(',').map(b => b.replace(/['"]/g, '').trim())
    : [];

  return { name, description, body, userInvocable, requiredBins };
}

/**
 * 检查所需的外部命令是否存在
 */
function checkBinExists(bin) {
  try {
    require('child_process').execSync(
      process.platform === 'win32' ? `where ${bin}` : `which ${bin}`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 扫描 skills/ 目录，返回可用技能列表
 */
function loadSkills() {
  const skills = [];

  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    return skills;
  }

  const entries = fs.readdirSync(SKILLS_DIR);

  for (const entry of entries) {
    const entryPath = path.join(SKILLS_DIR, entry);

    let skillMdPath;
    if (fs.statSync(entryPath).isDirectory()) {
      skillMdPath = path.join(entryPath, 'SKILL.md');
    } else if (entry === 'SKILL.md') {
      skillMdPath = entryPath;
    } else {
      continue;
    }

    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed?.name || !parsed?.description) continue;

      // 检查依赖的命令是否存在
      const missingBins = parsed.requiredBins.filter(b => !checkBinExists(b));
      if (missingBins.length > 0) {
        console.warn(`[SkillLoader] 跳过技能 ${parsed.name}：缺少依赖 ${missingBins.join(', ')}`);
        continue;
      }

      skills.push({
        name: parsed.name,
        description: parsed.description,
        body: parsed.body,
        userInvocable: parsed.userInvocable,
        path: skillMdPath,
        dirName: entry
      });

      console.log(`[SkillLoader] 已加载技能: ${parsed.name}`);
    } catch (e) {
      console.error(`[SkillLoader] 加载 ${entry} 失败:`, e.message);
    }
  }

  if (skills.length > 0) {
    console.log(`[SkillLoader] 共加载 ${skills.length} 个 OpenClaw 兼容技能`);
  }

  return skills;
}

/**
 * 生成注入到系统提示词的技能列表文本
 * 格式参考 OpenClaw 官方的 formatSkillsForPrompt
 */
function formatSkillsForPrompt(skills) {
  if (skills.length === 0) return '';

  const lines = skills.map(s =>
    `<skill>\n  <n>${s.name}</n>\n  <description>${s.description}</description>\n  <location>${s.path}</location>\n</skill>`
  );

  return `\n\n---\n## 📦 已安装的 OpenClaw 兼容技能\n\n` +
    `以下技能已就绪，当用户请求相关任务时自动调用：\n\n` +
    `<skills>\n${lines.join('\n')}\n</skills>\n\n` +
    `调用技能时，读取对应 SKILL.md 的指令并按步骤执行。`;
}

/**
 * 获取某个技能的完整指令体（触发后按需加载）
 */
function getSkillBody(skillName) {
  const skills = loadSkills();
  const skill = skills.find(s => s.name === skillName);
  return skill ? skill.body : null;
}

module.exports = { loadSkills, formatSkillsForPrompt, getSkillBody };
