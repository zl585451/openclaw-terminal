'use strict';

// 自运行表征测试（与 slashHandlerRegression.test.js 同风格）：
//   node test/memoryV2Store.test.js
//
// 目的：为 memory_v2_store（文件型记忆后端）锁定读写语义，作为 memory
// 子系统重构/搬迁的安全网。此前该核心模块零测试覆盖。
//
// 隔离：在加载 store 前把 config.memory.root 指向一次性临时目录，
// 绝不触碰用户真实记忆库 (~/.openclaw/memory)。

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── 关键：先抢占 config.memory.root，再使用 store ──────────────
const config = require('../config');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'oct-mem-test-'));
const ORIGINAL_ROOT = config.memory ? config.memory.root : undefined;
if (!config.memory) config.memory = {};
config.memory.root = TMP_ROOT;

const store = require('../memory/memory_v2_store');

// 双保险：确认 store 真的写到临时目录而非真实库
assert.strictEqual(store.getMemoryRoot(), TMP_ROOT, '隔离失败：store 未指向临时目录，已中止以保护真实记忆库');

function cleanup() {
  if (config.memory) config.memory.root = ORIGINAL_ROOT;
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
}

try {
  // ── note 读写往返 ────────────────────────────────────────────
  {
    const uri = 'core://identity/profile';
    const w = store.writeNote(uri, '我是 Zilong，项目使用者。', 3, 'public');
    assert.ok(w.ok, 'writeNote 成功');

    const note = store.readNote(uri);
    assert.ok(note && note.content.includes('Zilong'), 'readNote 取回正文（frontmatter 已剥离）');

    const r = store.readMemory(uri);
    assert.ok(r.ok && r.data.node.content.includes('Zilong'), 'readMemory 经 note 通道返回正文');
  }

  // ── 缺失节点返回 404 ─────────────────────────────────────────
  {
    const r = store.readMemory('core://does/not/exist');
    assert.ok(!r.ok && /404/.test(r.error || ''), '缺失 note 返回 404');
  }

  // ── 无效 URI ─────────────────────────────────────────────────
  {
    const r = store.readMemory('not-a-uri');
    assert.ok(!r.ok, '无效 URI 返回失败');
  }

  // ── searchMemory 子串命中 note ───────────────────────────────
  {
    store.writeNote('core://notes/radio-drama', '广播剧改编工作台的设计决策。', 2, '');
    const res = store.searchMemory('广播剧', 'core', { limit: 10 });
    assert.ok(res.ok && res.data.some((m) => m.uri === 'core://notes/radio-drama'), 'searchMemory 命中包含关键词的 note');

    const miss = store.searchMemory('完全不存在的词xyz123', 'core', { limit: 10 });
    assert.ok(miss.ok && miss.data.length === 0, 'searchMemory 无命中返回空集');
  }

  // ── raw turn 追加 / 读取 / 检索 ──────────────────────────────
  {
    const date = '2026-06-23';
    const uri = `core://logs/raw/${date}/turn-1`;
    store.appendRawTurn({ ts: `${date}T08:00:00.000Z`, user: '帮我重构 gateway', assistant: '好的，分四期推进。' }, uri);

    const dates = store.listRawDates();
    assert.ok(dates.includes(date), 'listRawDates 包含写入日期');

    const turns = store.readDayTurns(date);
    assert.ok(turns.length === 1 && turns[0].user.includes('重构'), 'readDayTurns 取回当日回合');

    const hit = store.searchTurns('重构', { limit: 5 });
    assert.ok(hit.length >= 1, 'searchTurns 命中回合内容');
  }

  // ── summary 读写 + 经 readMemory 通道 ────────────────────────
  {
    const data = { month_narrative: '完成 gateway 四期重构', major_achievements: [{ title: '抽离思考解析器' }] };
    store.writeSummary('monthly', '2026-06', data);

    const back = store.readSummary('monthly', '2026-06');
    assert.ok(back && back.month_narrative.includes('四期重构'), 'readSummary 取回结构化摘要');

    const r = store.readMemory('core://logs/summary/monthly/2026-06');
    assert.ok(r.ok && JSON.parse(r.data.node.content).month_narrative.includes('四期重构'), 'readMemory 经 summary 通道返回摘要 JSON');
  }

  console.log('PASS memory_v2_store read/write semantics are covered');
} finally {
  cleanup();
}
