const fs = require('fs');
const path = require('path');

function safeRead(p) {
  try {
    if (!p || !fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function safeWrite(p, content) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

function nowCn() {
  return new Date().toLocaleString('zh-CN');
}

function getNextBriefIndex(prevText) {
  const m = (prevText || '').match(/#\s*问题简报\s*·\s*第(\d+)次/);
  const prev = m ? parseInt(m[1], 10) : 0;
  return Number.isFinite(prev) && prev > 0 ? prev + 1 : 1;
}

function extractRecentResults(taskResultMd, n = 3) {
  const text = (taskResultMd || '').trim();
  if (!text) return '（暂无任务结果记录）';

  // 以 "## Result:" 作为块起点
  const starts = [];
  const re = /^##\s*Result:\s*(.+)\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    starts.push({ idx: m.index, title: (m[1] || '').trim() });
  }
  if (starts.length === 0) return '（未找到 Result 记录）';

  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].idx;
    const end = i + 1 < starts.length ? starts[i + 1].idx : text.length;
    const block = text.slice(start, end).trim();
    blocks.push(block);
  }

  const recent = blocks.slice(-n);
  // 压缩呈现：只保留标题/状态/改动（若存在）
  const lines = [];
  for (const b of recent) {
    const titleMatch = b.match(/^##\s*Result:\s*(.+)\s*$/m);
    const statusMatch = b.match(/^状态：\s*(.+)\s*$/m);
    const changeMatch = b.match(/^改动：\s*([\s\S]*?)(?:\n报错：|\n---|$)/m);
    const title = (titleMatch?.[1] || '未命名任务').trim();
    const status = (statusMatch?.[1] || '未知').trim();
    const change = (changeMatch?.[1] || '（无）').trim().replace(/\n+/g, ' ');
    lines.push(`- ${title}（${status}）：${change}`);
  }
  return lines.join('\n');
}

function extractLatestErrorSummary(errorLogMd) {
  const text = (errorLogMd || '').trim();
  if (!text) {
    return {
      summary: '（暂无错误日志）',
      location: null,
    };
  }

  // 取最后一个以 "## " 开头的段落；若没有则取全文最后 80 行
  const headers = [];
  const hr = /^##\s+(.+)\s*$/gm;
  let m;
  while ((m = hr.exec(text)) !== null) headers.push({ idx: m.index, title: m[1] });
  let lastBlock = '';
  if (headers.length > 0) {
    const start = headers[headers.length - 1].idx;
    lastBlock = text.slice(start).trim();
  } else {
    const lines = text.split(/\r?\n/);
    lastBlock = lines.slice(-80).join('\n').trim();
  }

  // 提取：错误类型/位置/信息/触发条件（尽量从常见栈格式推断）
  const firstErrLine = (lastBlock.split(/\r?\n/).find(l => /Error|Exception|TypeError|ReferenceError|SyntaxError/.test(l)) || '').trim();
  const stackLine = (lastBlock.split(/\r?\n/).find(l => /\bat\b/.test(l) && /:\d+:\d+/.test(l)) || '').trim();
  const triggerLine = (lastBlock.split(/\r?\n/).find(l => /触发|trigger|when/i.test(l)) || '').trim();

  // location: 从 stack 中解析 (path:line:col)
  let location = null;
  const locMatch = stackLine.match(/\(?([A-Za-z]:\\[^():]+|\S+):(\d+):(\d+)\)?/);
  if (locMatch) {
    location = {
      file: locMatch[1],
      line: parseInt(locMatch[2], 10),
      col: parseInt(locMatch[3], 10),
    };
  }

  const parts = [];
  if (firstErrLine) parts.push(`错误类型/信息：${firstErrLine}`);
  if (stackLine) parts.push(`位置：${stackLine}`);
  if (triggerLine) parts.push(`触发条件：${triggerLine}`);
  if (parts.length === 0) parts.push('（未能从日志中提取到结构化错误信息）');

  return {
    summary: parts.join('\n'),
    location,
  };
}

function extractCodeSnippetFromLocation(location) {
  if (!location?.file || !location?.line) return '（未找到可定位的代码位置）';
  try {
    const filePath = location.file;
    if (!fs.existsSync(filePath)) return `（文件不存在：${filePath}）`;
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    const lineIdx = Math.max(0, Math.min(lines.length - 1, location.line - 1));

    // 向上找一个“函数/方法/类”的起始行，作为片段起点
    let start = Math.max(0, lineIdx - 1);
    const startRe = /^\s*(export\s+)?(async\s+)?function\s+\w+|\s*(export\s+)?const\s+\w+\s*=\s*\(|^\s*class\s+\w+|^\s*\w+\s*\([^)]*\)\s*\{/;
    for (let i = lineIdx; i >= Math.max(0, lineIdx - 120); i--) {
      const l = lines[i] || '';
      if (startRe.test(l)) { start = i; break; }
    }

    const snippet = lines.slice(start, Math.min(lines.length, start + 20)).join('\n').trimEnd();
    if (!snippet.trim()) return '（无法提取代码片段）';
    return snippet;
  } catch (e) {
    return `（提取代码片段失败：${e?.message || String(e)}）`;
  }
}

function buildBriefMarkdown({
  briefIndex,
  background,
  recentChanges,
  symptomPrev,
  symptomNow,
  errorSummary,
  codeSnippet,
  judgement,
}) {
  return [
    '---',
    `# 问题简报 · 第${briefIndex}次`,
    '',
    '## 背景',
    background || '（未能从上下文推断）',
    '',
    '## 已做的修改',
    recentChanges || '（暂无）',
    '',
    '## 当前问题',
    `- 之前的症状：${symptomPrev || '（未知）'}`,
    `- 现在的症状：${symptomNow || '（未知）'}`,
    '',
    '## 关键报错',
    errorSummary || '（暂无）',
    '',
    '## 问题代码片段',
    '```',
    codeSnippet || '（暂无）',
    '```',
    '',
    '## Amy的判断',
    judgement || '（暂无判断）',
    '---',
    '',
  ].join('\n');
}

/**
 * 生成 claude-brief.md，并返回生成的 markdown 文本
 * @param {{ projectRoot: string, sessionHistory: Array<{role:string, content:string}> }} opts
 */
function generateClaudeBrief(opts) {
  const projectRoot = opts?.projectRoot;
  const history = Array.isArray(opts?.sessionHistory) ? opts.sessionHistory : [];

  const docsDir = path.join(projectRoot, 'docs');
  const briefPath = path.join(docsDir, 'claude-brief.md');
  const taskResultPath = path.join(docsDir, 'task-result.md');
  const errorLogPath = path.join(docsDir, 'error-log.md');

  const prevBrief = safeRead(briefPath);
  const briefIndex = getNextBriefIndex(prevBrief);

  const taskResult = safeRead(taskResultPath);
  const recentChanges = extractRecentResults(taskResult, 3);

  const errorLog = safeRead(errorLogPath);
  const { summary: errorSummary, location } = extractLatestErrorSummary(errorLog);
  const codeSnippet = extractCodeSnippetFromLocation(location);

  // 背景/症状：从会话中抓最近两条用户消息（排除“生成简报/发给Claude”）
  const userMsgs = history
    .filter(m => m?.role === 'user' && typeof m.content === 'string')
    .map(m => m.content.trim())
    .filter(Boolean)
    .filter(t => !t.includes('生成简报') && !t.includes('发给Claude') && !t.includes('发给 Claude'));

  const symptomNow = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : '';
  const symptomPrev = userMsgs.length > 1 ? userMsgs[userMsgs.length - 2] : symptomNow;
  const backgroundRaw = symptomNow || userMsgs[userMsgs.length - 1] || '';
  const background = backgroundRaw
    ? `正在处理：${backgroundRaw.replace(/\s+/g, ' ').slice(0, 60)}${backgroundRaw.length > 60 ? '…' : ''}`
    : '正在处理某个功能/问题排查（上下文不足）';

  const judgement = location
    ? '根据错误栈定位到具体文件行号，优先怀疑是该函数的输入边界或空值处理导致异常。'
    : '错误日志里缺少可定位的栈信息，优先补全 error-log.md 的最新报错与触发步骤。';

  const brief = buildBriefMarkdown({
    briefIndex,
    background,
    recentChanges,
    symptomPrev,
    symptomNow,
    errorSummary,
    codeSnippet,
    judgement,
  });

  safeWrite(briefPath, brief);
  return { briefPath, brief, generatedAt: nowCn() };
}

module.exports = {
  generateClaudeBrief,
};

