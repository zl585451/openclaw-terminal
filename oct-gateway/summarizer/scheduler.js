/**
 * 摘要自动调度器
 * 使用 setInterval 每分钟判断一次是否该生成。
 */
const { createLogger } = require('../logger');
const config = require('../config');
const { generateDailySummary, retryPendingDailies } = require('./daily');
const { generateWeeklySummary, getIsoWeek } = require('./weekly');
const { generateMonthlySummary } = require('./monthly');

const logger = createLogger('summary_scheduler');

let schedulerTimer = null;
let pendingRetryTimer = null;
let lastRun = { daily: '', weekly: '', monthly: '' };

function shouldRunDaily(now) {
  const { hour, minute } = config.memory.summarizer.schedule.daily;
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;
  const today = now.toISOString().slice(0, 10);
  return lastRun.daily !== today;
}

function shouldRunWeekly(now) {
  if (now.getDay() !== 1) return false;
  const { hour, minute } = config.memory.summarizer.schedule.weekly;
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;
  const thisWeek = getIsoWeek(now);
  return lastRun.weekly !== thisWeek;
}

function shouldRunMonthly(now) {
  if (now.getDate() !== 1) return false;
  const { hour, minute } = config.memory.summarizer.schedule.monthly;
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;
  const monthStr = now.toISOString().slice(0, 7);
  return lastRun.monthly !== monthStr;
}

async function tick(now = new Date()) {
  try {
    if (shouldRunDaily(now)) {
      const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      logger.info('[Scheduler] 触发日摘要', { date: yesterday });
      await generateDailySummary(yesterday);
      lastRun.daily = now.toISOString().slice(0, 10);
    }

    if (shouldRunWeekly(now)) {
      const lastWeek = getIsoWeek(new Date(now.getTime() - 7 * 86400000));
      logger.info('[Scheduler] 触发周摘要', { week: lastWeek });
      await generateWeeklySummary(lastWeek);
      lastRun.weekly = getIsoWeek(now);
    }

    if (shouldRunMonthly(now)) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);
      logger.info('[Scheduler] 触发月摘要', { month: lastMonth });
      await generateMonthlySummary(lastMonth);
      lastRun.monthly = now.toISOString().slice(0, 7);
    }

    if (now.getMinutes() === 0) {
      await retryPendingDailies();
    }
  } catch (err) {
    logger.error('[Scheduler] 调度异常', { error: err.message });
  }
}

function startScheduler() {
  if (!config.memory.summarizer.enabled) {
    logger.info('[Scheduler] 摘要系统已禁用，不启动调度');
    return;
  }
  if (schedulerTimer) return;
  logger.info('[Scheduler] 启动摘要调度器');
  schedulerTimer = setInterval(() => tick(), 60000);
  pendingRetryTimer = setTimeout(() => retryPendingDailies().catch(() => {}), 30000);
}

function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (pendingRetryTimer) {
    clearTimeout(pendingRetryTimer);
    pendingRetryTimer = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  tick,
  shouldRunDaily,
  shouldRunWeekly,
  shouldRunMonthly,
};
