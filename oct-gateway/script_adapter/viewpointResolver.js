'use strict';

const DEFAULT_MIN_CONFIDENCE = 2;
const COMMON_NON_ROLES = new Set([
  '系统音',
  '旁白',
  '对讲机',
  '广播',
  '电话',
  '录音',
  '文件',
  '外门弟子群',
]);

function resolveViewpoint(params = {}) {
  const sourceText = String(params.sourceText || params.spanDoc?.sourceText || '');
  const explicit = normalizeRole(params.viewpointHint);
  const candidates = collectRoleCandidates(params);

  if (explicit) {
    candidates.add(explicit);
    return buildResult(explicit, candidates, 'explicit_hint', 100);
  }

  const scores = new Map();
  const addScore = (name, score, reason) => {
    const role = normalizeRole(name);
    if (!role || COMMON_NON_ROLES.has(role)) return;
    const item = scores.get(role) || { roleName: role, score: 0, reasons: [] };
    item.score += score;
    item.reasons.push(reason);
    scores.set(role, item);
    candidates.add(role);
  };

  const firstText = sourceText.slice(0, 1200);
  for (const name of extractChineseNames(firstText)) {
    addScore(name, 1, 'early_name');
  }

  for (const match of sourceText.matchAll(/([一-龥]{2,4})(?:刚回来|睁开|愣了|皱眉|心中|心里|脑子里|内心|觉得|意识到|想起|听到|看向|坐在|躺到|望着)/g)) {
    addScore(match[1], 4, 'viewpoint_action');
  }

  for (const quote of params.spanDoc?.quotes || []) {
    const left = String(quote.leftContext || '');
    const cue = left.match(/([一-龥]{2,4})(?:说|道|问|开口|低声|冷声|笑道|解释|承认|吐槽)/);
    if (cue) addScore(cue[1], 2, 'quote_cue');
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const winner = ranked.find((item) => item.score >= DEFAULT_MIN_CONFIDENCE);
  if (!winner) return buildResult('', candidates, 'unresolved', 0);
  return buildResult(winner.roleName, candidates, winner.reasons.join(','), winner.score);
}

function collectRoleCandidates(params = {}) {
  const roles = new Set();
  const add = (value) => {
    const role = normalizeRole(value);
    if (role && !COMMON_NON_ROLES.has(role)) roles.add(role);
  };

  for (const item of params.candidateSets || []) {
    for (const c of item.candidates || []) add(c.name || c.roleName || c);
  }
  for (const item of params.attributions || []) add(item.speaker);
  for (const item of params.segments || []) add(item.speaker);
  for (const name of extractChineseNames(String(params.sourceText || params.spanDoc?.sourceText || '').slice(0, 2000))) add(name);
  return roles;
}

function extractChineseNames(text) {
  const names = [];
  const value = String(text || '');
  const patterns = [
    /([一-龥]{2,4})(?:刚回来|的房间|睁开|愣了|皱眉|心中|心里|心头|脑子里|内心|觉得|意识到|想起|听到|看向|坐在|站在|躺到|望着|了然|独自|收回|打断|开口|闻言|身子|脸上|目光)/g,
    /([一-龥]{2,4})(?:说|道|问|问道|说道|笑道|低声道|冷声道|恭声道|解释道|承认道)/g,
    /(?:主角|宿主|少年|青年|男人|女人|夫人|丫鬟)(?:名叫|叫|是)([一-龥]{2,4})/g,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) names.push(match[1]);
  }
  return names.filter((name) => !/^(这个|那个|什么|怎么|为何|系统|旁白|声音|对讲机)$/.test(name));
}

function buildResult(viewpoint, candidates, evidence, confidenceScore) {
  return {
    viewpoint,
    candidates: [...candidates].sort(),
    confidence: viewpoint ? (confidenceScore >= 4 ? 'high' : 'medium') : 'low',
    evidence,
  };
}

function normalizeRole(value) {
  const role = String(value || '').trim();
  if (!role || role.length > 12) return '';
  if (/[|"'“”‘’【】\s]/.test(role)) return '';
  if (/^[他她]的/.test(role)) return '';
  if (/^(他|她|我|自己|众人|几人|大家|有人|男人|女人|青年|少年|声音)$/.test(role)) return '';
  return role;
}

module.exports = {
  resolveViewpoint,
  normalizeRole,
};
