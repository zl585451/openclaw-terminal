'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是中文有声书口语化改写员。把旁白段落改写成适合耳朵听的版本。

【规则】
- 长句拆短，每句不超过30字
- 书面词换口语词（伫立→站着，翌日→第二天，凝视→看着，仿佛→像是，此刻→这时，沉默不语→没说话）
- 删掉纯视觉比喻
- 每段不超过3句
- 不改变信息、不新增人物/地点/物件
- 不把旁白改成对白
- 只输出改写文本，不要speaker
- 不输出解释、自检、Markdown
- 如果无法改写，原样输出原文

【输入格式】
S段落编号: 旁白文本

【输出格式】
S段落编号|改写后文本

注意：S编号对应输入，不要改变编号。`;

const LIGHT_REWRITE_TIMEOUT_MS = 90000;

/**
 * 轻改写Agent：只改写旁白文本，保持段落ID对齐。
 * @param {{ narrationItems: Array<{paraId: string, text: string}> }} ctx
 * @returns {Promise<{ rewritten: Map<string, string>, failed: Array<string>, warnings: Array }>}
 */
async function runLightNarrationRewriterAgent(ctx) {
  const narrationItems = ctx?.narrationItems || [];
  if (narrationItems.length === 0) {
    return { rewritten: new Map(), failed: [], warnings: [] };
  }

  const provider = resolveProviderFor('script_adapter', 'oct-plan');

  const inputText = narrationItems
    .map((item) => `S${item.paraId}: ${item.text}`)
    .join('\n');

  try {
    const result = await chatCompletion({
      provider,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请改写以下旁白段落。\n\n${inputText}` },
      ],
      maxTokens: 4096,
      temperature: 0.3,
      responseJson: false,
      timeoutMs: LIGHT_REWRITE_TIMEOUT_MS,
    });

    return parseRewriteOutput(result.content, narrationItems);
  } catch (error) {
    return {
      rewritten: new Map(),
      failed: narrationItems.map((item) => item.paraId),
      warnings: [{ reason: 'light_rewrite_failed', detail: String(error?.message || error) }],
    };
  }
}

function parseRewriteOutput(rawContent, narrationItems) {
  const rewritten = new Map();
  const failed = [];
  const warnings = [];
  const lines = (rawContent || '').split(/\r?\n/).filter((l) => l.trim());
  const paraIds = new Set(narrationItems.map((item) => item.paraId));

  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx < 0) continue;

    const left = line.slice(0, pipeIdx).trim();
    const text = line.slice(pipeIdx + 1).trim();
    if (!left.startsWith('S') || !text) continue;

    const paraId = left.slice(1);
    if (!paraIds.has(paraId)) continue;
    if (!text) {
      failed.push(paraId);
      continue;
    }

    rewritten.set(paraId, text);
  }

  // fallback: 未返回的用原文
  for (const item of narrationItems) {
    if (!rewritten.has(item.paraId)) {
      rewritten.set(item.paraId, item.text);
      warnings.push({ reason: 'rewrite_fallback', paraId: item.paraId });
    }
  }

  return { rewritten, failed, warnings };
}

module.exports = {
  runLightNarrationRewriterAgent,
  parseRewriteOutput,
};