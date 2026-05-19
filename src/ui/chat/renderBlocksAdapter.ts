import type { OptionItem, ParsedContent, RenderSegment } from '../../utils/optionBoxParser';
import type { RenderBlock, RenderBlockItem } from './chatTypes';

const EMPTY_OPTIONS: OptionItem[] = [];

export function renderBlocksToParsedContent(renderBlocks: RenderBlock[]): ParsedContent {
  return {
    text: '',
    options: EMPTY_OPTIONS,
    totalPages: undefined,
    isTaskList: false,
    isReflectiveQuestions: false,
    forcePills: false,
    segments: renderBlocks.map(renderBlockToSegment).filter((segment): segment is RenderSegment => !!segment),
  };
}

export function renderBlocksCacheKey(content: string, renderBlocks?: RenderBlock[]): string {
  if (!renderBlocks || renderBlocks.length === 0) return content;
  return `${content}\n<!-- render_blocks:${safeStringify(renderBlocks)} -->`;
}

function renderBlockToSegment(block: RenderBlock): RenderSegment | null {
  switch (block.type) {
    case 'markdown':
      return textSegment(block.content);
    case 'code':
      return textSegment(codeBlockToMarkdown(block.language, block.content));
    case 'table':
      return textSegment(tableBlockToMarkdown(block.columns, block.rows));
    case 'notice':
      return textSegment(noticeBlockToMarkdown(block.variant, block.content));
    case 'tasklist':
      return optionsSegment('tasklist', block.items);
    case 'pills':
      return optionsSegment('pills', block.items);
    case 'checkbox':
      return optionsSegment('checkbox', block.items);
    case 'question':
      return optionsSegment('question', block.items);
    case 'clarify_card':
      // InlineInquiry remains on its existing hook path; never leak raw clarify JSON into chat text.
      return null;
    default:
      return null;
  }
}

function textSegment(content: string): RenderSegment {
  return { type: 'text', content: content || '', options: EMPTY_OPTIONS };
}

function optionsSegment(type: RenderSegment['type'], items: RenderBlockItem[]): RenderSegment {
  return { type, content: '', options: toOptionItems(items) };
}

function toOptionItems(items: RenderBlockItem[] = []): OptionItem[] {
  return items
    .filter((item) => item && typeof item.label === 'string' && item.label.trim())
    .map((item, index) => {
      const label = item.label.trim();
      const value = typeof item.value === 'string' && item.value.trim() ? item.value.trim() : label;
      return { num: index + 1, label, value };
    });
}

function codeBlockToMarkdown(language = '', content = ''): string {
  const safeLanguage = language.replace(/[` \t\r\n]/g, '').slice(0, 40);
  return `\`\`\`${safeLanguage}\n${content}\n\`\`\``;
}

function tableBlockToMarkdown(columns: string[] = [], rows: string[][] = []): string {
  if (columns.length === 0) return '';
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((_, index) => row[index] || '').join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function noticeBlockToMarkdown(variant = 'info', content = ''): string {
  return `> [${variant}] ${content}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
