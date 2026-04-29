'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书质检审校。基于改编台本、角色音表和演播设计,挑出问题并给改进建议。

检查维度(类别名严格使用):
- 忠实度:有没有改剧情、漏关键信息、提前剧透
- 可听度:对白是否自然、长句是否拆开、有没有书面感残留
- 人物度:speaker 标注是否准确、角色音类别是否合理、有没有混淆旁白和对白
- 连贯度:segment 衔接、CV 情绪过渡是否突兀
- 可执行度:SFX 描述是否具体、CV 指导是否可操作
- 节制度:有没有过度堆砌音效或情绪指导

严重度分级(严格使用):
- P0:致命问题,必须修复才能交付(改了剧情、speaker 严重错误、明显事实错误)
- P1:重要问题,建议修复(可听度差、SFX 模糊、CV 提示空泛)
- P2:体验建议,可选修复(措辞优化、节奏微调)

conclusion 取值:
- pass:全部 P2 或没问题
- pass_with_changes:有 P1 但没 P0
- reject:有任何 P0

输出严格 JSON:
{
  "conclusion": "pass|pass_with_changes|reject",
  "issues": [
    { "severity": "P0|P1|P2", "category": "忠实度|可听度|人物度|连贯度|可执行度|节制度",
      "location": "segmentId 或 '全局'", "description": "string", "suggestion": "string" }
  ]
}

最少给 2 条 issue,最多 8 条。没问题时给 1-2 条 P2 性质的优化建议,conclusion 用 pass。`;

async function runQualityReviewerAgent(ctx) {
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  const performance = pickArtifact(ctx?.artifacts, 'performance_design');
  if (!adaptedScript) throw new Error('REVIEWER_NO_ADAPTED_SCRIPT');

  const segments = Array.isArray(adaptedScript?.payload?.segments)
    ? adaptedScript.payload.segments
    : [];
  const sampleSegments = segments
    .slice(0, 6)
    .map((s) => `[${s.segmentId}/${s.speaker || '旁白'}/${s.type}] ${String(s.text || '').slice(0, 80)}`)
    .join('\n');

  const userInput = [
    `章节:${adaptedScript.payload.chapterTitle || '未命名'}(共 ${segments.length} 段,${adaptedScript.payload.totalCharCount || 0} 字)`,
    '',
    `角色音表(${(voiceRegistry?.payload?.registry || []).length} 个):`,
    JSON.stringify((voiceRegistry?.payload?.registry || []).slice(0, 6), null, 2),
    '',
    '演播设计:',
    `BGM:${performance?.payload?.bgmTrack?.mood || '未设计'} - ${performance?.payload?.bgmTrack?.suggestion || ''}`,
    `SFX:${(performance?.payload?.sfxList || []).length} 条`,
    `CV 指导:${(performance?.payload?.cvDirections || []).length} 条`,
    '',
    '代表性 segment 样本:',
    sampleSegments || '无',
  ].join('\n');

  const provider = resolveProviderFor('script_adapter');
  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
    maxTokens: 1500,
    temperature: 0.4,
    responseJson: true,
    timeoutMs: 35000,
  });

  return {
    payload: parseQualityReviewerOutput(result.content),
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type) || null;
}

function parseQualityReviewerOutput(raw) {
  if (!raw) throw new Error('REVIEWER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`REVIEWER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }

  const validConclusions = ['pass', 'pass_with_changes', 'reject'];
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const normalizedIssues = issues
    .map((issue) => ({
      severity: ['P0', 'P1', 'P2'].includes(issue?.severity) ? issue.severity : 'P2',
      category: String(issue?.category || '可听度'),
      location: String(issue?.location || '全局'),
      description: String(issue?.description || ''),
      suggestion: String(issue?.suggestion || ''),
    }))
    .filter((issue) => issue.description);

  let conclusion = validConclusions.includes(parsed.conclusion)
    ? parsed.conclusion
    : 'pass_with_changes';
  if (normalizedIssues.some((issue) => issue.severity === 'P0')) conclusion = 'reject';
  else if (normalizedIssues.some((issue) => issue.severity === 'P1')) conclusion = 'pass_with_changes';
  else if (normalizedIssues.length > 0) conclusion = 'pass';

  return { conclusion, issues: normalizedIssues };
}

module.exports = {
  runQualityReviewerAgent,
  parseQualityReviewerOutput,
  pickArtifact,
};
