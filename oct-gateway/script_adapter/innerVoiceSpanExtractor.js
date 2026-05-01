'use strict';

const { resolveViewpoint, normalizeRole } = require('./viewpointResolver');

/**
 * Extract unquoted inner-voice / OS spans from narration gaps.
 * This MVP is intentionally rule-first: it only lifts strong protagonist reactions
 * and leaves ambiguous third-person psychology as narration.
 * @param {{ spanDoc: object, viewpointHint?: string }} params
 */
function extractInnerVoiceSpans(params = {}) {
  const spanDoc = params.spanDoc || {};
  const viewpointResult = params.viewpointResult || resolveViewpoint({
    spanDoc,
    sourceText: spanDoc.sourceText,
    viewpointHint: params.viewpointHint,
    candidateSets: params.candidateSets,
    attributions: params.attributions,
  });
  const viewpoint = normalizeSpeaker(params.viewpointHint) || normalizeSpeaker(viewpointResult.viewpoint);
  const knownRoles = buildKnownRoles(viewpointResult, params);
  const gaps = Array.isArray(spanDoc.narrationGaps) ? spanDoc.narrationGaps : [];
  const spans = [];
  let currentActor = viewpoint || '';

  for (const gap of gaps) {
    const lines = splitGapLines(gap);
    let group = null;

    for (const line of lines) {
      const namedActor = inferActorFromLine(line.text, currentActor, knownRoles);
      if (namedActor) currentActor = namedActor;

      const embeddedCue = extractEmbeddedInnerVoiceCue(line, currentActor, knownRoles);
      if (embeddedCue) {
        if (group) {
          pushSpanIfSpeaker(spans, group, group.speaker || currentActor || viewpoint, gap.gapId);
          group = null;
        }
        spans.push({
          osId: `os${String(spans.length + 1).padStart(3, '0')}`,
          gapId: gap.gapId,
          start: embeddedCue.start,
          end: embeddedCue.end,
          text: embeddedCue.text,
          speaker: embeddedCue.speaker,
          confidence: 'high',
          evidence: embeddedCue.reason,
        });
        continue;
      }

      const verdict = classifyInnerVoiceLine(line.text);
      if (verdict.isInnerVoice) {
        const speaker = currentActor || viewpoint;
        if (!speaker) continue;
        if (!group) {
          group = {
            start: line.start,
            end: line.end,
            lines: [line],
            reasons: new Set([verdict.reason]),
            speaker,
          };
        } else {
          group.end = line.end;
          group.lines.push(line);
          group.reasons.add(verdict.reason);
        }
        continue;
      }

      if (group) {
        pushSpanIfSpeaker(spans, group, group.speaker || currentActor || viewpoint, gap.gapId);
        group = null;
      }
    }

    if (group) pushSpanIfSpeaker(spans, group, group.speaker || currentActor || viewpoint, gap.gapId);
  }

  return {
    viewpoint,
    viewpointResult,
    spans,
  };
}

function buildKnownRoles(viewpointResult, params = {}) {
  const roles = new Set();
  const add = (value) => {
    const role = normalizeRole(value);
    if (role) roles.add(role);
  };
  add(viewpointResult?.viewpoint);
  for (const role of viewpointResult?.candidates || []) add(role);
  for (const item of params.attributions || []) add(item.speaker);
  for (const item of params.candidateSets || []) {
    for (const c of item.candidates || []) add(c.name || c.roleName || c);
  }
  return [...roles];
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

  if (/^(嘶+~?|疼|痛|等[……….\-—]*下|不对劲|断头饭|我干什么了|来真的)[！!。？?~]*$/.test(value)) {
    return yes('short_reaction');
  }
  if (/^(真他奈的痛啊|肯定有破局的办法|拒绝就是死|接受还有活路|这简直是奇耻大辱|这真的是天赋异禀了|我宁总实名叹服|怕是送他上路的那种送吧)[！!。？?]*$/.test(value)) {
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
  if (/^[^。！？]{2,40}[？?]$/.test(value) && /(真人|画像|什么情况|怎么|为何|难道|岂不是|能成吗)/.test(value)) {
    return yes('viewpoint_question');
  }

  return no('not_inner_voice');
}

function extractEmbeddedInnerVoiceCue(line, currentActor, knownRoles) {
  const text = String(line?.text || '');
  const cue = text.match(/(?:心中|心里|暗自)?(?:嘀咕|暗道|心想|腹诽)[：:]\s*(.+)$/);
  if (!cue) return null;
  const cueStartInLine = cue.index + cue[0].indexOf(cue[1]);
  const osText = cue[1].trim();
  if (!osText) return null;
  const speaker = inferActorFromLine(text.slice(0, cue.index), currentActor, knownRoles) || currentActor;
  if (!speaker) return null;
  return {
    start: Number(line.start) + cueStartInLine,
    end: Number(line.start) + text.length,
    text: osText,
    speaker,
    reason: 'thought_cue_os',
  };
}

function inferActorFromLine(text, fallback = '', knownRoles = []) {
  const value = String(text || '');
  let found = { role: '', index: -1 };
  for (const role of knownRoles) {
    const idx = value.lastIndexOf(role);
    if (idx < 0 || idx < value.length - 100) continue;
    if (!looksLikeSubjectMention(value, idx, role)) continue;
    if (idx > found.index) found = { role, index: idx };
  }
  if (found.role) return found.role;
  if (/^(她|夫人)/.test(value) && fallback && fallback !== '宁默') return fallback;
  if (/^(他|自己|我)/.test(value) && fallback) return fallback;
  return '';
}

function looksLikeSubjectMention(text, index, role) {
  const before = text.slice(Math.max(0, index - 1), index);
  const after = text.slice(index + role.length, index + role.length + 1);
  const afterText = text.slice(index + role.length, index + role.length + 8);
  if (['的', '给', '与', '和', '、'].includes(after)) return false;
  if (/^说[…….…]/.test(afterText)) return false;
  if (index === 0) return true;
  if (/[。！？；，,\s　]/.test(before)) return true;
  return false;
}

function pushSpanIfSpeaker(spans, group, speaker, gapId) {
  const normalizedSpeaker = normalizeSpeaker(speaker);
  if (!normalizedSpeaker) return;
  spans.push(makeSpan(spans.length + 1, group, normalizedSpeaker, gapId));
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
  return resolveViewpoint({ sourceText }).viewpoint || '';
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
  inferViewpoint,
};
