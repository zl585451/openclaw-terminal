export interface EChartsPayload {
  title?: string;
  option: Record<string, unknown>;
}

function stripFences(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^```[a-z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

function toPayload(parsed: Record<string, unknown>): EChartsPayload | null {
  if (!parsed || typeof parsed !== 'object') return null;

  if (
    parsed.artifactType === 'echart' &&
    parsed.content &&
    typeof parsed.content === 'object' &&
    !Array.isArray(parsed.content)
  ) {
    const inner = parsed.content as Record<string, unknown>;
    if (inner.option && typeof inner.option === 'object' && !Array.isArray(inner.option)) {
      return {
        title: String(inner.title || parsed.title || ''),
        option: inner.option as Record<string, unknown>,
      };
    }
  }

  if (parsed.option && typeof parsed.option === 'object' && !Array.isArray(parsed.option)) {
    return {
      title: String(parsed.title || ''),
      option: parsed.option as Record<string, unknown>,
    };
  }

  const knownKeys = ['series', 'xAxis', 'yAxis', 'legend', 'tooltip', 'radar', 'geo', 'dataset'];
  if (knownKeys.some((key) => key in parsed)) {
    const rawTitle = parsed.title;
    const title = typeof rawTitle === 'string'
      ? rawTitle
      : (rawTitle as { text?: unknown } | undefined)?.text;
    return {
      title: typeof title === 'string' ? title : '',
      option: parsed,
    };
  }

  return null;
}

function tryParseCandidate(candidate: string): EChartsPayload | null {
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return toPayload(parsed);
  } catch {
    return null;
  }
}

function computeJsonClosers(candidate: string): { closers: string; inString: boolean } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) {
      stack.pop();
    }
  }

  return { closers: stack.reverse().join(''), inString };
}

function bestEffortRepairJson(raw: string): string | null {
  const source = stripFences(raw);
  if (!source.startsWith('{')) return null;

  let longestBalancedPrefix = '';
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) {
      stack.pop();
      if (stack.length === 0) {
        longestBalancedPrefix = source.slice(0, i + 1);
      }
    }
  }

  if (longestBalancedPrefix) return longestBalancedPrefix;

  for (let trim = 0; trim < Math.min(120, source.length); trim += 1) {
    let candidate = source.slice(0, source.length - trim).trimEnd();
    if (!candidate) break;

    while (/[,:"'\\]$/.test(candidate)) {
      candidate = candidate.slice(0, -1).trimEnd();
    }
    while (/[A-Za-z0-9_\-$]$/.test(candidate) && /:\s*[A-Za-z0-9_\-$]*$/.test(candidate)) {
      candidate = candidate.replace(/[A-Za-z0-9_\-$]+$/, '').trimEnd();
      while (/[,:"'\\]$/.test(candidate)) {
        candidate = candidate.slice(0, -1).trimEnd();
      }
    }

    const { closers, inString: openString } = computeJsonClosers(candidate);
    const repaired = `${candidate}${openString ? '"' : ''}${closers}`;
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // continue
    }
  }

  return null;
}

export function parseEChartsPayload(raw: string): EChartsPayload | null {
  const source = stripFences(raw);
  const direct = tryParseCandidate(source);
  if (direct) return direct;

  const repaired = bestEffortRepairJson(source);
  return repaired ? tryParseCandidate(repaired) : null;
}

export function looksLikeEChartsPayload(raw: string): boolean {
  return !!parseEChartsPayload(raw);
}

export function getEChartsPayloadTitle(raw: string, fallback = '数据图表'): string {
  return parseEChartsPayload(raw)?.title?.trim() || fallback;
}
