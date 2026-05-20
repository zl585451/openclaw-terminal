'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书演播设计师。基于已经改编好的台本片段和角色音表,设计 BGM、SFX 音效与 CV 演播指导。

规则:
- BGM 给一条整章的氛围方向(mood + suggestion)
- SFX 至少 3 条,每条必须 atSegmentId(只能用输入里给出的 segmentId)+ sfxType(AMB/SFX/FOLEY)+ description
- CV 演播指导至少 2 条,挑情绪转折最强的 segment,给出 emotion + pace
- 严禁编造原文没有的情节、严禁假设画面没有的视觉

输出严格 JSON:
{
  "bgmTrack": { "mood": "string", "suggestion": "string" },
  "sfxList": [ { "atSegmentId": "string", "sfxType": "AMB|SFX|FOLEY", "description": "string" } ],
  "cvDirections": [ { "atSegmentId": "string", "emotion": "string", "pace": "string" } ]
}`;

async function runPerformanceDesignerAgent(ctx) {
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  if (!adaptedScript) throw new Error('PERF_DESIGNER_NO_ADAPTED_SCRIPT');

  const segments = Array.isArray(adaptedScript?.payload?.segments)
    ? adaptedScript.payload.segments
    : [];
  if (segments.length === 0) throw new Error('PERF_DESIGNER_EMPTY_SEGMENTS');

  const provider = resolveProviderFor('script_adapter', 'oct-plan');
  const userInput = [
    `章节标题:${adaptedScript.payload.chapterTitle || '未命名'}`,
    `角色音表:${JSON.stringify((voiceRegistry?.payload?.registry || []).slice(0, 6), null, 2)}`,
    '',
    '可用 segmentId 列表(只能在 atSegmentId 字段使用这些 ID):',
    segments.map((s) => `- ${s.segmentId} [${s.type}${s.speaker ? `/${s.speaker}` : ''}]`).join('\n'),
    '',
    '选取的代表性片段(供你判断情绪和画面):',
    segments
      .slice(0, 8)
      .map((s) => `[${s.segmentId}/${s.speaker || '旁白'}] ${String(s.text || '').slice(0, 100)}`)
      .join('\n'),
  ].join('\n');

  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
    maxTokens: 1500,
    temperature: 0.5,
    responseJson: true,
    timeoutMs: 35000,
  });

  return {
    payload: parsePerformanceDesignerOutput(result.content, segments),
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type) || null;
}

function parsePerformanceDesignerOutput(raw, segments) {
  if (!raw) throw new Error('PERF_DESIGNER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`PERF_DESIGNER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }

  const validIds = new Set(segments.map((s) => String(s.segmentId || '')).filter(Boolean));
  const sfxList = Array.isArray(parsed.sfxList) ? parsed.sfxList : [];
  const cvDirections = Array.isArray(parsed.cvDirections) ? parsed.cvDirections : [];

  return {
    bgmTrack: parsed.bgmTrack && typeof parsed.bgmTrack === 'object'
      ? {
          mood: String(parsed.bgmTrack.mood || '未指定'),
          suggestion: String(parsed.bgmTrack.suggestion || '保持人声清楚,不抢戏'),
        }
      : { mood: '未指定', suggestion: '保持人声清楚,不抢戏' },
    sfxList: sfxList
      .filter((item) => validIds.has(String(item?.atSegmentId || '')))
      .map((item) => ({
        atSegmentId: String(item.atSegmentId),
        sfxType: String(item.sfxType || 'SFX'),
        description: String(item.description || ''),
      }))
      .filter((item) => item.description),
    cvDirections: cvDirections
      .filter((item) => validIds.has(String(item?.atSegmentId || '')))
      .map((item) => ({
        atSegmentId: String(item.atSegmentId),
        emotion: String(item.emotion || '平稳'),
        pace: String(item.pace || '按台本节奏推进'),
      })),
  };
}

module.exports = {
  runPerformanceDesignerAgent,
  parsePerformanceDesignerOutput,
  pickArtifact,
};
