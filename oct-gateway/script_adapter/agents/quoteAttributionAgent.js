'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const { parseQuoteAttributionLines } = require('../quoteAttributionParser');

const SYSTEM_PROMPT = `重要：你只能输出行协议。不要输出 JSON、Markdown、标题、解释、代码块或前言后语。

你是中文小说有声台本的“台词归属判断员”。你的任务不是改写文本，也不是生成台本，只判断每条 quoteId 对应的引号内容是谁说的。

【输出格式】每行一个 quote：
quoteId|voiceType|speaker|confidence|evidence

voiceType 只能是：
- dialogue：说出口的对白
- inner_monologue：直接心理原声
- system_voice：系统提示/面板/任务/奖励等有系统语义的提示音，speaker 固定为 系统音
- device_voice：对讲机、广播、电话、录音、无线电等设备传声，speaker 写设备名
- sfx：咔、咚、砰、啪、滋啦、嗡、吱呀等纯动作/环境拟声，speaker 固定为 SFX

confidence 只能是 high / medium / low。

【硬规则】
1. speaker 必须是说话者，不是台词里被称呼的人。
2. 如果左侧或右侧上下文明确“某某说道/问道/喊道/某某的声音”，优先相信上下文。
3. 后置说话人同样有效，例如：“……”王大山说道。
4. 【系统提示】、【叮，系统已激活】这类方括号提示归 system_voice|系统音。
5. 只有“咔/咚/砰/滋啦/嗡/吱呀”等没有语义的拟声词归 sfx|SFX，不要标为系统音。
6. 数字、编号、时间、物品型号、残缺字符不属于 sfx；例如“84”不能输出为 sfx|SFX。
7. 不确定时可以给临时名，如 未定女声A、未定男声A、路人甲、外门弟子群，但 evidence 必须说明为什么不确定。
8. 禁止 speaker 为：角色名、未知角色、speaker、旁白、对白。
9. 不要复制 candidates 里明显错误的候选；candidates 只是参考。`;

const ATTRIBUTION_TIMEOUT_MS = 90000;

async function runQuoteAttributionAgent(ctx) {
  const quotes = Array.isArray(ctx?.quotes) ? ctx.quotes : [];
  if (quotes.length === 0) throw new Error('QUOTE_ATTRIBUTION_NO_QUOTES');

  const provider = resolveProviderFor('script_adapter');
  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildAttributionInput(ctx) },
    ],
    maxTokens: 4096,
    temperature: 0.15,
    responseJson: false,
    timeoutMs: ATTRIBUTION_TIMEOUT_MS,
  });

  const parsed = parseQuoteAttributionLines(result.content, {
    quoteIds: quotes.map((quote) => quote.quoteId),
  });

  if (parsed.attributions.length === 0) {
    const err = new Error('QUOTE_ATTRIBUTION_NO_VALID_RESULT');
    err.warnings = parsed.warnings;
    throw err;
  }

  return {
    ...parsed,
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

function buildAttributionInput(ctx) {
  const knownRoles = Array.isArray(ctx?.knownRoles) ? ctx.knownRoles : [];
  const candidateMap = new Map((Array.isArray(ctx?.candidateSets) ? ctx.candidateSets : [])
    .map((item) => [item.quoteId, item.candidates || []]));

  const items = (ctx.quotes || []).map((quote) => ({
    quoteId: quote.quoteId,
    text: quote.text,
    leftContext: quote.leftContext,
    rightContext: quote.rightContext,
    kindHint: quote.kindHint,
    candidates: (candidateMap.get(quote.quoteId) || []).map((candidate) => ({
      speaker: candidate.speaker,
      evidenceType: candidate.evidenceType,
      evidenceText: candidate.evidenceText,
      confidenceHint: candidate.confidenceHint,
    })),
  }));

  return [
    `chapterTitle: ${String(ctx?.chapterTitle || '未命名片段')}`,
    `knownRoles: ${knownRoles.join(', ') || '无'}`,
    'quotes:',
    JSON.stringify(items, null, 2),
    '',
    '请按 quoteId|voiceType|speaker|confidence|evidence 输出。',
  ].join('\n');
}

module.exports = {
  runQuoteAttributionAgent,
  buildAttributionInput,
};
