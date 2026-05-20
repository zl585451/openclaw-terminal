'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const { preprocessParagraphs } = require('../paragraphPreprocessor');

const SYSTEM_PROMPT = `重要：你只能输出行协议。不要输出 JSON、Markdown、标题、解释、代码块或任何前言后语。第一行必须直接是分类结果。

你是台本分类标注员。你的任务是为每个段落标注声音类型、说话人和对应原文片段。

【输入格式】
编号段落列表，每段格式：P编号: 段落文本

【输出格式】严格行协议，每行一个分类结果：
P编号|旁白|对应原文片段
P编号|角色名|对白文本
P编号|内心:角色名|直接脑内念头

一个自然段可能包含多种声音类型，需要输出多行（见下面的"混合段落"示例）。

【分类硬规则】
1. 旁白：客观叙述、环境描写、角色动作（推门、拿起、放下、走过去、站、坐、躺、伸手、低头、抬头、转身）、身体感受（觉得、感觉、掌心跳、掌心传来）、心理状态（她心里...、她觉得...、她想起...、她意识到...）。角色动作永远是旁白，不是对白。
2. 对白：角色真正说出口的话。必须有引号，或者明确出现"说、问、喊、低声道、应了一声"等发声动作动词。
3. 内心独白：只有可被演成角色脑内原声的直接念头才能标为内心独白。第三人称心理描写（如"她心里忽然有点发紧"、"她隐约觉得屋里不太对"、"她脑子里全是那些纸页"）默认归旁白，不是内心独白。
4. 混合段落（如"周佳宁低声问：'妈，你怎么不进去？'"）需要拆成多行：
   P编号|旁白|周佳宁低声问。
   P编号|角色名|妈，你怎么不进去？
5. 不确定speaker时，归旁白，不要强绑到主角。
6. 不确定是内心独白还是旁白时，默认归旁白。

【绝对禁止】
- 不输出解释、Markdown、JSON、自检文字。
- 不把第三人称动作描写标为对白。
- 不把"她心里..."、"她觉得..."、"她脑子里..."标为内心独白（除非是角色直接念头）。
- 角色名|后面不能是动作、身体感受、沉默或括号内容。`;

const CLASSIFICATION_TIMEOUT_MS = 90000;

/**
 * 运行分类切分Agent。
 * @param {{ sourceText: string }} ctx
 * @returns {Promise<{ classifications: Array, paragraphs: Array, warnings: Array, latencyMs: number, model: string }>}
 */
async function runClassificationSplitterAgent(ctx) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('CLASSIFICATION_SPLITTER_NO_INPUT');

  const provider = resolveProviderFor('script_adapter', 'oct-plan');
  const { paragraphs } = preprocessParagraphs(sourceText);

  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildClassificationInputFromParagraphs(paragraphs) },
    ],
    maxTokens: 4096,
    temperature: 0.25,
    responseJson: false,
    timeoutMs: CLASSIFICATION_TIMEOUT_MS,
  });

  const lines = (result.content || '').split(/\r?\n/).filter((l) => l.trim());
  const { classifications, warnings } = parseClassificationLines(lines);

  return {
    classifications,
    paragraphs,
    warnings,
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

function buildClassificationInput(sourceText) {
  const { paragraphs } = preprocessParagraphs(sourceText);
  return buildClassificationInputFromParagraphs(paragraphs);
}

function buildClassificationInputFromParagraphs(paragraphs) {
  return (
    '请为以下段落分类。格式：P编号|旁白或角色名或内心:角色名|对应原文片段\n\n' +
    paragraphs
      .map((p) => `${p.id}: ${p.text}${p.hint && p.hint !== 'unknown' ? ` [hint:${p.hint}]` : ''}`)
      .join('\n')
  );
}

function parseClassificationLines(lines) {
  const classifications = [];
  const warnings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    const lineNumber = i + 1;
    if (!raw) continue;

    const pipeCount = (raw.match(/\|/g) || []).length;
    if (pipeCount < 2) {
      warnings.push({ line: lineNumber, raw, reason: 'missing_separator' });
      continue;
    }

    const firstPipe = raw.indexOf('|');
    const secondPipe = raw.indexOf('|', firstPipe + 1);

    const left = raw.slice(0, firstPipe).trim();
    let speakerOrType, text;

    if (pipeCount === 2) {
      speakerOrType = raw.slice(firstPipe + 1, secondPipe).trim();
      text = raw.slice(secondPipe + 1).trim();
    } else {
      // 多个|，取第一个|前的作为paraId，第一个|和第二个|之间作为类型/说话人
      speakerOrType = raw.slice(firstPipe + 1, secondPipe).trim();
      text = raw.slice(secondPipe + 1).trim();
    }

    if (!left.match(/^P\d+$/)) {
      warnings.push({ line: lineNumber, raw, reason: 'invalid_para_id' });
      continue;
    }
    if (!speakerOrType) {
      warnings.push({ line: lineNumber, raw, reason: 'empty_type_or_speaker' });
      continue;
    }
    if (!text) {
      warnings.push({ line: lineNumber, raw, reason: 'empty_text' });
      continue;
    }

    const { type, speaker } = parseTypeAndSpeaker(speakerOrType);
    classifications.push({
      paraId: left,
      type,
      speaker,
      text,
      raw,
    });
  }

  return { classifications, warnings };
}

function parseTypeAndSpeaker(left) {
  if (left === '旁白') {
    return { type: 'narration', speaker: undefined };
  }
  if (left.startsWith('内心:')) {
    const speaker = left.slice('内心:'.length).trim();
    return { type: 'inner_monologue', speaker: speaker || undefined };
  }
  return { type: 'dialogue', speaker: left };
}

module.exports = {
  runClassificationSplitterAgent,
  buildClassificationInput,
  parseClassificationLines,
  parseTypeAndSpeaker,
};
