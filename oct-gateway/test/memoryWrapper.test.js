'use strict';

// 自运行表征测试：node test/memoryWrapper.test.js
// 锁定 memory.js（被引用最多的记忆模块）对 memory_v2_store 的路由委托语义。
// 隔离：加载前把 config.memory.root 指向临时目录，绝不触碰真实记忆库。

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../config');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'oct-memw-test-'));
const ORIGINAL_ROOT = config.memory ? config.memory.root : undefined;
if (!config.memory) config.memory = {};
config.memory.root = TMP_ROOT;

const store = require('../memory/memory_v2_store');
assert.strictEqual(store.getMemoryRoot(), TMP_ROOT, '隔离失败：未指向临时目录，已中止');
const memory = require('../memory/memory');

function cleanup() {
  if (config.memory) config.memory.root = ORIGINAL_ROOT;
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
}

(async () => {
  // ── note 分支：writeMemory → readMemory 往返 ─────────────────
  {
    const uri = 'core://identity/owner';
    const w = await memory.writeMemory(uri, '使用者偏好：要具体不要框架。', 3, 'public');
    assert.ok(w.ok, 'writeMemory(note) 成功委托');
    const r = await memory.readMemory(uri);
    assert.ok(r.ok && r.data.node.content.includes('具体'), 'readMemory(note) 取回正文');
  }

  // ── summary 分支：JSON 字符串内容被解析后存为结构化摘要 ──────
  {
    const uri = 'core://logs/summary/monthly/2026-06';
    const w = await memory.writeMemory(uri, JSON.stringify({ month_narrative: '完成记忆子系统补测试' }));
    assert.ok(w.ok, 'writeMemory(summary) 成功');
    const back = store.readSummary('monthly', '2026-06');
    assert.ok(back && back.month_narrative.includes('补测试'), 'summary 分支解析 JSON 并落库');
  }

  // ── 缺失 + 无效 URI ─────────────────────────────────────────
  {
    const miss = await memory.readMemory('core://nope/missing', { treat404AsDebug: true });
    assert.ok(!miss.ok, '缺失节点返回失败');
    const bad = await memory.writeMemory('not-a-uri', 'x');
    assert.ok(!bad.ok, '无效 URI 写入被拒');
  }

  console.log('PASS memory.js wrapper routing is covered');
})().then(cleanup, (err) => { cleanup(); throw err; });
