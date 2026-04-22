/**
 * scriptParser.ts
 * 剧本文本解析器
 *
 * 支持格式：
 *   - 角色台词：「角色名：台词内容」或「【角色名】（情绪）台词内容」
 *   - 场景指令：「【场景/配乐/音效/旁白/气氛场景...】描述」
 *   - 章节标题：第X幕/第X章/第X集/序幕/尾声/终幕/纯标题行
 */

import { isChapterTitle } from './chapterParser';
import { createCharacterRegistry } from './characterExtractor';
import { detectDialogueLikeLine } from './dialogueDetector';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export type ScriptLineType =
  | 'chapter'      // 章节标题
  | 'dialogue'     // 角色台词
  | 'direction'    // 场景指令（【场景】【配乐】等）
  | 'narrator'     // 旁白（独立旁白角色）
  | 'blank'        // 空行
  | 'text';        // 其他正文

export interface ScriptLine {
  type: ScriptLineType;
  raw: string;         // 原始文本
  character?: string;  // 角色名（dialogue / narrator 时有值）
  emotion?: string;    // 情绪指导（【角色名】（情绪）格式）
  content?: string;    // 台词/指令内容
  dirTag?: string;     // 指令标签，如「场景」「配乐」「音效」
}

export interface ScriptChapter {
  title: string;
  lines: ScriptLine[];
}

export interface ParsedScript {
  title: string;           // 文档标题（第一个非空行）
  chapters: ScriptChapter[];
  characters: string[];    // 出场角色列表（去重，按出现顺序）
  characterColors: Record<string, string>; // 角色 → 颜色
}

export interface ScriptStructureStats {
  title: string;
  nonEmptyLineCount: number;
  chapterCount: number;
  dialogueCount: number;
  narratorCount: number;
  directionCount: number;
  textCount: number;
  characterCount: number;
}

/**
 * 剧本文本预处理：在正则解析之前统一格式（保守模式）
 * 仅做字符级归一化，尽量不改动语义内容
 */
export function normalizeScriptText(raw: string): string {
  let text = String(raw || '');

  // 1. 统一换行符
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. 清理 UTF-8 BOM
  text = text.replace(/^\uFEFF/, '');

  // 3. 去除每行尾部空白
  text = text.replace(/[^\S\n]+$/gm, '');

  // 4. 压缩超长空行：3+ 个空行 => 2 个空行
  text = text.replace(/\n{3,}/g, '\n\n');

  // 5. 统一「角色名 :」=>「角色名：」（仅行首、疑似角色名场景）
  text = text.replace(
    /^(\s*[^\s【】：:（(]{1,12})\s*:(?!\d)/gm,
    '$1：',
  );
  text = text.replace(
    /^(\s*[^\s【】：:（(]{1,12})\s+：/gm,
    '$1：',
  );

  // 6. 统一台词后的半角情绪括号/方括号 => 全角圆括号
  text = text.replace(/((?:：|】)\s*)\(([^)\n]{1,30})\)/g, '$1（$2）');
  text = text.replace(/((?:：|】)\s*)\[([^\]\n]{1,30})\]/g, '$1（$2）');

  // 7. 统一常见旁白写法
  text = text.replace(/^\s*\(旁白\)\s*/gm, '【旁白】');
  text = text.replace(/^\s*（旁白）\s*/gm, '【旁白】');

  return text;
}

// ─── 主解析函数 ───────────────────────────────────────────────────────────────

export function parseScript(rawText: string): ParsedScript {
  const text = normalizeScriptText(rawText);
  const lines = text.split('\n');
  const chapters: ScriptChapter[] = [];
  const characterRegistry = createCharacterRegistry();

  let docTitle = '';
  let currentChapter: ScriptChapter | null = null;

  // 提取文档标题（第一个非空行）
  for (const line of lines) {
    if (line.trim()) {
      docTitle = line.trim();
      break;
    }
  }

  // 解析每一行
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      // 空行
      currentChapter?.lines.push({ type: 'blank', raw: line });
      continue;
    }

    // 1. 章节标题
    if (isChapterTitle(trimmed)) {
      const chapter: ScriptChapter = { title: trimmed, lines: [] };
      chapters.push(chapter);
      currentChapter = chapter;
      continue;
    }

    // 确保有兜底章节容器（文档开头的介绍段）
    if (!currentChapter) {
      currentChapter = { title: docTitle || '序', lines: [] };
      chapters.push(currentChapter);
    }

    const detected = detectDialogueLikeLine(trimmed);
    if (detected?.type === 'narrator') {
      characterRegistry.add(detected.character);
      currentChapter.lines.push({
        type: 'narrator',
        raw: line,
        character: detected.character,
        content: detected.content,
      });
      continue;
    }

    if (detected?.type === 'direction') {
      currentChapter.lines.push({
        type: 'direction',
        raw: line,
        dirTag: detected.dirTag,
        content: detected.content,
      });
      continue;
    }

    if (detected?.type === 'dialogue') {
      characterRegistry.add(detected.character);
      currentChapter.lines.push({
        type: 'dialogue',
        raw: line,
        character: detected.character,
        emotion: detected.emotion,
        content: detected.content,
      });
      continue;
    }

    // 其余作为正文
    currentChapter.lines.push({ type: 'text', raw: line, content: trimmed });
  }

  return {
    title: docTitle,
    chapters,
    characters: characterRegistry.getCharacters(),
    characterColors: characterRegistry.getCharacterColors(),
  };
}

export function analyzeScriptStructure(rawText: string): ScriptStructureStats {
  const parsed = parseScript(rawText);
  let nonEmptyLineCount = 0;
  let chapterCount = parsed.chapters.length;
  let dialogueCount = 0;
  let narratorCount = 0;
  let directionCount = 0;
  let textCount = 0;

  for (const chapter of parsed.chapters) {
    for (const line of chapter.lines) {
      if (line.type === 'blank') continue;
      nonEmptyLineCount += 1;
      if (line.type === 'dialogue') dialogueCount += 1;
      if (line.type === 'narrator') narratorCount += 1;
      if (line.type === 'direction') directionCount += 1;
      if (line.type === 'text') textCount += 1;
    }
  }

  return {
    title: parsed.title,
    nonEmptyLineCount,
    chapterCount,
    dialogueCount,
    narratorCount,
    directionCount,
    textCount,
    characterCount: parsed.characters.length,
  };
}

export function inferImportedTextArtifactType(rawText: string): 'script' | 'document' {
  const stats = analyzeScriptStructure(rawText);
  const structuralCount = stats.dialogueCount + stats.narratorCount + stats.directionCount;
  const proseRatio = stats.nonEmptyLineCount > 0 ? stats.textCount / stats.nonEmptyLineCount : 0;
  const structuralRatio = stats.nonEmptyLineCount > 0 ? structuralCount / stats.nonEmptyLineCount : 0;
  const hasStrongScriptSignals =
    stats.characterCount >= 2
    && structuralCount >= 8
    && structuralRatio >= 0.12;
  const hasStrongDocumentSignals =
    stats.chapterCount >= 3
    && stats.textCount >= 20
    && proseRatio >= 0.6
    && structuralRatio <= 0.1;

  if (hasStrongDocumentSignals) return 'document';
  if (hasStrongScriptSignals) return 'script';

  return structuralRatio >= 0.18 ? 'script' : 'document';
}
