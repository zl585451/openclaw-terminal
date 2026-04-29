'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书角色音统筹师。给你一段已经改编好的多人演播台本里的角色出场统计,你要为每个角色判断角色音类别,并写一句声线建议。

类别(严格使用):
- narrator: 旁白,通常出场次数最多,无对白以叙述为主
- main: 主要角色,有完整对白,出场频繁
- support: 配角,对白少或仅出场 1-2 次
- unresolved: 文件、广播、回忆、电话等未确认来源的声音
- sfx: 功能性音效或非人声(如系统提示、警报、机械声)

声线建议(voiceHint)写法:性别 + 年龄段 + 情绪基调 + 语速,一句话内,例如"年轻女性,压抑、少话,反应慢半拍"。

输出严格 JSON,不要任何额外解释。结构:
{
  "registry": [
    { "roleName": "string", "category": "narrator|main|support|unresolved|sfx",
      "voiceHint": "一句话声线建议", "appearanceCount": 数字 }
  ],
  "unresolved": ["未定来源角色名 1", "未定来源角色名 2"]
}

注意:
- 必须为输入里的每个 roleName 都给出一项
- registry 顺序按 appearanceCount 降序
- unresolved 字段是 registry 中 category=unresolved 的 roleName 列表
- 不要新增输入里没有的 roleName`;

const VALID_CATEGORIES = new Set(['narrator', 'main', 'support', 'unresolved', 'sfx']);

/**
 * @param {{ artifacts?: object }} ctx
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runVoiceClassifierAgent(ctx) {
  const adaptedScript = pickAdaptedScript(ctx?.artifacts);
  if (!adaptedScript) {
    throw new Error('VOICE_CLASSIFIER_NO_ADAPTED_SCRIPT: 上游未产出 adapted_script');
  }

  const segments = Array.isArray(adaptedScript?.payload?.segments)
    ? adaptedScript.payload.segments
    : [];
  if (segments.length === 0) {
    throw new Error('VOICE_CLASSIFIER_EMPTY_SEGMENTS');
  }

  const stats = aggregateSpeakers(segments);
  if (stats.length === 0) {
    throw new Error('VOICE_CLASSIFIER_NO_SPEAKERS');
  }

  const provider = resolveProviderFor('script_adapter');
  const chapterTitle = adaptedScript.payload?.chapterTitle || '未命名';
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `章节标题:${chapterTitle}\n\n`
        + `角色出场统计(JSON):\n${JSON.stringify(stats, null, 2)}\n\n`
        + `示例片段(供你判断声线情绪):\n${exampleSegments(segments).slice(0, 1500)}`,
    },
  ];

  const result = await chatCompletion({
    provider,
    messages,
    maxTokens: 1500,
    temperature: 0.4,
    responseJson: true,
    timeoutMs: 30000,
  });

  const payload = parseVoiceClassifierOutput(result.content, stats);
  return { payload, latencyMs: result.latencyMs, model: result.model };
}

function pickAdaptedScript(artifacts = {}) {
  return Object.values(artifacts).find((a) => a?.artifactType === 'adapted_script') || null;
}

function aggregateSpeakers(segments) {
  const map = new Map();
  for (const seg of segments) {
    const speaker = (seg.type === 'narration' || !seg.speaker)
      ? '旁白'
      : String(seg.speaker).trim();
    if (!speaker) continue;
    map.set(speaker, (map.get(speaker) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([roleName, appearanceCount]) => ({ roleName, appearanceCount }))
    .sort((a, b) => b.appearanceCount - a.appearanceCount);
}

function exampleSegments(segments) {
  return segments
    .slice(0, 6)
    .map((s) => `[${s.speaker || '旁白'}/${s.type}] ${String(s.text || '').slice(0, 80)}`)
    .join('\n');
}

function parseVoiceClassifierOutput(raw, stats) {
  if (!raw) throw new Error('VOICE_CLASSIFIER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`VOICE_CLASSIFIER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }
  if (!parsed || !Array.isArray(parsed.registry)) {
    throw new Error('VOICE_CLASSIFIER_NO_REGISTRY');
  }

  const statMap = new Map(stats.map((s) => [s.roleName, s.appearanceCount]));

  let registry = parsed.registry.map((r) => {
    const roleName = String(r.roleName || '').trim();
    const cat = String(r.category || '').trim();
    const category = VALID_CATEGORIES.has(cat) ? cat : 'support';
    return {
      roleName,
      category,
      voiceHint: String(r.voiceHint || '（未给出声线建议）').trim() || '（未给出声线建议）',
      appearanceCount: Number(statMap.get(roleName) ?? r.appearanceCount ?? 0),
    };
  }).filter((r) => r.roleName);

  const seen = new Set(registry.map((r) => r.roleName));
  for (const s of stats) {
    if (seen.has(s.roleName)) continue;
    registry.push({
      roleName: s.roleName,
      category: 'support',
      voiceHint: '（模型未返回该项，已按出场统计占位）',
      appearanceCount: s.appearanceCount,
    });
    seen.add(s.roleName);
  }

  registry.sort((a, b) => b.appearanceCount - a.appearanceCount);

  for (const r of registry) {
    r.appearanceCount = Number(statMap.get(r.roleName) ?? r.appearanceCount ?? 0);
  }

  const unresolved = registry.filter((r) => r.category === 'unresolved').map((r) => r.roleName);

  return { registry, unresolved };
}

module.exports = {
  runVoiceClassifierAgent,
  aggregateSpeakers,
  parseVoiceClassifierOutput,
  pickAdaptedScript,
};
