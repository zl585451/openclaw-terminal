/**
 * scriptParser.ts
 * 剧本文本解析器
 *
 * 支持格式：
 *   - 角色台词：「角色名：台词内容」或「【角色名】（情绪）台词内容」
 *   - 场景指令：「【场景/配乐/音效/旁白/气氛场景...】描述」
 *   - 章节标题：第X幕/第X章/第X集/序幕/尾声/终幕/纯标题行
 */

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

// ─── 颜色方案（护眼暗色系，互相区分） ─────────────────────────────────────────

export const DEFAULT_SCRIPT_COLORS: string[] = [
  '#7EC8E3', // 浅蓝
  '#F4A261', // 橙
  '#A8DADC', // 青绿
  '#E9C46A', // 金黄
  '#C77DFF', // 紫
  '#90BE6D', // 草绿
  '#F9844A', // 橙红
  '#43AA8B', // 墨绿
  '#F8961E', // 深橙
  '#4CC9F0', // 天蓝
  '#E76F51', // 砖红
  '#B5E48C', // 嫩绿
  '#FF99C8', // 粉
  '#9BF6FF', // 浅青
  '#CAFFBF', // 薄荷
];

export function mergeCharacterColors(
  baseColors: Record<string, string>,
  customColors: Record<string, string>,
): Record<string, string> {
  return {
    ...baseColors,
    ...customColors,
  };
}

// ─── 正则规则 ────────────────────────────────────────────────────────────────

// 章节标题：第X幕/第X章/第X集/序幕/尾声/终幕/间幕，或纯【标题】格式
const RE_CHAPTER = /^(第[零一二三四五六七八九十百千\d]+[幕章集回节]|序幕|尾声|终幕|间幕|番外|前情提要|开场|结局)([\s：:·・\-—]*.*)?$/;

// 格式1：角色名：台词（冒号可以是全角或半角）
const RE_DIALOGUE_COLON = /^([^\s【】：:（(]{1,12})[：:](.+)$/;

// 格式2：【角色名】（情绪说明）台词  或  【角色名 OS】台词
const RE_DIALOGUE_BRACKET = /^【([^\s】]{1,15})】(?:[（(]([^）)]*)[）)])?(.*)$/;

// 场景指令：【场景】【配乐】【音效】【气氛场景】等，但不包含角色名（角色名规则优先）
const DIRECTION_TAGS = ['场景', '配乐', '音效', '气氛', '气氛场景', '转场', '画外音', '配音', '效果', '背景', '特效', '字幕', '画面', '镜头'];
const RE_DIRECTION = new RegExp(`^【(${DIRECTION_TAGS.join('|')})[^】]*】(.*)$`);

// 旁白（固定角色名）
const RE_NARRATOR = /^【?旁白[^】]*】?[：:]?(.*)$/;

// ★★ 导演备注
const RE_REMARK = /^★+(.*)$/;

// ─── 主解析函数 ───────────────────────────────────────────────────────────────

export function parseScript(rawText: string): ParsedScript {
  const text = normalizeScriptText(rawText);
  const lines = text.split('\n');
  const chapters: ScriptChapter[] = [];
  const characterSet: string[] = [];
  const characterColors: Record<string, string> = {};

  let docTitle = '';
  let currentChapter: ScriptChapter | null = null;

  // 提取文档标题（第一个非空行）
  for (const line of lines) {
    if (line.trim()) {
      docTitle = line.trim();
      break;
    }
  }

  // 确保颜色分配
  function assignColor(name: string) {
    if (!characterColors[name]) {
      const idx = characterSet.length % DEFAULT_SCRIPT_COLORS.length;
      characterColors[name] = DEFAULT_SCRIPT_COLORS[idx];
      characterSet.push(name);
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
    if (RE_CHAPTER.test(trimmed)) {
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

    // 2. 旁白（优先于通用指令和台词）
    const narratorMatch = trimmed.match(RE_NARRATOR);
    if (narratorMatch) {
      assignColor('旁白');
      currentChapter.lines.push({
        type: 'narrator',
        raw: line,
        character: '旁白',
        content: narratorMatch[1].trim(),
      });
      continue;
    }

    // 3. 场景指令 【场景/配乐/音效...】
    const dirMatch = trimmed.match(RE_DIRECTION);
    if (dirMatch) {
      currentChapter.lines.push({
        type: 'direction',
        raw: line,
        dirTag: dirMatch[1],
        content: dirMatch[2].trim() || trimmed,
      });
      continue;
    }

    // 4. 导演备注 ★★
    if (RE_REMARK.test(trimmed)) {
      currentChapter.lines.push({
        type: 'direction',
        raw: line,
        dirTag: '★',
        content: trimmed,
      });
      continue;
    }

    // 5. 格式2：【角色名】（情绪）台词
    const bracketMatch = trimmed.match(RE_DIALOGUE_BRACKET);
    if (bracketMatch) {
      const character = bracketMatch[1].trim();
      assignColor(character);
      currentChapter.lines.push({
        type: 'dialogue',
        raw: line,
        character,
        emotion: bracketMatch[2]?.trim(),
        content: bracketMatch[3].trim(),
      });
      continue;
    }

    // 6. 格式1：角色名：台词
    const colonMatch = trimmed.match(RE_DIALOGUE_COLON);
    if (colonMatch) {
      const character = colonMatch[1].trim();
      // 过滤掉明显是段落标题的行（如「核心基调：`）
      if (character.length <= 10 && colonMatch[2].trim().length > 0) {
        assignColor(character);
        currentChapter.lines.push({
          type: 'dialogue',
          raw: line,
          character,
          content: colonMatch[2].trim(),
        });
        continue;
      }
    }

    // 7. 其余作为正文
    currentChapter.lines.push({ type: 'text', raw: line, content: trimmed });
  }

  return {
    title: docTitle,
    chapters,
    characters: characterSet,
    characterColors,
  };
}
