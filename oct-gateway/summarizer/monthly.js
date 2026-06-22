const memory = require('../memory/memory');
const { createLogger } = require('../logger');
const { callSummarizerWithRetry } = require('./client');
const config = require('../config');
const { getIsoWeek } = require('./weekly');

const logger = createLogger('monthly_summary');

const MONTHLY_SYSTEM_PROMPT = `你是 AMY 的"记忆整理师"。
现在你要把一个月（约 4-5 周）的周摘要浓缩成月度回顾。

【输出格式】严格 JSON：
{
  "month": "YYYY-MM",
  "weeks_covered": 0,
  "month_narrative": "这个月的主线故事（200字内）",
  "major_achievements": [
    { "title": "一句话成就", "detail": "50字内补充" }
  ],
  "project_status_changes": [
    { "project": "项目名", "from": "月初状态", "to": "月末状态" }
  ],
  "strategic_decisions": ["战略级决策"],
  "persistent_patterns": ["本月验证过的工作模式或偏好"],
  "carryovers": ["跨月延续的未解决事项"],
  "month_highlight": "本月最值得记住的一件事（200字内）"
}

【整理原则】
1. 只保留战略级内容，日常琐事不入月摘要
2. 项目进度用"月初/月末"对比呈现
3. 不重复周摘要细节，聚焦跨周主线`;

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

function getMonthStr(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function getWeeksOfMonth(monthStr) {
  const [yearStr, monthPart] = String(monthStr || '').split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthPart, 10) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return [];

  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const weeks = new Set();
  for (let t = first.getTime(); t <= last.getTime(); t += 86400000) {
    weeks.add(getIsoWeek(new Date(t)));
  }
  return Array.from(weeks);
}

async function readMonthWeeklies(monthStr) {
  const weeks = getWeeksOfMonth(monthStr);
  const summaries = [];
  for (const week of weeks) {
    const result = await memory.readMemory(`core://logs/summary/weekly/${week}`, { treat404AsDebug: true });
    if (!result.ok) continue;
    try {
      summaries.push(parseJsonObject(nodeContent(result)));
    } catch {}
  }
  return { weeks, summaries };
}

async function generateMonthlySummary(monthStr) {
  logger.info('[MonthlySummary] 开始生成', { month: monthStr });

  const { weeks, summaries } = await readMonthWeeklies(monthStr);
  if (summaries.length === 0) {
    logger.info('[MonthlySummary] 该月无周摘要，跳过', { month: monthStr });
    return { ok: true, skipped: true };
  }

  const inputText = [
    `# ${monthStr} 月周摘要集合`,
    `覆盖周摘要：${summaries.length}/${weeks.length}`,
    '',
    ...summaries.map((s) => `## ${s.week}\n${JSON.stringify(s, null, 2)}`),
  ].join('\n\n');

  let summary;
  try {
    const raw = await callSummarizerWithRetry([
      { role: 'system', content: MONTHLY_SYSTEM_PROMPT },
      { role: 'user', content: inputText.slice(0, 200000) },
    ], {
      maxTokens: config.memory.summarizer.maxTokens.monthly,
      temperature: 0.3,
    });
    summary = parseJsonObject(raw);
  } catch (err) {
    logger.error('[MonthlySummary] 生成失败', { month: monthStr, error: err.message });
    return { ok: false, error: err.message };
  }

  summary.month = monthStr;
  summary.weeks_covered = summaries.length;
  summary.week_range = weeks;
  summary._generated_at = new Date().toISOString();
  summary._generator = config.memory.summarizer.api.model;

  const uri = `core://logs/summary/monthly/${monthStr}`;
  await memory.writeMemory(uri, JSON.stringify(summary), 1, '月摘要（L0）');
  logger.info('[MonthlySummary] 已写入', { uri });
  return { ok: true, uri };
}

module.exports = {
  generateMonthlySummary,
  getMonthStr,
  getWeeksOfMonth,
  readMonthWeeklies,
};
