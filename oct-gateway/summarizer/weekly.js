const memory = require('../memory/memory');
const { createLogger } = require('../logger');
const { callSummarizerWithRetry } = require('./client');
const config = require('../config');

const logger = createLogger('weekly_summary');

const WEEKLY_SYSTEM_PROMPT = `你是 AMY 的"记忆整理师"。
现在你要把一周的日摘要整理成周回顾。

【输出格式】严格 JSON：
{
  "week": "YYYY-Www",
  "week_theme": "本周主线（50字内）",
  "major_projects": [
    { "name": "项目名", "progress": "进展摘要", "status": "active|done|blocked|paused" }
  ],
  "key_decisions": [
    { "date": "YYYY-MM-DD", "decision": "关键决策" }
  ],
  "completed_milestones": ["完成的里程碑"],
  "unresolved": ["未解决问题"],
  "key_facts": ["值得长期记忆的事实"],
  "next_week_focus": ["下周可能继续关注的事"],
  "week_highlight": "本周最值得记住的一件事"
}

【整理原则】
1. 只基于输入，不编造
2. 合并跨天重复话题
3. 优先记录项目进展、关键决策和未完成事项`;

function nodeContent(result) {
  return result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
}

function parseJsonObject(raw) {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getDatesOfWeek(weekStr) {
  const [yearStr, wStr] = String(weekStr || '').split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  if (!year || !week) return [];

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(week1Monday);
    d.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function readWeekDailies(weekStr) {
  const dates = getDatesOfWeek(weekStr);
  const summaries = [];
  for (const date of dates) {
    const result = await memory.readMemory(`core://logs/summary/daily/${date}`, { treat404AsDebug: true });
    if (!result.ok) continue;
    try {
      summaries.push(parseJsonObject(nodeContent(result)));
    } catch {}
  }
  return { dates, summaries };
}

async function generateWeeklySummary(weekStr) {
  logger.info('[WeeklySummary] 开始生成', { week: weekStr });

  const { dates, summaries } = await readWeekDailies(weekStr);
  if (summaries.length === 0) {
    logger.info('[WeeklySummary] 该周无日摘要，跳过', { week: weekStr });
    return { ok: true, skipped: true };
  }

  const inputText = [
    `# ${weekStr} 本周日摘要集合`,
    `活跃天数：${summaries.length}/7`,
    '',
    ...summaries.map((s) => `## ${s.date}\n${JSON.stringify(s, null, 2)}`),
  ].join('\n\n');

  let summary;
  try {
    const raw = await callSummarizerWithRetry([
      { role: 'system', content: WEEKLY_SYSTEM_PROMPT },
      { role: 'user', content: inputText.slice(0, 200000) },
    ], {
      maxTokens: config.memory.summarizer.maxTokens.weekly,
      temperature: 0.3,
    });
    summary = parseJsonObject(raw);
  } catch (err) {
    logger.error('[WeeklySummary] 生成失败', { week: weekStr, error: err.message });
    return { ok: false, error: err.message };
  }

  summary.week = weekStr;
  summary.active_days = summaries.length;
  summary.date_range = { start: dates[0], end: dates[6] };
  summary._generated_at = new Date().toISOString();
  summary._generator = config.memory.summarizer.api.model;

  const uri = `core://logs/summary/weekly/${weekStr}`;
  await memory.writeMemory(uri, JSON.stringify(summary), 1, '周摘要（L1）');
  logger.info('[WeeklySummary] 已写入', { uri });
  return { ok: true, uri };
}

module.exports = {
  generateWeeklySummary,
  getIsoWeek,
  getDatesOfWeek,
  readWeekDailies,
};
