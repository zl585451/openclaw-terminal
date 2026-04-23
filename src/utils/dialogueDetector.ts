import { normalizeSpeakerCueName } from './speakerCueNormalizer';

export type DialogueDetectionResult =
  | { type: 'narrator'; character: string; content: string }
  | { type: 'direction'; dirTag: string; content: string }
  | { type: 'dialogue'; character: string; content: string; emotion?: string }
  | null;

const RE_DIALOGUE_COLON = /^([^\s【】：:（(]{1,12})[：:](.+)$/;
const RE_DIALOGUE_BRACKET = /^【([^\s】]{1,15})】(?:[（(]([^）)]*)[）)])?(.*)$/;
const DIRECTION_TAGS = ['场景', '配乐', '音效', '气氛', '气氛场景', '转场', '画外音', '配音', '效果', '背景', '特效', '字幕', '画面', '镜头'];
const RE_DIRECTION = new RegExp(`^【(${DIRECTION_TAGS.join('|')})[^】]*】(.*)$`);
const RE_NARRATOR = /^【?旁白[^】]*】?[：:]?(.*)$/;
const RE_REMARK = /^★+(.*)$/;

export function detectDialogueLikeLine(trimmedLine: string): DialogueDetectionResult {
  const trimmed = String(trimmedLine || '').trim();
  if (!trimmed) return null;

  const narratorMatch = trimmed.match(RE_NARRATOR);
  if (narratorMatch) {
    return {
      type: 'narrator',
      character: '旁白',
      content: narratorMatch[1].trim(),
    };
  }

  const directionMatch = trimmed.match(RE_DIRECTION);
  if (directionMatch) {
    return {
      type: 'direction',
      dirTag: directionMatch[1],
      content: directionMatch[2].trim() || trimmed,
    };
  }

  if (RE_REMARK.test(trimmed)) {
    return {
      type: 'direction',
      dirTag: '★',
      content: trimmed,
    };
  }

  const bracketMatch = trimmed.match(RE_DIALOGUE_BRACKET);
  if (bracketMatch) {
    return {
      type: 'dialogue',
      character: bracketMatch[1].trim(),
      emotion: bracketMatch[2]?.trim(),
      content: bracketMatch[3].trim(),
    };
  }

  const colonMatch = trimmed.match(RE_DIALOGUE_COLON);
  if (colonMatch) {
    const character = normalizeSpeakerCueName(colonMatch[1]);
    if (character && character.length <= 10 && colonMatch[2].trim().length > 0) {
      return {
        type: 'dialogue',
        character,
        content: colonMatch[2].trim(),
      };
    }
  }

  return null;
}
