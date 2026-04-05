function hasEnoughChinese(text: string): boolean {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return (matches?.length ?? 0) >= 12;
}

function collectFileRefs(text: string): string[] {
  const matches = text.match(/\b[\w./-]+\.(?:ts|tsx|js|jsx|css|json|md)\b/g) ?? [];
  return [...new Set(matches)].slice(0, 3);
}

function collectCodeRefs(text: string): string[] {
  const matches = text.match(/\b(?:use[A-Z]\w+|[A-Z][A-Za-z0-9_]+|[a-z_][a-z0-9_]*)\(/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(0, -1)))].slice(0, 3);
}

function firstMeaningfulLine(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[#>\-\d.\s]+/, '').trim())
    .filter(Boolean);
  return lines[0] ?? '';
}

export function summarizeCotForDisplay(rawCot: string | null | undefined, mainContent = ''): string | null {
  const cot = (rawCot || '').trim();
  if (!cot) return null;
  if (hasEnoughChinese(cot)) return cot;

  const haystack = `${cot}\n${mainContent}`.toLowerCase();
  const files = collectFileRefs(`${cot}\n${mainContent}`);
  const codeRefs = collectCodeRefs(cot);
  const intro = firstMeaningfulLine(mainContent) || firstMeaningfulLine(cot);

  const bullets: string[] = [];

  if (intro) {
    bullets.push(`先围绕你的目标做判断：${intro.slice(0, 42)}${intro.length > 42 ? '...' : ''}`);
  } else {
    bullets.push('先理解这次问题的目标、上下文和输出要求。');
  }

  if (/(stream|streaming|render|layout|scroll|reflow|reconcile|fps|jank|lag|performance|typewriter)/.test(haystack)) {
    bullets.push('重点检查流式渲染、滚动跟随和消息头区域是否存在高频重排或重复刷新。');
  }

  if (files.length > 0) {
    bullets.push(`查看相关代码位置：${files.join('、')}。`);
  } else if (/(hook|component|message|chat|gateway|ws|websocket|tool)/.test(haystack)) {
    bullets.push('沿着消息链路逐段检查前端组件、Hook 和网关输出，确认问题出在哪一段。');
  }

  if (codeRefs.length > 0) {
    bullets.push(`关注关键逻辑：${codeRefs.join('、')}。`);
  }

  if (/(compare|option|tradeoff|alternative|方案|选择)/.test(haystack)) {
    bullets.push('对比几种处理方式后，优先选择对现有交互影响最小、但能明显减轻负载的方案。');
  } else {
    bullets.push('在不改坏现有交互的前提下，优先移除不必要的动画、重复渲染和高频状态更新。');
  }

  if (/(test|verify|tsc|check|validate|fix|patch|commit)/.test(haystack)) {
    bullets.push('完成调整后再做一次校验，确认显示效果、输出链路和稳定性都没有回退。');
  }

  const uniqueBullets = [...new Set(bullets)].slice(0, 5);
  return [
    '以下是本轮思考过程的中文摘要：',
    '',
    ...uniqueBullets.map((line) => `- ${line}`),
  ].join('\n');
}
