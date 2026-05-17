/**
 * @deprecated 2026-03-20 起停用
 *
 * 此模块的主链调用已在 oct-gateway/index.js 中注释：
 * - selfEval.evaluateReply()
 * - maybeDistill()
 *
 * 文件保留供未来重新评估或恢复使用。
 * 如需启用，取消 index.js 的注释即可。
 *
 * 停用原因：评分不准确，自动规则写入 SOUL.md 质量不可控。
 * 替代方案：用户反馈检测（memory_feedback.js 的 detectAndSaveFeedback）。
 *
 * 相关文档：docs/03_specs/99_known_issues.md #3
 */
const config = require('./config');
const memory = require('./memory');
const memoryHistory = require('./memory_history');
const { createLogger } = require('./logger');
const log = createLogger('self_eval');

const DISTILL_COUNT_URI = 'core://agent/distill/count';

// 缓存已确认存在的路径，避免重复检查（进程生命周期内）
const _confirmedPaths = new Set();

// self_eval 写入限流：串行队列，避免 6 路并发时压垮记忆后端
const _evalQueue = [];
const _evalQueueMax = 10;
const _evalQueueDelayMs = 300;  // 队列项间间隔，分散后台写入负载
let _evalProcessing = false;

function extractHttpStatusFromError(errText) {
  const s = String(errText || '');
  const m = s.match(/HTTP\s+(\d{3})\b/);
  return m ? (m[1] | 0) : null;
}

/**
 * 安全解析 AI 返回的 JSON（易有 markdown 包裹、尾逗号、缺逗号、截断等）
 * 失败时返回 null 并打日志，不抛错
 */
function safeParseAIJson(raw, context = '') {
  if (!raw || typeof raw !== 'string') return null;
  console.log('[SelfEval][DEBUG] AI 原始返回:', JSON.stringify(raw.slice(0, 500)) + (raw.length > 500 ? '...(truncated)' : ''));

  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) {
    log.warn('AI JSON 解析失败：未找到 JSON 对象', { context });
    return null;
  }
  s = m[0];

  s = s.replace(/,(\s*[}\]])/g, '$1');
  s = s.replace(/"\s*\n\s*"/g, '", "');
  s = s.replace(/"\s+"/g, '", "');

  try {
    return JSON.parse(s);
  } catch (e) {
    const line3 = s.split('\n')[2];
    log.warn('AI JSON 解析失败', {
      context,
      error: e?.message,
      position: e?.message?.match(/position (\d+)/)?.[1],
      line3: line3 != null ? JSON.stringify(line3) : undefined,
      preview: s.slice(0, 200) + (s.length > 200 ? '...' : ''),
    });

    try {
      const fixed = s
        .replace(/(\]["\s]*)(\s+)(["])/g, '$1,$3')
        .replace(/(\d)\s+(\d)/g, '$1,$2');
      return JSON.parse(fixed);
    } catch (e2) {
      try {
        const JSON5 = require('json5');
        const out = JSON5.parse(s);
        log.info('AI JSON 经 json5 解析成功', { context });
        return out;
      } catch (e3) {
        return null;
      }
    }
  }
}

/**
 * 确保 memory 路径存在（逐级“先读后创”，包含 fullPath 自身）
 * 修改原因：直接 POST 在路径已存在时会触发 422，导致 ERROR 刷屏。
 * 规则：读成功跳过；404 才创建；其它错误抛出。
 * @param {string} domain - 如 'core'
 * @param {string} fullPath - 如 'agent/self_eval/2026-03-19'
 */
async function ensurePath(domain, fullPath) {
  const parts = String(fullPath || '').split('/').filter(Boolean);
  if (parts.length === 0) return;

  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join('/');
    const key = `${domain}://${p}`;
    if (_confirmedPaths.has(key)) continue;

    const rr = await memory.readMemory(key, { treat404AsDebug: true });
    if (rr.ok) {
      log.debug('path exists', { uri: key });
      _confirmedPaths.add(key);
      continue;
    }
    const status = extractHttpStatusFromError(rr.error);
    if (status !== 404) throw new Error(rr.error || 'read failed');

    const cr = await memory.createMemory(key, `${parts[i - 1]} 节点`, 2, '', { treat422AsDebug: true });
    if (cr.ok) {
      log.info('create ok', { uri: key });
      _confirmedPaths.add(key);
    } else {
      // 422 已在 memory 层降级为 debug 并去重，这里仍缓存避免重复检查
      const cStatus = extractHttpStatusFromError(cr.error);
      if (cStatus === 422) _confirmedPaths.add(key);
    }
  }
}

function readMemoryWithTimeout(uri, timeoutMs = 3000) {
  return Promise.race([
    memory.readMemory(uri, { treat404AsDebug: true }),
    new Promise(resolve => setTimeout(
      () => resolve({ ok: false, error: 'timeout' }),
      timeoutMs
    )),
  ]);
}

/** 读取上次提炼时的评估条数，失败返回 0，不阻塞主流程 */
async function readDistillCount() {
  try {
    const r = await memory.readMemory(DISTILL_COUNT_URI, { treat404AsDebug: true });
    if (!r.ok) return 0;
    const content = r.data?.node?.content ?? r.data?.content ?? '';
    const n = parseInt(String(content).trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (e) {
    console.error('[SelfEval] 读取 distill 计数失败:', e?.message || e);
    return 0;
  }
}

/** 将计数写入记忆后端，失败不阻塞主流程 */
async function writeDistillCount(count) {
  try {
    await memoryHistory.ensurePathExists('core', 'agent/distill/count');
    const cr = await memory.createMemory(DISTILL_COUNT_URI, String(count), 2, '');
    if (cr.ok) {
      console.log('[SelfEval] 计数已写入记忆后端:', count);
      return;
    }
    if (!cr.error?.includes('already exists')) {
      const wr = await memory.writeMemory(DISTILL_COUNT_URI, String(count), 2, '');
      if (wr.ok) console.log('[SelfEval] 计数已写入记忆后端:', count);
      else console.error('[SelfEval] 写入 distill 计数失败:', wr.error || 'unknown');
    }
  } catch (e) {
    console.error('[SelfEval] 写入 distill 计数异常:', e?.message || e);
  }
}

/** 统计 self_eval 树下的评估条数（与 maybeDistill 逻辑一致） */
async function getTotalEvalCount() {
  const r = await memory.readMemory('core://agent/self_eval', { treat404AsDebug: true });
  if (!r.ok) return 0;
  const dateDirs = r.data?.node?.children || r.data?.children || [];
  let total = 0;
  for (const d of dateDirs.slice(-7)) {
    const dp = d.path || d.uri?.replace(/^[^:]+:\/\//, '') || '';
    if (!dp) continue;
    const dr = await memory.readMemory(`core://${dp}`, { treat404AsDebug: true });
    if (!dr.ok) continue;
    total += (dr.data?.node?.children || dr.data?.children || []).length;
  }
  return total;
}

/** 队列消费：串行执行 evaluateReply，调用方 .then(maybeDistill) 不变 */
async function _processEvalQueue() {
  if (_evalProcessing || _evalQueue.length === 0) return;
  _evalProcessing = true;
  const { userMsg, amyReply, resolve } = _evalQueue.shift();
  try {
    const result = await evaluateReplyImpl(userMsg, amyReply);
    resolve(result);
  } catch (e) {
    try { resolve(null); } catch {}
  } finally {
    _evalProcessing = false;
    if (_evalQueue.length > 0) {
      setTimeout(_processEvalQueue, _evalQueueDelayMs);
    }
  }
}

/**
 * 自我评估一条回复（入口，经限流队列）
 */
async function evaluateReply(userMsg, amyReply) {
  if (!userMsg || !amyReply) return null;
  if (amyReply.length < 20) return null;
  return new Promise((resolve) => {
    if (_evalQueue.length >= _evalQueueMax) {
      _evalQueue.shift();  // 弃最旧
      log.warn('self_eval 队列已满，丢弃最旧项');
    }
    _evalQueue.push({ userMsg, amyReply, resolve });
    _processEvalQueue();
  });
}

// 自我评估一条回复（实际实现）
async function evaluateReplyImpl(userMsg, amyReply) {
  if (!userMsg || !amyReply) return null;
  // 太短的回复不评估
  if (amyReply.length < 20) return null;

  try {
    const { streamChat } = require('./ai');
    let evalResult = '';

    await streamChat({
      messages: [
        {
          role: 'system',
          content: `你是 AI 的自我评估模块。
评估标准（通用）：
- 简洁直接，不废话，不过度确认
- 有温度但不谄媚，不一味附和
- 深夜时更简洁
- 给出具体建议而不是模糊方向
- 在用户明显错误时要提出质疑，不能一味认同
- 不暴露技术细节

输出格式（严格JSON，不要其他内容，必须是合法 JSON）：
{"score":4,"good":"做得好的一点","bad":"不足的一点","pattern":null,"should_challenge":false}
其中 score 为 1-5 的整数，pattern 无则写 null，不要尾逗号、不要注释。`,
        },
        {
          role: 'user',
          content: `用户说：${userMsg.slice(0, 150)}\nAI回复：${amyReply.slice(0, 300)}`,
        },
      ],
      onDelta: (d) => { evalResult += d; },
      onDone: () => {},
      onError: () => {},
    });

    const parsed = safeParseAIJson(evalResult, 'evaluateReply');
    const score = typeof parsed?.score === 'number' ? parsed.score : parseInt(parsed?.score, 10);
    if (!parsed || !Number.isFinite(score) || score < 1 || score > 5) return null;

    // 写入记忆后端
    const now = new Date();
    const datePath = now.toISOString().slice(0, 10);
    const timePath = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const uri = `core://agent/self_eval/${datePath}/${timePath}`;
    console.log('[evaluateReply] 准备写入:', uri);

    const content = JSON.stringify({
      timestamp: now.toISOString(),
      score,
      good: parsed.good ?? '',
      bad: parsed.bad ?? '',
      pattern: parsed.pattern ?? null,
      should_challenge: Boolean(parsed.should_challenge),
      user_snippet: userMsg.slice(0, 80),
      reply_snippet: amyReply.slice(0, 80),
    });

    try {
      await memoryHistory.ensurePathExists('core', `agent/self_eval/${datePath}/${timePath}`);
      const cr = await memory.createMemory(uri, content, 2, '');
      if (cr.ok) {
        log.info('评估记录写入成功', { uri });
      } else if (!cr.error?.includes('already exists')) {
        const wr = await memory.writeMemory(uri, content, 2, '');
        if (wr.ok) log.info('评估记录写入成功', { uri });
        else console.error('[SelfEval] 评估记录写入失败:', wr.error || 'unknown');
      }
    } catch (e) {
      console.error('[SelfEval] 评估记录写入失败:', e?.message || e);
    }

    log.info(`评分: ${score}/5 | ${parsed.bad || '无问题'}`);
    return { ...parsed, score };
  } catch (e) {
    console.error('[SelfEval] evaluateReply 失败:', e?.message || e);
    return null;
  }
}

// 模式提炼：每积累 20 条评估后触发一次
async function distillPatterns() {
  try {
    const count = await getTotalEvalCount();
    console.log('[distillPatterns]开始执行，当前评估总数:', count);

    // 读取最近的评估记录
    const evalRoot = await readMemoryWithTimeout('core://agent/self_eval', 3000);
    if (!evalRoot.ok) return;

    const dateDirs = evalRoot.data?.node?.children
      || evalRoot.data?.children || [];
    if (dateDirs.length === 0) return;

    // 收集最近 20 条评估
    const evals = [];
    for (const dateDir of dateDirs.slice(-3)) {
      const datePath = dateDir.path
        || dateDir.uri?.replace(/^[^:]+:\/\//, '') || '';
      if (!datePath) continue;
      const r = await readMemoryWithTimeout(`core://${datePath}`, 3000);
      if (!r.ok) continue;
      const timeChildren = r.data?.node?.children
        || r.data?.children || [];
      for (const tc of timeChildren.slice(-8)) {
        const tp = tc.path
          || tc.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!tp) continue;
        const er = await readMemoryWithTimeout(`core://${tp}`, 3000);
        if (!er.ok) continue;
        const content = er.data?.node?.content
          || er.data?.content || '';
        try { evals.push(JSON.parse(content)); } catch {}
      }
    }

    if (evals.length < 10) return; // 不够10条不提炼

    const avgScore = evals.reduce((s, e) => s + (e.score || 3), 0)
      / evals.length;
    const badPoints = evals
      .filter(e => e.bad)
      .map(e => e.bad)
      .join('；');
    const patterns = evals
      .filter(e => e.pattern)
      .map(e => e.pattern)
      .join('；');
    const challengeCount = evals
      .filter(e => e.should_challenge).length;

    // 用 AI 提炼规律
    const { streamChat } = require('./ai');
    let distilled = '';

    await streamChat({
      messages: [
        {
          role: 'system',
          content: `你是规律提炼助手。从 AI 的自我评估数据中提炼可操作的改进规则。
输出格式（严格JSON）：
{
  "rules": ["规则1（20字内）", "规则2", "规则3"],
  "challenge_tendency": "AI 是否过于顺从用户？一句话评价",
  "priority_improvement": "最需要改进的一点（20字内）"
}`,
        },
        {
          role: 'user',
          content: `最近${evals.length}条评估：
平均分：${avgScore.toFixed(1)}/5
常见不足：${badPoints.slice(0, 200)}
发现模式：${patterns.slice(0, 200)}
需要质疑用户的次数：${challengeCount}/${evals.length}`,
        },
      ],
      onDelta: (d) => { distilled += d; },
      onDone: () => {},
      onError: () => {},
    });

    const result = safeParseAIJson(distilled, 'distillPatterns');
    if (!result || !result.rules) return;

    // 写入记忆后端
    const now = new Date().toISOString().slice(0, 10);
    const lpUri = `core://agent/learned_patterns/${now}`;
    const lpContent = JSON.stringify({
        distilled_at: new Date().toISOString(),
        avg_score: avgScore,
        rules: result.rules,
        challenge_tendency: result.challenge_tendency,
        priority_improvement: result.priority_improvement,
        based_on: evals.length,
    });

    await memoryHistory.ensurePathExists('core', lpUri.replace(/^[^:]+:\/\//, ''));
    const lpResult = await memory.createMemory(lpUri, lpContent, 1, '每次新会话开始时加载');
    if (lpResult.ok) {
      log.info('learned_patterns 写入成功', { uri: lpUri });
    } else if (!lpResult.error?.includes('already exists')) {
      const wr = await memory.writeMemory(lpUri, lpContent, 1, '每次新会话开始时加载');
      if (wr.ok) log.info('learned_patterns 写入成功', { uri: lpUri });
      else console.error('[SelfEval] learned_patterns 写入失败:', wr.error || 'unknown');
    }

    log.info('模式提炼完成', { rules: result.rules || [] });

    // 自动更新 SOUL.md 里的学习规则段落
    await updateLearnedRulesInSoul(result.rules,
      result.challenge_tendency);

    // 持久化计数到记忆后端（重置基线，失败不阻塞）
    const total = await getTotalEvalCount();
    writeDistillCount(total).catch(() => {});

  } catch (e) {
    console.error('[SelfEval] distillPatterns 失败:', e?.message || e);
  }
}

// 把提炼出的规则写入 SOUL.md 的专属段落
async function updateLearnedRulesInSoul(rules, challengeTendency) {
  if (!rules || rules.length === 0) return;
  const fs = require('fs');
  const path = require('path');

  const projectRoot = path.join(__dirname, '..');
  const candidates = [
    path.join(projectRoot, 'docs', 'SOUL.md'),
    path.join(projectRoot, 'SOUL.md'),
    path.join(config.PROMPTS_DIR, 'SOUL.md'),
    path.join(config.PROMPTS_DIR, '..', '01_系统提示词', 'SOUL.md'),
    path.join(config.PROMPTS_DIR, '..', '01_system_prompts', 'SOUL.md'),
  ];
  const soulPath = candidates.find(p => fs.existsSync(p));
  if (!soulPath) {
    console.error('[SelfEval] 找不到 SOUL.md，尝试过:', candidates.join(', '));
    return;
  }
  log.info('SOUL.md 路径:', { path: soulPath });

  const marker = '## 🤖 自动学习规则（由模式提炼生成）';
  const newSection = `${marker}
> 最后更新：${new Date().toLocaleString('zh-CN')}

${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

**顺从倾向分析**：${challengeTendency || '暂无数据'}
`;

  try {
    let content = fs.readFileSync(soulPath, 'utf-8');
    const idx = content.indexOf(marker);
    if (idx >= 0) {
      // 替换已有段落
      const nextH2 = content.indexOf('\n## ', idx + marker.length);
      content = nextH2 >= 0
        ? content.slice(0, idx) + newSection + '\n' + content.slice(nextH2)
        : content.slice(0, idx) + newSection;
    } else {
      // 追加到末尾
      content += '\n\n' + newSection;
    }
    fs.writeFileSync(soulPath, content, 'utf-8');
    log.info('SOUL.md 已更新学习规则', { path: soulPath });
  } catch (e) {
    console.error('[SelfEval] SOUL.md 写入失败:', e?.message || e);
  }
}

// 检查是否需要触发提炼
async function maybeDistill() {
  try {
    const lastCount = await readDistillCount();
    const total = await getTotalEvalCount();
    const distillThreshold = 20;
    if (total >= lastCount + distillThreshold) {
      log.info('触发模式提炼，已积累: ' + total + ' 条（上次: ' + lastCount + '）');
      distillPatterns().catch(e => console.error('[SelfEval] 提炼失败:', e.message));
    }
  } catch (e) {
    console.error('[SelfEval] maybeDistill 错误:', e.message);
  }
}

module.exports = { evaluateReply, distillPatterns, maybeDistill };
