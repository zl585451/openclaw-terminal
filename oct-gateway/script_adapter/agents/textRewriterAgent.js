'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const { chunkByChars } = require('../../services/chunker');
const config = require('../../config');
const { parseLineProtocol } = require('../lineProtocolParser');

const SYSTEM_PROMPT = `重要：你只能输出行协议。不要输出 JSON、Markdown、标题、解释、代码块或任何前言后语。第一行必须直接是 旁白|、角色名| 或 内心:角色名|。

你是有声书台本改编师，负责把小说原文改写成适合多人演播的台本。你的目标是让听众只靠声音也能听懂情节、人物动作、情绪变化和场景推进。

【输出格式】
严格使用行协议输出。每行一个 segment，只允许以下三种格式：

旁白|文本
角色名|对白
内心:角色名|文本

说明：
- 旁白|文本：用于客观叙述、环境描写、动作描写、场景转换、声音效果、说话语气和角色动作。
- 角色名|对白：只用于角色真正说出口的话。不要把"吱呀"、"咔哒"、"沉默"、动作、音效、括号舞台提示放进对白。
- 判断对白的硬标准：原文有引号，或明确写了"说"、"问"、"喊"、"低声道"等发声动作，才可以使用 角色名|。
- 角色动作、观察、触摸、推门、拿起、放下、觉得重不重，都必须写成 旁白|，不能写成 角色名|。
- 内心:角色名|文本：用于角色没有说出口的心理活动、主观判断、感受、回忆。
- 每行按第一个 | 分隔，左侧是类型或说话人，右侧是台本文本。

【改写总原则】
- 改写，不是扩写。不能增加原文没有的信息、情绪解释、舞台提示或补充句。
- 采用轻改写模式：以保留原文信息为主，只做口语化、拆句、分角色和删冗余。
- 输出必须比原文短一点，但不能明显变成摘要。
- 产出中文字数控制在原文中文字数的 82%-92%。最低不要低于 75%，最高不要超过 95%。
- 如果原文包含案件推进、证据链、文件、公章、日期、决定书、报告、鉴定、笔记、通话记录等信息，输出字数优先保持在 80%-88%，不能压到 70%以下。
- 必须按原文顺序逐自然段处理。除标题和纯重复环境描写外，原文每个非空自然段都至少要在输出中留下对应信息。
- 原文如果有多个场景，不能跳过任何场景。电话、走廊、办公室、讯问室、文件递交、证据展示、人物反应都要保留。
- 对话密集章节：保留主要对白和关键反应，删掉重复停顿和可合并动作。
- 对话密集章节或通话/对讲机场景：不要把每个念头都拆成单独内心行；连续心理活动可以合并成 1-2 行，目标字数比 75%-88%。
- 叙述密集章节：保留关键物件、动作、感官描写，压缩连续环境描写。
- 混合章节：保留日期、文件名、证据、人物反应、沉默、动作、关键回忆片段，以及角色对证据的连续思考。

【口语化规则】
- 长句拆短，一句话不超过 30 字，但不要为了拆句额外增加意思。
- 书面词换成口语词。例如："伫立"改成"站着"，"翌日"改成"第二天"，"凝视"改成"看着"，"仿佛"改成"像是"，"此刻"改成"这时"，"沉默不语"改成"没说话"。
- 删掉纯视觉、过度文学化、听众难以接收的比喻。
- 保留听觉、触觉、嗅觉描写，比如脚步声、冷风、霉味、木头摩擦声。
- 旁白每段不超过 3 句。超过 3 句必须拆成多个 旁白| 行。
- 对白要自然，像角色真的在说话，但不能改变原意。

【内心独白识别规则】
把没有说出口、但属于某个角色视角的内容标成 内心:角色名|文本。

正例：
- 原文：她隐约觉得这箱子里的东西，和母亲沉默了三十年的秘密有关。
  输出：内心:周佳宁|她隐约觉得，这箱子里的东西，跟母亲沉默了三十年的秘密有关。
- 原文：周振山忽然想起昨晚那个带哭腔的女声。
  输出：内心:周振山|他忽然想起昨晚那个带哭腔的女声。
- 原文：她明白，这份决定书终于把那件事推到了台前。
  输出：内心:周佳宁|她明白，这份决定书终于把那件事推到了台前。

反例：
- 原文：她低头看着文件夹。输出：旁白|她低头看着文件夹。
- 原文：门轴发出刺耳的响声。输出：旁白|门轴发出刺耳的响声。
- 原文：他低声说，今晚还会响吗。输出：周振山|今晚还会响吗？

需要标记为内心独白的情况：
- 没有引号，但是某个角色视角下的主观判断、感受、担忧、回忆。
- 常见标志包括："心想"、"觉得"、"隐约感到"、"想起"、"回忆起"、"意识到"、"明白"。
- 即使没有这些词，只要叙述视角明显属于某个角色，也要标记。

【压缩方法】
- 一组连续环境描写超过 3 句时，压成 1-2 行旁白。
- 重复的动作和停顿可以合并。
- 不重要的修饰词可以删。
- 不要把一句原文扩成多句心理解释。
- 不要把多条证据链压成一句概括。证据、报告、人物反应要分行保留。
- 不要只改写开头后概括结尾。必须覆盖原文开头、中段和结尾。
- 原文里的神态、语气、动作、触感、声音、关键修饰，原则上要保留。不要只留下剧情骨架。
- 如果某个自然段超过 60 个字，通常要拆成 2-4 行，而不是压成 1 行。
- 如果某段主要是角色反复紧张、停顿、等待、沉默，只保留最关键的 1-2 个反应，不要逐句扩写。
- 最终输出前自行检查：如果明显低于原文 75%，补回被删掉的动作、神态、语气和证据细节。不要输出检查过程。
- 不删关键情节、人物动作、对白和影响后文理解的信息。
- 不提前解释悬疑。

【禁止事项】
- 不添加原文没有的情节、人物、地点、物件。
- 不改变人物关系、事件顺序、因果关系。
- 不输出 JSON、Markdown、代码块。
- 不输出解释文字，例如"以下是改编结果"。
- 不输出标题行，例如"第X章"、"改编台本"。
- 不使用 AI 套话，例如"作为AI"、"我来帮你"、"根据您的要求"。
- 不输出空行。
- 不使用括号舞台提示，例如"（轻声）"、"（推门声）"、"（按键声）"。
- 拟音和音效必须写成旁白，例如 旁白|门轴“吱呀”一声响了。禁止写成 周佳宁|（推门声）吱呀。
- 角色名| 后面必须是角色说出口的话，不能是动作、音效、心理、沉默或括号内容。
- 常见错误禁止：
  错误：周佳宁|钥匙插进锁孔。
  正确：旁白|周佳宁把钥匙插进锁孔。
  错误：周佳宁|箱子不重。
  正确：旁白|箱子不算重。

【行协议示例】
旁白|老宅的门一推开，灰尘味就扑了出来。
周佳宁|这箱子一直放在这里？
旁白|樟木箱靠在墙角，锁扣已经发黑。
内心:周佳宁|她忽然觉得，这只箱子不像普通旧物。
母亲|别碰它。
旁白|母亲的声音很轻，却一下压住了屋里的动静。
周佳宁|为什么？
内心:母亲|她想起很多年前的那个晚上，手指慢慢攥紧。
旁白|门轴发出“吱呀”一声。
旁白|他压低声音，盯着那台对讲机。
周振山|今晚，它还会响吗？

只输出行协议。从第一行开始就是行协议内容，不要有任何前言后语。再次确认：禁止 JSON，禁止 Markdown，禁止解释文字，禁止标题行。输出要比原文短一点，但不能摘要化，目标字数比 82%-92%。`;

const SOFT_LIMIT = 4000;
const HARD_LIMIT = 12000;
const CHUNK_TARGET = 3500;
const CHUNK_MAX = 4000;
const ANCHOR_SIZE = 200;
const TEXT_REWRITER_TIMEOUT_MS = readPositiveInt(
  config.scriptAdapter?.textRewriterTimeoutMs || config.getEnvOrConfig?.('SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS'),
  120000,
  30000,
  300000,
);

/**
 * 真实文本改编 Agent。
 * @param {{ sourceText: string, agent: object }} ctx
 * @param {object} [_options]
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runTextRewriterAgent(ctx, _options = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('TEXT_REWRITER_NO_INPUT: 没有提供原文');
  if (sourceText.length > HARD_LIMIT) {
    throw new Error(`TEXT_REWRITER_TOO_LONG: ${sourceText.length} > ${HARD_LIMIT}`);
  }

  if (sourceText.length <= SOFT_LIMIT) {
    return runSinglePass(sourceText);
  }

  return runChunkedPass(sourceText);
}

async function runSinglePass(sourceText) {
  const provider = resolveProviderFor('script_adapter');
  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请把下列原文改编成多人演播台本。原文:\n\n${sourceText}` },
    ],
    maxTokens: 2000,
    temperature: 0.6,
    responseJson: false,
    timeoutMs: TEXT_REWRITER_TIMEOUT_MS,
  });

  return {
    payload: normalizePayload(parseTextRewriterOutput(result.content)),
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

async function runChunkedPass(sourceText) {
  const startedAt = Date.now();
  const provider = resolveProviderFor('script_adapter');
  const chunks = chunkByChars(sourceText, {
    targetSize: CHUNK_TARGET,
    maxSize: CHUNK_MAX,
    overlap: 0,
  });

  const mergedSegments = [];
  let succeededChunks = 0;
  let chapterTitle = '';
  let lastAnchor = '';
  let model = provider.model;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const result = await rewriteChunk({
      provider,
      chunkText: chunk.content,
      chunkIndex: index,
      totalChunks: chunks.length,
      previousAnchor: lastAnchor,
    });

    if (result.ok) {
      succeededChunks += 1;
      const payload = normalizePayload(result.payload);
      if (!chapterTitle && payload.chapterTitle) chapterTitle = payload.chapterTitle;
      model = result.model || model;
      for (const segment of payload.segments) {
        mergedSegments.push({
          ...segment,
          segmentId: formatSegmentId(mergedSegments.length + 1),
        });
      }
    } else {
      mergedSegments.push({
        segmentId: formatSegmentId(mergedSegments.length + 1),
        type: 'narration',
        text: `[第 ${index + 1} 段改编失败：${String(result.error || '未知错误').slice(0, 80)}]`,
        rewriteNote: 'chunked fallback',
      });
    }

    lastAnchor = chunk.content.slice(-ANCHOR_SIZE);
  }

  if (succeededChunks === 0) {
    throw new Error(`TEXT_REWRITER_CHUNK_FAILED: ${succeededChunks}/${chunks.length} chunks succeeded`);
  }

  return {
    payload: {
      chapterTitle: chapterTitle || '未命名片段',
      totalCharCount: mergedSegments.reduce((sum, item) => sum + String(item.text || '').length, 0),
      segments: mergedSegments,
    },
    latencyMs: Date.now() - startedAt,
    model: `${model} (chunked × ${chunks.length})`,
  };
}

async function rewriteChunk({ provider, chunkText, chunkIndex, totalChunks, previousAnchor }) {
  const anchorText = previousAnchor ? `上一段末尾参考（仅用于保持语气与衔接，不要重复改写）：\n${previousAnchor}\n\n` : '';
  const stageText = chunkIndex === 0
    ? `请把下列原文改编成多人演播台本。全文会分 ${totalChunks} 段处理，这是第 1 段。`
    : `请继续改编同一章小说，保持人物语气、信息顺序和悬疑节奏一致。这是第 ${chunkIndex + 1}/${totalChunks} 段。`;

  try {
    const result = await chatCompletion({
      provider,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${stageText}\n\n${anchorText}原文：\n\n${chunkText}` },
      ],
      maxTokens: 2000,
      temperature: 0.6,
      responseJson: false,
      timeoutMs: TEXT_REWRITER_TIMEOUT_MS,
    });

    return {
      ok: true,
      payload: parseTextRewriterOutput(result.content),
      model: result.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizePayload(payload) {
  const normalizedSegments = Array.isArray(payload?.segments) ? payload.segments.map((segment, index) => ({
    segmentId: typeof segment?.segmentId === 'string' && segment.segmentId ? segment.segmentId : formatSegmentId(index + 1),
    type: normalizeSegmentType(segment?.type),
    speaker: segment?.speaker ? String(segment.speaker) : undefined,
    text: String(segment?.text || '').trim(),
    rewriteNote: segment?.rewriteNote ? String(segment.rewriteNote).trim() : undefined,
  })).filter((segment) => segment.text) : [];

  if (normalizedSegments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }

  return {
    chapterTitle: String(payload?.chapterTitle || '未命名片段').trim() || '未命名片段',
    totalCharCount: normalizedSegments.reduce((sum, item) => sum + item.text.length, 0),
    segments: normalizedSegments,
  };
}

function normalizeSegmentType(type) {
  return ['narration', 'dialogue', 'inner_monologue'].includes(type) ? type : 'narration';
}

function formatSegmentId(index) {
  return `seg-${String(index).padStart(3, '0')}`;
}

function readPositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseTextRewriterOutput(raw) {
  if (!raw) throw new Error('TEXT_REWRITER_EMPTY_OUTPUT');
  const parsed = parseLineProtocol(raw);
  if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }
  return parsed;
}

function extractJsonObject(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return '';
  return cleaned.slice(start, end + 1);
}

module.exports = {
  runTextRewriterAgent,
  parseTextRewriterOutput,
  extractJsonObject,
};
