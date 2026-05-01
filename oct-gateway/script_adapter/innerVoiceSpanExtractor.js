'use strict';

const DEFAULT_VIEWPOINT = '宁默';

/**
 * Extract unquoted inner-voice / OS spans from narration gaps.
 * This MVP is intentionally rule-first: it only lifts strong protagonist reactions
 * and leaves ambiguous third-person psychology as narration.
 * @param {{ spanDoc: object, viewpointHint?: string }} params
 */
function extractInnerVoiceSpans(params = {}) {
  const spanDoc = params.spanDoc || {};
  const viewpoint = normalizeSpeaker(params.viewpointHint) || inferViewpoint(spanDoc.sourceText) || DEFAULT_VIEWPOINT;
  const gaps = Array.isArray(spanDoc.narrationGaps) ? spanDoc.narrationGaps : [];
  const spans = [];

  for (const gap of gaps) {
    const lines = splitGapLines(gap);
    let group = null;

    for (const line of lines) {
      const verdict = classifyInnerVoiceLine(line.text);
      if (verdict.isInnerVoice) {
        if (!group) {
          group = {
            start: line.start,
            end: line.end,
            lines: [line],
            reasons: new Set([verdict.reason]),
          };
        } else {
          group.end = line.end;
          group.lines.push(line);
          group.reasons.add(verdict.reason);
        }
        continue;
      }

      if (group) {
        spans.push(makeSpan(spans.length + 1, group, viewpoint, gap.gapId));
        group = null;
      }
    }

    if (group) spans.push(makeSpan(spans.length + 1, group, viewpoint, gap.gapId));
  }

  return {
    viewpoint,
    spans,
  };
}

function splitGapLines(gap) {
  const text = String(gap?.text || '');
  const base = Number(gap?.start || 0);
  const lines = [];
  const re = /[^\r\n]+/g;
  let match;
  while ((match = re.exec(text))) {
    const raw = match[0];
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const trailing = raw.match(/\s*$/)?.[0].length || 0;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    lines.push({
      start: base + match.index + leading,
      end: base + match.index + raw.length - trailing,
      text: trimmed,
    });
  }
  return lines;
}

function classifyInnerVoiceLine(text) {
  const value = normalizeLine(text);
  if (!value) return no('empty');
  if (isChapterTitle(value)) return no('chapter_title');
  if (isNarrativeAction(value)) return no('narrative_action');
  if (isWorldBuilding(value)) return no('world_building');

  if (/^(嘶+~?|疼|痛|等[……….\-—]*下|不对劲|断头饭|我干什么了)[！!。？?~]*$/.test(value)) {
    return yes('short_reaction');
  }
  if (/^(真他奈的痛啊|肯定有破局的办法)[！!。？?]*$/.test(value)) {
    return yes('direct_judgement');
  }
  if (/^(不应该|难道|但是).*?[？?]$/.test(value)) {
    return yes('self_question');
  }
  if (/^容我.*?[？?——-]?$/.test(value)) {
    return yes('first_person_thought');
  }
  if (/^(我|自己).*(?:[？?]|怎么会|到底|怎么办)/.test(value)) {
    return yes('first_person_thought');
  }
  if (/是什么鬼[？?]?$/.test(value)) {
    return yes('self_question');
  }

  return no('not_inner_voice');
}

function makeSpan(index, group, speaker, gapId) {
  const text = group.lines.map((line) => line.text).join(' ');
  return {
    osId: `os${String(index).padStart(3, '0')}`,
    gapId,
    start: group.start,
    end: group.end,
    text,
    speaker,
    confidence: 'high',
    evidence: [...group.reasons].join(','),
  };
}

function normalizeLine(text) {
  return String(text || '').replace(/^[　\s]+|[　\s]+$/g, '').trim();
}

function normalizeSpeaker(value) {
  const speaker = String(value || '').trim();
  if (!speaker || speaker.length > 12 || /[|"'“”‘’【】]/.test(speaker)) return '';
  return speaker;
}

function inferViewpoint(sourceText) {
  const text = String(sourceText || '');
  const known = ['宁默', '苏尘', '伊莱', '白清'];
  return known.find((name) => text.includes(name)) || '';
}

function isChapterTitle(value) {
  return /^(第[一二三四五六七八九十百千万零〇\d]+[章节回卷部]|【\d+】|\d+[、.．])/.test(value);
}

function isNarrativeAction(value) {
  if (/^(他|她|宁默|王大山|狱卒|男人|女人|老人|老犯人)(撑开|睁开|闭上|皱|抬|低|走|站|坐|蹲|放|端|看|盯|伸|拿|摆|退|推|打开|弯腰|咳|眉头|脑海|身体|眼皮|脸色)/.test(value)) return true;
  if (/^(这时|随后|接着|下一刻|这一刻|那一刻|画面中|画面里|衙堂上|油灯|牢房|走廊)/.test(value)) return true;
  return false;
}

function isWorldBuilding(value) {
  if (value.length > 80 && !/[我自己？?]/.test(value)) return true;
  if (/^(这是个|等级|皇室|从皇室|要么|而原主|一个寒门|望族|门阀|现实就是)/.test(value)) return true;
  return false;
}

function yes(reason) {
  return { isInnerVoice: true, reason };
}

function no(reason) {
  return { isInnerVoice: false, reason };
}

module.exports = {
  extractInnerVoiceSpans,
  classifyInnerVoiceLine,
};
