'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书台本改编师。把用户给的小说原文改写成更适合多人演播的台本片段。

核心规则:
1. 保留剧情、人物关系、关键事件,不改变信息顺序
2. 长句拆短,加自然的停顿;旁白与对白分开
3. 内心独白(inner_monologue)单独标记,不混在对白里
4. 对白要标 speaker(角色名),无法判断 speaker 时归 narration
5. 不提前解释悬疑,不补充原文没有的信息,不写营销语
6. 每段 rewriteNote 一句话说明为什么这么改

输出严格 JSON,不要任何额外解释。结构:
{
  "chapterTitle": "string,从原文推断或者写'未命名片段'",
  "totalCharCount": 数字,所有 segments 的 text 字数之和,
  "segments": [
    {
      "segmentId": "seg-001 / seg-002 ...",
      "type": "narration | dialogue | inner_monologue",
      "speaker": "string,dialogue 必填,inner_monologue 选填,narration 不填",
      "text": "改编后的台本文本",
      "rewriteNote": "一句话说明改写理由"
    }
  ]
}`;

/**
 * 真实文本改编 Agent。
 * @param {{ sourceText: string, agent: object }} ctx
 * @param {object} [_options]
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runTextRewriterAgent(ctx, _options = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('TEXT_REWRITER_NO_INPUT: 没有提供原文');
  if (sourceText.length > 4000) throw new Error(`TEXT_REWRITER_TOO_LONG: ${sourceText.length} > 4000,请先切分`);

  const provider = resolveProviderFor('script_adapter');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `请把下列原文改编成多人演播台本。原文:\n\n${sourceText}` },
  ];

  const result = await chatCompletion({
    provider,
    messages,
    maxTokens: 2000,
    temperature: 0.6,
    responseJson: true,
    timeoutMs: 45000,
  });

  const payload = parseTextRewriterOutput(result.content);
  return { payload, latencyMs: result.latencyMs, model: result.model };
}

function parseTextRewriterOutput(raw) {
  if (!raw) throw new Error('TEXT_REWRITER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.warn('[textRewriterAgent] JSON parse failed', error?.message, raw.slice(0, 200));
    throw new Error(`TEXT_REWRITER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }
  if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }
  if (typeof parsed.totalCharCount !== 'number') {
    parsed.totalCharCount = parsed.segments.reduce((sum, s) => sum + (String(s.text || '').length), 0);
  }
  return parsed;
}

module.exports = { runTextRewriterAgent };
