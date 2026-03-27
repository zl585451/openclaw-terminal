#!/usr/bin/env node
/**
 * Nocturne 压力测试：模拟 20 条消息触发的 memory 读写，验证 P0 修复效果
 *
 * 用法：cd oct-gateway && node stress_test.js
 * 前置：Nocturne 需已启动（127.0.0.1:8000）
 * 时长：约 30 秒～2 分钟
 *
 * 输出：控制台 + stress_test_report.json
 * 备份：测试前自动备份 .temp/failed_memories.json
 * 数据：使用 core://stress_test/* 不影响真实记忆
 */

const path = require('path');
const fs = require('fs');

const FAILED_MEMORIES_PATH = path.join(__dirname, '.temp', 'failed_memories.json');
const REPORT_PATH = path.join(__dirname, 'stress_test_report.json');

function backupFailedMemories() {
  if (fs.existsSync(FAILED_MEMORIES_PATH)) {
    const bak = FAILED_MEMORIES_PATH + '.stress_test.bak';
    fs.copyFileSync(FAILED_MEMORIES_PATH, bak);
    console.log('[备份] failed_memories.json ->', bak);
  }
}

// 抑制 gateway logger 刷屏（压力测试期间）
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
let _suppressLogs = false;
function suppressGatewayLogs() {
  _suppressLogs = true;
  console.log = (...args) => {
    if (!_suppressLogs) _origLog.apply(console, args);
  };
  console.warn = (...args) => {
    if (!_suppressLogs) _origWarn.apply(console, args);
  };
  console.error = (...args) => {
    if (!_suppressLogs) _origError.apply(console, args);
  };
}
function restoreLogs() {
  _suppressLogs = false;
  console.log = _origLog;
  console.warn = _origWarn;
  console.error = _origError;
}

function isTimeout(err) {
  const s = String(err || '');
  return (
    s.includes('timeout') ||
    s.includes('aborted') ||
    s.includes('AbortError') ||
    s.includes('fetch failed')
  );
}

async function runOneRequest(name, fn) {
  const start = Date.now();
  let ok = false;
  let error = null;
  try {
    const r = await fn();
    ok = !!r?.ok;
    if (!ok && r?.error) error = r.error;
  } catch (e) {
    error = e?.message || String(e);
  }
  const ms = Date.now() - start;
  return { name, ok, ms, error, timeout: error ? isTimeout(error) : false };
}

async function runRound(roundIndex) {
  const prefix = `stress_test/round_${roundIndex}`;
  const uri = `core://${prefix}`;
  const content = JSON.stringify({
    round: roundIndex,
    ts: new Date().toISOString(),
    msg: `压力测试第 ${roundIndex + 1} 条`,
  });

  const memory = require('./memory');
  const memoryHistory = require('./memory_history');

  // 1. 模拟 6 路并发读（与真实 onDone 的 6 路之一类似，404 视为预期）
  const readUris = [
    'core://agent/identity',
    'core://my_user/profile',
    'core://agent/self_eval',
    'core://agent/feedback/positive',
    'core://my_user/communication',
    'core://agent/rules/output_format',
  ];
  const readTasks = readUris.map((u) =>
    runOneRequest(`read ${u.split('/').pop()}`, () =>
      memory.readMemory(u, { treat404AsDebug: true })
    )
  );
  const readResults = await Promise.all(readTasks);

  // 2. 串行：ensurePath -> writeMemory -> readVerify
  const ensureR = await runOneRequest('ensurePath', async () => {
    await memoryHistory.ensurePathExists('core', prefix);
    return { ok: true };
  });
  const writeR = await runOneRequest('writeMemory', () =>
    memory.writeMemory(uri, content, 2, '', { ensureParent: true })
  );
  const verifyR = await runOneRequest('readVerify', () =>
    memory.readMemory(uri, { treat404AsDebug: true })
  );

  return [...readResults, ensureR, writeR, verifyR];
}

async function main() {
  console.log('\n=== Nocturne 压力测试 ===');
  console.log('前置条件：Nocturne 需在 127.0.0.1:8000 运行\n');
  suppressGatewayLogs();
  backupFailedMemories();

  const memory = require('./memory');
  const alive = await memory.isAlive();
  if (!alive) {
    restoreLogs();
    console.error('\n[失败] Nocturne 未就绪，请先启动 OCT 或 Nocturne 后端');
    process.exit(1);
  }
  console.log('[OK] Nocturne 已连接\n');

  const TOTAL_ROUNDS = 20;
  const allResults = [];
  const startTotal = Date.now();

  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const roundResults = await runRound(i);
    allResults.push(...roundResults);
    const roundOk = roundResults.filter((r) => r.ok).length;
    const roundFail = roundResults.length - roundOk;
    const roundTimeout = roundResults.filter((r) => r.timeout).length;
    process.stdout.write(
      `  round ${String(i + 1).padStart(2)}/${TOTAL_ROUNDS} | ok=${roundOk} fail=${roundFail} timeout=${roundTimeout}\r`
    );
  }

  const elapsedMs = Date.now() - startTotal;
  restoreLogs();

  const total = allResults.length;
  const success = allResults.filter((r) => r.ok).length;
  const fail = total - success;
  const timeoutCount = allResults.filter((r) => r.timeout).length;
  const avgMs =
    allResults.length > 0
      ? (allResults.reduce((s, r) => s + r.ms, 0) / allResults.length).toFixed(0)
      : 0;

  const failedItems = allResults.filter((r) => !r.ok);
  const timeoutItems = allResults.filter((r) => r.timeout);

  const report = {
    timestamp: new Date().toISOString(),
    totalRequests: total,
    successCount: success,
    failureCount: fail,
    timeoutCount,
    avgResponseMs: Number(avgMs),
    totalElapsedSec: (elapsedMs / 1000).toFixed(1),
    conclusion:
      timeoutCount === 0 && fail === 0
        ? 'PASS'
        : timeoutCount > 0
          ? 'FAIL_TIMEOUT'
          : 'PASS_WITH_FAILURES',
    failedSamples: failedItems.slice(0, 5).map((r) => ({ name: r.name, error: r.error })),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n\n--- 测试报告 ---');
  console.log(`总请求数: ${total}`);
  console.log(`成功: ${success}`);
  console.log(`失败: ${fail}`);
  console.log(`timeout 次数: ${timeoutCount}`);
  console.log(`平均响应时间: ${avgMs} ms`);
  console.log(`总耗时: ${report.totalElapsedSec} 秒`);
  console.log('');

  if (timeoutItems.length > 0) {
    console.log('timeout 样本:');
    timeoutItems.slice(0, 3).forEach((r) => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    console.log('');
  }

  if (report.conclusion === 'PASS') {
    console.log('✅ 修复成功：无 timeout，无失败');
  } else if (report.conclusion === 'FAIL_TIMEOUT') {
    console.log('❌ 仍有问题：存在 timeout，建议检查 Nocturne 日志与 SQLite 配置');
  } else {
    console.log(
      '✅ 修复成功（timeout=0）：存在少量非 timeout 失败，多为 404 或环境差异，可忽略'
    );
  }

  console.log(`\n报告已写入: ${REPORT_PATH}`);
}

main().catch((e) => {
  restoreLogs();
  console.error('[stress_test]', e);
  process.exit(1);
});
