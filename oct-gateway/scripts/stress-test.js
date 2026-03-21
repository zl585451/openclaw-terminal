#!/usr/bin/env node
/**
 * Nocturne 压力测试：并发调用记忆 API，验证重试与限流机制
 *
 * 用法：cd oct-gateway && node scripts/stress-test.js
 * 前置：Nocturne 需已启动（默认 127.0.0.1:8000）
 * 配置：NOCTURNE_BASE_URL=http://localhost:8000（可覆盖）
 *
 * 三轮：5 / 10 / 20 并发，每轮间隔 3 秒
 * 404 视为成功（节点不存在正常），timeout/500 才算失败
 */

const NOCTURNE_BASE = process.env.NOCTURNE_BASE_URL || 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = 5000;
const ROUND_DELAY_MS = 3000;
const CONCURRENCIES = [5, 10, 20];

function parseUri(uri) {
  const m = uri.match(/^([^:]+):\/\/(.+)$/);
  return m ? { domain: m[1], path: m[2] } : null;
}

async function readNode(uri) {
  const parts = parseUri(uri);
  if (!parts) throw new Error(`无效 URI: ${uri}`);
  const url = `${NOCTURNE_BASE}/browse/node?path=${encodeURIComponent(parts.path)}&domain=${encodeURIComponent(parts.domain)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const is404 = res.status === 404;
    const is500 = res.status >= 500;
    const isTimeout = false;
    const body = res.ok ? await res.json().catch(() => null) : null;
    return {
      ok: res.ok || is404,
      status: res.status,
      is404,
      is500,
      isTimeout,
      data: body,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    const errMsg = String(e?.message || e);
    const isTimeout = errMsg.includes('abort') || errMsg.includes('timeout') || errMsg.includes('AbortError');
    return {
      ok: false,
      status: null,
      is404: false,
      is500: false,
      isTimeout,
      data: null,
      error: errMsg,
    };
  }
}

async function writeNode(uri, content, priority = 2, disclosure = '') {
  const parts = parseUri(uri);
  if (!parts) throw new Error(`无效 URI: ${uri}`);
  const url = `${NOCTURNE_BASE}/browse/node?path=${encodeURIComponent(parts.path)}&domain=${encodeURIComponent(parts.domain)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(content), priority, disclosure }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const is500 = res.status >= 500;
    const body = res.ok ? await res.json().catch(() => null) : null;
    return {
      ok: res.ok || res.status === 422,
      status: res.status,
      is404: res.status === 404,
      is500,
      isTimeout: false,
      data: body,
      error: res.ok || res.status === 422 ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    const errMsg = String(e?.message || e);
    const isTimeout = errMsg.includes('abort') || errMsg.includes('timeout') || errMsg.includes('AbortError');
    return {
      ok: false,
      status: null,
      is404: false,
      is500: false,
      isTimeout,
      data: null,
      error: errMsg,
    };
  }
}

async function runOneRead(uri) {
  const start = Date.now();
  const r = await readNode(uri);
  const ms = Date.now() - start;
  const failed = !r.ok && !r.is404;
  return {
    uri,
    ok: r.ok || r.is404,
    failed,
    timeout: r.isTimeout,
    error500: r.is500,
    ms,
    status: r.status,
    error: r.error,
  };
}

async function runRound(concurrency, roundIndex) {
  const uris = [];
  for (let i = 1; i <= Math.min(concurrency, 20); i++) {
    uris.push(`core://test/node_${((roundIndex * 20 + i - 1) % 20) + 1}`);
  }
  const tasks = uris.map((u) => runOneRead(u));
  const results = await Promise.all(tasks);
  return results;
}

function isFailure(r) {
  return r.timeout || r.error500;
}

function printTable(rows) {
  const colWidths = rows[0].map((_, i) =>
    Math.max(
      ...rows.map((row) => String(row[i] ?? '').length),
      ['并发', '总数', '成功', '失败', '超时', '500', '平均(ms)', '最快', '最慢'][i]?.length ?? 8
    )
  );
  const header = ['并发', '总数', '成功', '失败', '超时', '500', '平均(ms)', '最快', '最慢'];
  const sep = colWidths.map((w) => '-'.repeat(Math.min(w, 12))).join('  ');
  const pad = (s, i) => String(s).padEnd(colWidths[i]);
  console.log(header.map((h, i) => pad(h, i)).join('  '));
  console.log(sep);
  for (let i = 1; i < rows.length; i++) {
    console.log(rows[i].map((c, j) => pad(c, j)).join('  '));
  }
}

async function main() {
  console.log('\n=== Nocturne 压力测试 ===');
  console.log(`Base: ${NOCTURNE_BASE} | 超时: ${REQUEST_TIMEOUT_MS}ms | 轮间间隔: ${ROUND_DELAY_MS}ms\n`);

  const healthUrl = `${NOCTURNE_BASE}/health`;
  try {
    const hr = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (!hr.ok) throw new Error(`health ${hr.status}`);
  } catch (e) {
    console.error('[失败] Nocturne 未就绪，请先启动 Nocturne (默认 :8000)');
    console.error('  ', e?.message || e);
    process.exit(1);
  }
  console.log('[OK] Nocturne 已连接\n');

  const allRounds = [];
  for (let ri = 0; ri < CONCURRENCIES.length; ri++) {
    const concurrency = CONCURRENCIES[ri];
    console.log(`--- 第 ${ri + 1}/3 轮：并发 ${concurrency} ---`);
    const results = await runRound(concurrency, ri);
    const total = results.length;
    const failures = results.filter(isFailure);
    const failCount = failures.length;
    const success = total - failCount;
    const timeoutCount = results.filter((r) => r.timeout).length;
    const err500Count = results.filter((r) => r.error500).length;
    const times = results.map((r) => r.ms).filter((t) => t >= 0);
    const avgMs = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0) : '-';
    const minMs = times.length ? Math.min(...times) : '-';
    const maxMs = times.length ? Math.max(...times) : '-';

    allRounds.push({
      concurrency,
      total,
      success,
      failCount,
      timeoutCount,
      err500Count,
      avgMs,
      minMs,
      maxMs,
      results,
    });

    console.log(`  成功: ${success}/${total} | 失败: ${failCount} (超时:${timeoutCount} 500:${err500Count})`);
    console.log(`  耗时: 平均 ${avgMs}ms | 最快 ${minMs}ms | 最慢 ${maxMs}ms\n`);

    if (ri < CONCURRENCIES.length - 1) {
      console.log(`  等待 ${ROUND_DELAY_MS / 1000} 秒...`);
      await new Promise((r) => setTimeout(r, ROUND_DELAY_MS));
    }
  }

  console.log('\n========== 结果汇总 ==========\n');
  const tableRows = [['并发', '总数', '成功', '失败', '超时', '500', '平均(ms)', '最快', '最慢']];
  for (const r of allRounds) {
    tableRows.push([
      r.concurrency,
      r.total,
      r.success,
      r.failCount,
      r.timeoutCount,
      r.err500Count,
      r.avgMs,
      r.minMs,
      r.maxMs,
    ]);
  }
  printTable(tableRows);

  const totalFail = allRounds.reduce((s, r) => s + r.failCount, 0);
  const totalTimeout = allRounds.reduce((s, r) => s + r.timeoutCount, 0);
  console.log('\n');
  if (totalFail === 0) {
    console.log('✅ 全部通过：无 timeout，无 500 错误');
  } else if (totalTimeout > 0) {
    console.log(`❌ 存在 ${totalTimeout} 次超时，建议检查 Nocturne 日志与重试配置`);
  } else {
    console.log(`⚠️ 存在 ${totalFail} 次 500 错误`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('[stress-test]', e);
  process.exit(1);
});
