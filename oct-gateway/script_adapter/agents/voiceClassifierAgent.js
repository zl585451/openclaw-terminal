'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const config = require('../../config');
const {
  classifyVoiceType,
  isDeviceSpeaker,
  isSfxSpeaker,
  isSystemSpeaker,
  isUnresolvedSpeaker,
  normalizeFunctionalSpeaker,
} = require('../voiceTypeClassifier');

const VOICE_CLASSIFIER_MODEL = 'qwen3.5-flash';
const DASHSCOPE_COMPATIBLE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const VOICE_CLASSIFIER_TIMEOUT_MS = 35000;
const MAX_EXAMPLE_LINES = 16;
const MAX_EXAMPLE_CHARS = 120;

const SYSTEM_PROMPT = `你是有声书角色音统筹师。你会收到由 Text Rewriter 行协议解析后生成的 segments 统计结果。请只根据这些已经解析好的 speaker 统计，为每个 speaker 判断角色音类别，并写一句声线建议。

类别(严格使用):
- narrator: 旁白,通常出场次数最多,无对白以叙述为主
- main: 主要角色,有完整对白,出场频繁
- support: 配角,对白少或仅出场 1-2 次
- unresolved: 文件、回忆、未确认女声/男声等来源不明的人声
- sfx: 功能性声音或非人声,包含系统提示、设备传声、环境/动作拟声

声线建议(voiceHint)写法:只写证据能支持的声线信息,一句话内,例如"年轻女性,压抑、少话,反应慢半拍"。
如果代表片段不能明确支持性别、年龄或身份,不要根据姓名猜测,写"性别未定/年龄未定,待人工复核"。

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

  const provider = resolveVoiceClassifierProvider();
  const chapterTitle = adaptedScript.payload?.chapterTitle || '未命名';
  const messages = buildVoiceClassifierMessages({ chapterTitle, stats, segments });

  const result = await chatCompletion({
    provider,
    messages,
    maxTokens: 1500,
    temperature: 0.4,
    responseJson: true,
    timeoutMs: VOICE_CLASSIFIER_TIMEOUT_MS,
  });

  const payload = parseVoiceClassifierOutput(result.content, stats);
  return { payload, latencyMs: result.latencyMs, model: result.model };
}

function pickAdaptedScript(artifacts = {}) {
  return Object.values(artifacts).find((a) => a?.artifactType === 'adapted_script') || null;
}

function resolveVoiceClassifierProvider() {
  const baseProvider = resolveProviderFor('script_adapter', 'oct-plan');
  if (baseProvider.source === 'script_adapter' || isDashScopeBaseUrl(baseProvider.baseUrl)) {
    return { ...baseProvider, model: VOICE_CLASSIFIER_MODEL };
  }

  const dashScopeApiKey = String(config.getEnvOrConfig?.('DASHSCOPE_API_KEY') || '').trim();
  if (isStandardDashScopeKey(dashScopeApiKey)) {
    return {
      baseUrl: DASHSCOPE_COMPATIBLE_BASE_URL,
      apiKey: dashScopeApiKey,
      model: VOICE_CLASSIFIER_MODEL,
      source: 'voice_classifier_dashscope',
    };
  }

  return { ...baseProvider, model: VOICE_CLASSIFIER_MODEL };
}

function isDashScopeBaseUrl(baseUrl) {
  return String(baseUrl || '').toLowerCase().includes('dashscope.aliyuncs.com');
}

function isStandardDashScopeKey(apiKey) {
  const normalized = String(apiKey || '').trim().toLowerCase();
  return Boolean(normalized) && !normalized.startsWith('sk-sp-') && !normalized.startsWith('sk-cp-');
}

function aggregateSpeakers(segments) {
  const map = new Map();
  for (const seg of segments) {
    const rawSpeaker = (seg.type === 'narration' || !seg.speaker)
      ? '旁白'
      : String(seg.speaker).trim();
    const speaker = rawSpeaker === '旁白' ? rawSpeaker : normalizeFunctionalSpeaker({ type: seg.type, speaker: rawSpeaker, text: seg.text });
    if (!speaker) continue;
    const current = map.get(speaker) || { roleName: speaker, appearanceCount: 0, voiceTypeCounts: {} };
    current.appearanceCount += 1;
    const voiceType = classifyVoiceType({ type: seg.type, speaker, text: seg.text });
    current.voiceTypeCounts[voiceType] = (current.voiceTypeCounts[voiceType] || 0) + 1;
    map.set(speaker, current);
  }
  return Array.from(map.values())
    .map((item) => ({ ...item, voiceType: dominantVoiceType(item.voiceTypeCounts) }))
    .sort((a, b) => b.appearanceCount - a.appearanceCount);
}

function dominantVoiceType(counts = {}) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'character';
}

function buildVoiceClassifierMessages({ chapterTitle, stats, segments }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `章节标题:${chapterTitle || '未命名'}\n\n`
        + `角色出场统计(JSON):\n${JSON.stringify(stats, null, 2)}\n\n`
        + `代表片段(每个角色最多2条,只用于声线判断):\n${exampleSegments(segments)}`,
    },
  ];
}

function exampleSegments(segments) {
  const counts = new Map();
  const examples = [];
  for (const s of segments || []) {
    const roleName = s.type === 'narration' || !s.speaker ? '旁白' : String(s.speaker).trim();
    if (!roleName) continue;
    const used = counts.get(roleName) || 0;
    if (used >= 2) continue;
    const text = String(s.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    counts.set(roleName, used + 1);
    examples.push(`[${roleName}/${s.type || 'unknown'}] ${text.slice(0, MAX_EXAMPLE_CHARS)}`);
    if (examples.length >= MAX_EXAMPLE_LINES) break;
  }
  return examples.join('\n');
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

  const statMap = new Map(stats.map((s) => [s.roleName, s]));

  const registry = [];
  const seen = new Set();
  for (const r of parsed.registry) {
    const roleName = String(r.roleName || '').trim();
    if (!roleName || !statMap.has(roleName) || seen.has(roleName)) continue;
    const cat = String(r.category || '').trim();
    const forcedCategory = forcedCategoryForRole(roleName, statMap);
    const category = forcedCategory || (VALID_CATEGORIES.has(cat) ? cat : 'support');
    registry.push({
      roleName,
      category,
      voiceHint: String(r.voiceHint || '（未给出声线建议）').trim() || '（未给出声线建议）',
      appearanceCount: Number(statMap.get(roleName)?.appearanceCount ?? r.appearanceCount ?? 0),
    });
    seen.add(roleName);
  }

  for (const s of stats) {
    if (seen.has(s.roleName)) continue;
    registry.push({
      roleName: s.roleName,
      category: fallbackCategory(s.roleName, s.appearanceCount, s.voiceType),
      voiceHint: '（模型未返回该项，已按出场统计占位）',
      appearanceCount: s.appearanceCount,
    });
    seen.add(s.roleName);
  }

  registry.sort((a, b) => b.appearanceCount - a.appearanceCount);

  for (const r of registry) {
    r.appearanceCount = Number(statMap.get(r.roleName)?.appearanceCount ?? r.appearanceCount ?? 0);
  }

  const unresolved = registry.filter((r) => r.category === 'unresolved').map((r) => r.roleName);

  return { registry, unresolved };
}

function buildFallbackVoiceRegistryPayload(stats, options = {}) {
  const registry = [];
  for (const s of stats || []) {
    const roleName = String(s.roleName || '').trim();
    if (!roleName) continue;
    const appearanceCount = Number(s.appearanceCount || 0);
    const category = fallbackCategory(roleName, appearanceCount, s.voiceType);
    registry.push({
      roleName,
      category,
      voiceHint: fallbackVoiceHint(roleName, category),
      appearanceCount,
    });
  }
  registry.sort((a, b) => b.appearanceCount - a.appearanceCount);
  const unresolved = registry.filter((r) => r.category === 'unresolved').map((r) => r.roleName);
  return {
    registry,
    unresolved,
    degraded: true,
    degradeReason: String(options.reason || 'voice_classifier_fallback'),
  };
}

function forcedCategoryForRole(roleName, statMap) {
  const stat = statMap instanceof Map ? statMap.get(roleName) : null;
  const voiceType = stat && typeof stat === 'object' ? stat.voiceType : '';
  if (roleName === '旁白') return 'narrator';
  if (FUNCTIONAL_VOICE_TYPES.has(voiceType) || isSfxSpeaker(roleName) || isSystemSpeaker(roleName) || isDeviceSpeaker(roleName)) return 'sfx';
  if (voiceType === 'unresolved_voice' || isUnresolvedSpeaker(roleName)) return 'unresolved';
  return '';
}

function fallbackCategory(roleName, appearanceCount, voiceType = '') {
  if (roleName === '旁白') return 'narrator';
  if (FUNCTIONAL_VOICE_TYPES.has(voiceType)) return 'sfx';
  if (voiceType === 'unresolved_voice') return 'unresolved';
  if (/系统|提示|警报|机械|音效/.test(roleName)) return 'sfx';
  if (/广播|电话|录音|文件|声音|神秘/.test(roleName)) return 'unresolved';
  return appearanceCount >= 3 ? 'main' : 'support';
}

function fallbackVoiceHint(roleName, category) {
  if (category === 'narrator') return '旁白声线，清晰稳定，按场景情绪调整节奏';
  if (category === 'sfx' && isSystemSpeaker(roleName)) return '系统提示音，清晰短促，独立于普通角色音处理';
  if (category === 'sfx' && isDeviceSpeaker(roleName)) return '设备传声或电流杂音，带介质感，独立于普通角色音处理';
  if (category === 'sfx') return '环境或动作音效，短促清楚，独立于普通角色音处理';
  if (category === 'unresolved') return '未确认来源声音，先独立占位，后续人工回绑';
  return '性别未定、年龄未定，先按对白密度和情绪强度占位，后续人工复核';
}

const FUNCTIONAL_VOICE_TYPES = new Set(['sfx', 'system_voice', 'device_voice']);

module.exports = {
  runVoiceClassifierAgent,
  aggregateSpeakers,
  buildFallbackVoiceRegistryPayload,
  buildVoiceClassifierMessages,
  exampleSegments,
  parseVoiceClassifierOutput,
  pickAdaptedScript,
  resolveVoiceClassifierProvider,
};
