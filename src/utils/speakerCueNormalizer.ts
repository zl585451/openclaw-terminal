const EXPLICIT_SPEAKER_LABELS = new Set<string>([
  '旁白',
  '男声',
  '女声',
  '童声',
  '少年',
  '少女',
  '男孩',
  '女孩',
  '男人',
  '女人',
  '老人',
  '老者',
  '孩子',
  '众人',
  '众声',
  '系统',
  '广播',
  '录音',
  '电话',
]);

const SPEAKER_CUE_SUFFIXES: string[] = [
  '轻轻地提醒道',
  '平静地说道',
  '低声说道',
  '低声问道',
  '低声答道',
  '笑着说道',
  '轻声说道',
  '缓缓说道',
  '沉声说道',
  '冷冷说道',
  '淡淡说道',
  '轻声说',
  '低声说',
  '高声说',
  '缓缓说',
  '沉声说',
  '笑着说',
  '轻轻说',
  '又说道',
  '便说道',
  '才说道',
  '补充道',
  '解释道',
  '提醒道',
  '重复道',
  '回了一句',
  '回了一声',
  '应了一声',
  '嗯了一声',
  '闷闷地应了一声',
  '笑了笑说道',
  '笑了笑说',
  '顿了顿说道',
  '顿了顿说',
  '想了想说道',
  '想了想说',
  '回头说道',
  '回头说',
  '开口道',
  '开口说',
  '说道',
  '问道',
  '答道',
  '回道',
  '应道',
  '喊道',
  '叫道',
  '笑道',
  '骂道',
  '嘀咕道',
  '嘟囔道',
  '开口',
  '应声',
  '又说',
  '便说',
  '才说',
  '说',
  '问',
  '答',
  '回',
  '道',
  '喊',
  '叫',
  '笑',
  '应',
];

const LEADING_ROLE_RE = /^[\u4e00-\u9fff]{2,6}$/u;

function stripTrailingPunctuation(text: unknown): string {
  return String(text || '')
    .trim()
    .replace(/[：:]+$/u, '')
    .replace(/[，,、；;。！？!?.]+$/u, '')
    .trim();
}

function isPlausibleSpeakerName(name: string): boolean {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  if (EXPLICIT_SPEAKER_LABELS.has(trimmed)) return true;
  return LEADING_ROLE_RE.test(trimmed);
}

function stripSpeakerCueSuffix(text: string): string {
  let current = stripTrailingPunctuation(text);

  for (const suffix of SPEAKER_CUE_SUFFIXES) {
    if (!current.endsWith(suffix) || current.length <= suffix.length) continue;
    current = current.slice(0, -suffix.length).trim();
    current = current.replace(/[，,、；;]+$/u, '').trim();
    break;
  }

  return current;
}

export function normalizeSpeakerCueName(raw: unknown): string | null {
  const trimmed = stripTrailingPunctuation(raw);
  if (!trimmed) return null;

  if (isPlausibleSpeakerName(trimmed)) {
    return trimmed;
  }

  const stripped = stripSpeakerCueSuffix(trimmed);
  if (stripped && stripped !== trimmed && isPlausibleSpeakerName(stripped)) {
    return stripped;
  }

  const leading = stripped.match(/^([\u4e00-\u9fff]{2,6})/u)?.[1]?.trim() || '';
  if (leading && stripped !== trimmed && isPlausibleSpeakerName(leading)) {
    return leading;
  }

  if (trimmed !== stripped) {
    return null;
  }

  return trimmed;
}
