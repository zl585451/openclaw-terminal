import { extractAssistantCotAndMain } from './cotExtract';
import { stripThinkModeMarker } from './socraticTemplates';

/** Normalize assistant reply text into a single-line image prompt for ImageStudio injection. */
export function extractOptimizedImagePrompt(raw: string): string {
  const withoutThinkMarker = stripThinkModeMarker(String(raw || ''));
  const extracted = extractAssistantCotAndMain(withoutThinkMarker);
  let text = (extracted.mainContent || withoutThinkMarker || '')
    .replace(/\[\/?cot\]/gi, '')
    .trim();

  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) {
    text = fenced[1].trim();
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[cot\]?$/i.test(line))
    .filter((line) => !/^(用户|要求|说明|规则)\s*[:：]/.test(line))
    .filter((line) => !/^生图提示词\s*[:：]/.test(line))
    .filter((line) => !/^(请帮我|请你|下面是|以下是)/.test(line))
    .filter((line) => !/^(只输出|不要解释|不要加引号|不要使用\s*markdown)/i.test(line))
    .filter((line) => !/^\d+[.)、]\s*/.test(line));

  const joined = lines.join(' ').trim();
  const unquoted = joined
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim();

  return unquoted;
}
