const config = require('./config');
const memory = require('./memory');

// 自我评估一条回复
async function evaluateReply(userMsg, amyReply) {
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
          content: `你是 AMY 的自我评估模块。
评估标准（少爷的已知偏好）：
- 简洁直接，不废话，不过度确认
- 有温度但不谄媚，不一味附和
- 深夜时更简洁
- 给出具体建议而不是模糊方向
- 在少爷明显错误时要提出质疑，不能一味认同
- 不暴露技术细节

输出格式（严格JSON，不要其他内容）：
{
  "score": 1-5,
  "good": "做得好的一点（15字内）",
  "bad": "不足的一点（15字内）",
  "pattern": "发现的行为模式（15字内，没有则null）",
  "should_challenge": true/false （少爷的观点是否需要被质疑）
}`,
        },
        {
          role: 'user',
          content: `少爷说：${userMsg.slice(0, 150)}\nAMY回复：${amyReply.slice(0, 300)}`,
        },
      ],
      onDelta: (d) => { evalResult += d; },
      onDone: () => {},
      onError: () => {},
    });

    // 解析 JSON
    const jsonMatch = evalResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    // 写入 Nocturne
    const now = new Date();
    const datePath = now.toISOString().slice(0, 10);
    const timePath = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const uri = `core://agent/self_eval/${datePath}/${timePath}`;

    await memory.writeMemory(uri, JSON.stringify({
      timestamp: now.toISOString(),
      score: parsed.score,
      good: parsed.good,
      bad: parsed.bad,
      pattern: parsed.pattern,
      should_challenge: parsed.should_challenge,
      user_snippet: userMsg.slice(0, 80),
      reply_snippet: amyReply.slice(0, 80),
    }), 2, '');

    console.log(`[SelfEval] 评分: ${parsed.score}/5 | ${parsed.bad || '无问题'}`);
    return parsed;
  } catch (e) {
    // 静默失败
    return null;
  }
}

// 模式提炼：每积累 20 条评估后触发一次
async function distillPatterns() {
  try {
    // 读取最近的评估记录
    const evalRoot = await memory.readMemory('core://agent/self_eval');
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
      const r = await memory.readMemory(`core://${datePath}`);
      if (!r.ok) continue;
      const timeChildren = r.data?.node?.children
        || r.data?.children || [];
      for (const tc of timeChildren.slice(-8)) {
        const tp = tc.path
          || tc.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!tp) continue;
        const er = await memory.readMemory(`core://${tp}`);
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
          content: `你是规律提炼助手。从 AMY 的自我评估数据中提炼可操作的改进规则。
输出格式（严格JSON）：
{
  "rules": ["规则1（20字内）", "规则2", "规则3"],
  "challenge_tendency": "AMY 是否过于顺从少爷？一句话评价",
  "priority_improvement": "最需要改进的一点（20字内）"
}`,
        },
        {
          role: 'user',
          content: `最近${evals.length}条评估：
平均分：${avgScore.toFixed(1)}/5
常见不足：${badPoints.slice(0, 200)}
发现模式：${patterns.slice(0, 200)}
需要质疑少爷的次数：${challengeCount}/${evals.length}`,
        },
      ],
      onDelta: (d) => { distilled += d; },
      onDone: () => {},
      onError: () => {},
    });

    const jsonMatch = distilled.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const result = JSON.parse(jsonMatch[0]);

    // 写入 Nocturne
    const now = new Date().toISOString().slice(0, 10);
    await memory.writeMemory(
      `core://agent/learned_patterns/${now}`,
      JSON.stringify({
        distilled_at: new Date().toISOString(),
        avg_score: avgScore,
        rules: result.rules,
        challenge_tendency: result.challenge_tendency,
        priority_improvement: result.priority_improvement,
        based_on: evals.length,
      }),
      1,
      '每次新会话开始时加载'
    );

    console.log('[SelfEval] 模式提炼完成:',
      result.rules?.join(' | '));

    // 自动更新 SOUL.md 里的学习规则段落
    await updateLearnedRulesInSoul(result.rules,
      result.challenge_tendency);

  } catch (e) {
    // 静默失败
  }
}

// 把提炼出的规则写入 SOUL.md 的专属段落
async function updateLearnedRulesInSoul(rules, challengeTendency) {
  if (!rules || rules.length === 0) return;
  const fs = require('fs');
  const path = require('path');
  const soulPath = path.join(
    config.PROMPTS_DIR, 'SOUL.md'
  );
  if (!fs.existsSync(soulPath)) return;

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
    console.log('[SelfEval] SOUL.md 已更新学习规则');
  } catch {}
}

// 检查是否需要触发提炼（每 20 条评估触发一次）
async function maybeDistill() {
  try {
    const r = await memory.readMemory('core://agent/self_eval');
    if (!r.ok) return;
    const dateDirs = r.data?.node?.children
      || r.data?.children || [];
    let total = 0;
    for (const d of dateDirs.slice(-3)) {
      const dp = d.path
        || d.uri?.replace(/^[^:]+:\/\//, '') || '';
      if (!dp) continue;
      const dr = await memory.readMemory(`core://${dp}`);
      if (!dr.ok) continue;
      total += (dr.data?.node?.children
        || dr.data?.children || []).length;
    }
    if (total > 0 && total % 20 === 0) {
      console.log('[SelfEval] 触发模式提炼，已积累:', total, '条');
      distillPatterns().catch(() => {});
    }
  } catch {}
}

module.exports = { evaluateReply, distillPatterns, maybeDistill };