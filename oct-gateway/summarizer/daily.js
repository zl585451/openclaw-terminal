/**
 * L2 日摘要生成器
 * 输入：某一天的所有 core://logs/raw/YYYY-MM-DD/* 原始日志
 * 输出：core://logs/summary/daily/YYYY-MM-DD
 */
const memory = require('../memory');
const { createLogger } = require('../logger');
const { callSummarizerWithRetry } = require('./client');
const config = require('../config');

const logger = createLogger('daily_summary');

const DAILY_SYSTEM_PROMPT = `你是 AMY（少爷的 AI 助手）的"记忆整理师"。
你的任务是阅读少爷和 AMY 一整天的完整对话，整理成一份结构化的日摘要。

【输出格式】严格按以下 JSON 结构输出（仅输出 JSON，不要 markdown 代码块）：
{
  "date": "YYYY-MM-DD",
  "turn_count": 0,
  "duration": {
    "first_ts": "首条消息时间 ISO",
    "last_ts": "末条消息时间 ISO"
  },
  "topics": [
    {
      "title": "话题标题（10字内）",
      "summary": "话题摘要（50-150字）",
      "turn_range": [1, 2],
      "importance": "high|medium|low"
    }
  ],
  "decisions": ["明确做出的决定（一条一句话）"],
  "completed": ["完成的具体任务（一条一句话）"],
  "open_questions": ["未解决的问题、悬念、待办"],
  "key_facts": ["重要事实、偏好、配置（值得长期记忆的）"],
  "emotional_context": "少爷今天的整体状态和情绪（50字内）",
  "highlights": "这一天最值得记住的一件事（100字内）"
}

【整理原则】
1. 忠实于原文，不编造
2. 优先记录"决定"和"完成"
3. 同一主题合并为一个 topic
4. 如果当天对话少于 3 轮，topics 可以只有 1 条或 0 条
5. emotional_context 如果无从判断就写 "未明显表露"`;

function nodeContent(result) {
  return result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
}

function nodeChildren(result) {
  return result?.data?.node?.children || result?.data?.children || result?.node?.children || result?.children || [];
}

function uriFromChild(child) {
  if (child?.uri) return child.uri;
  if (child?.path) return `core://${child.path}`;
  return '';
}

function parseJsonObject(raw) {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

async function readDayRawLogs(dateStr) {
  const result = await memory.readMemory(`core://logs/raw/${dateStr}`, { treat404AsDebug: true });
  const children = nodeChildren(result);
  if (!result.ok || children.length === 0) return [];

  const turns = [];
  for (const child of children) {
    const uri = uriFromChild(child);
    if (!uri) continue;
    const nodeResult = await memory.readMemory(uri, { treat404AsDebug: true });
    if (!nodeResult.ok) continue;
    try {
      turns.push(JSON.parse(nodeContent(nodeResult) || '{}'));
    } catch (e) {
      logger.warn('[DailySummary] 解析原始日志失败', { uri, error: e.message });
    }
  }

  turns.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));
  return turns;
}

function buildDailyInput(dateStr, turns) {
  const lines = [
    `# ${dateStr} 完整对话记录`,
    `总轮数：${turns.length}`,
    '',
  ];
  turns.forEach((turn, idx) => {
    lines.push(`## 第 ${idx + 1} 轮（${turn.ts || ''}）`);
    lines.push(`少爷：${turn.user || '(无)'}`);
    lines.push('');
    lines.push(`AMY：${turn.assistant || '(无)'}`);
    if (turn.tools?.length) lines.push(`使用工具：${turn.tools.join(', ')}`);
    if (turn.attachments?.length) lines.push(`附件：${turn.attachments.join(', ')}`);
    lines.push('');
  });
  return lines.join('\n');
}

async function markPending(dateStr, reason) {
  const uri = `core://logs/summary/_pending/daily/${dateStr}`;
  try {
    await memory.writeMemory(uri, JSON.stringify({
      date: dateStr,
      level: 'daily',
      reason,
      marked_at: new Date().toISOString(),
    }), 2, '摘要生成失败，待重试');
  } catch {}
}

async function clearPending(dateStr) {
  const uri = `core://logs/summary/_pending/daily/${dateStr}`;
  try {
    await memory.writeMemory(uri, '[CLEARED]', 2, '已重试成功');
  } catch {}
}

async function generateDailySummary(dateStr) {
  logger.info('[DailySummary] 开始生成', { date: dateStr });

  const turns = await readDayRawLogs(dateStr);
  if (turns.length === 0) {
    logger.info('[DailySummary] 当日无对话，跳过', { date: dateStr });
    return { ok: true, skipped: true };
  }

  const inputText = buildDailyInput(dateStr, turns);
  if (inputText.length > 200000) {
    logger.warn('[DailySummary] 输入过长，裁剪到 200K 字符', { originalLen: inputText.length });
  }

  let summaryJson;
  try {
    const raw = await callSummarizerWithRetry([
      { role: 'system', content: DAILY_SYSTEM_PROMPT },
      { role: 'user', content: inputText.slice(0, 200000) },
    ], {
      maxTokens: config.memory.summarizer.maxTokens.daily,
      temperature: 0.3,
    });
    summaryJson = parseJsonObject(raw);
  } catch (err) {
    logger.error('[DailySummary] 生成失败', { date: dateStr, error: err.message });
    await markPending(dateStr, err.message);
    return { ok: false, error: err.message };
  }

  summaryJson.date = dateStr;
  summaryJson.turn_count = turns.length;
  summaryJson.duration = summaryJson.duration || {};
  summaryJson.duration.first_ts = summaryJson.duration.first_ts || turns[0]?.ts || '';
  summaryJson.duration.last_ts = summaryJson.duration.last_ts || turns[turns.length - 1]?.ts || '';
  summaryJson._generated_at = new Date().toISOString();
  summaryJson._generator = config.memory.summarizer.api.model;

  const uri = `core://logs/summary/daily/${dateStr}`;
  try {
    await memory.writeMemory(uri, JSON.stringify(summaryJson), 1, '日摘要（L2）');
    logger.info('[DailySummary] 已写入', { uri, topics: summaryJson.topics?.length || 0 });
    await clearPending(dateStr);
    return { ok: true, uri };
  } catch (err) {
    logger.error('[DailySummary] 写入失败', { uri, error: err.message });
    return { ok: false, error: err.message };
  }
}

async function retryPendingDailies() {
  const result = await memory.readMemory('core://logs/summary/_pending/daily', { treat404AsDebug: true });
  const children = nodeChildren(result);
  if (!result.ok || children.length === 0) return { ok: true, retried: 0 };

  let retried = 0;
  for (const child of children) {
    const uri = uriFromChild(child);
    if (!uri) continue;
    const nodeResult = await memory.readMemory(uri, { treat404AsDebug: true });
    const content = nodeContent(nodeResult);
    if (!nodeResult.ok || content === '[CLEARED]') continue;
    const dateStr = uri.split('/').pop();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) continue;
    const r = await generateDailySummary(dateStr);
    if (r.ok) retried += 1;
  }
  return { ok: true, retried };
}

module.exports = {
  generateDailySummary,
  readDayRawLogs,
  retryPendingDailies,
};
