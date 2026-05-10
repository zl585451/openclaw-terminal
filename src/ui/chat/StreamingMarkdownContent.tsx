import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightCode } from '../../utils/codeHighlight';

type StreamingBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; lang: string; text: string; closed: boolean }
  | { type: 'table'; headers: string[]; rows: string[][]; pendingRow?: string[]; provisional: boolean };

const INLINE_REMARK_PLUGINS = [remarkGfm];

function isCodeFence(line: string): boolean {
  return /^```/.test(line.trim());
}

function getFenceLang(line: string): string {
  return line.trim().replace(/^```/, '').trim();
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableCandidate(line: string): boolean {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return splitTableRow(line).length > 1 && pipeCount >= 2;
}

function isLikelyPartialTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const withoutPipes = trimmed.replace(/\|/g, '').trim();
  return withoutPipes.length > 0 && /^:?-*:?\s*$/.test(withoutPipes);
}

function parseStreamingMarkdown(text: string): StreamingBlock[] {
  const lines = String(text || '').split(/\r?\n/);
  const blocks: StreamingBlock[] = [];
  let i = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const textValue = paragraphLines.join('\n').trim();
    if (textValue) blocks.push({ type: 'paragraph', text: textValue });
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isCodeFence(line)) {
      const lang = getFenceLang(line);
      const codeLines: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (isCodeFence(current)) {
          closed = true;
          i += 1;
          break;
        }
        codeLines.push(current);
        i += 1;
      }
      blocks.push({ type: 'code', lang, text: codeLines.join('\n'), closed });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    const listMatch = trimmed.match(/^((?:[-*+])|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = (lines[i] ?? '').trim().match(/^((?:[-*+])|\d+\.)\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[2]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (isTableCandidate(line)) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      let pendingRow: string[] | undefined;
      let provisional = true;
      i += 1;
      if (i < lines.length && (isTableSeparator(lines[i] ?? '') || isLikelyPartialTableSeparator(lines[i] ?? ''))) {
        provisional = !isTableSeparator(lines[i] ?? '');
        i += 1;
      }
      while (i < lines.length && isTableCandidate(lines[i] ?? '')) {
        if (isTableSeparator(lines[i] ?? '') || isLikelyPartialTableSeparator(lines[i] ?? '')) {
          provisional = !isTableSeparator(lines[i] ?? '');
          i += 1;
          continue;
        }
        const row = splitTableRow(lines[i] ?? '');
        const isLastLine = i === lines.length - 1;
        if (isLastLine && !(lines[i] ?? '').trim().endsWith('|')) {
          pendingRow = row;
        } else {
          rows.push(row);
        }
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows, pendingRow, provisional });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (isCodeFence(current) || currentTrimmed.startsWith('>')) break;
      if (currentTrimmed.match(/^((?:[-*+])|\d+\.)\s+(.*)$/)) break;
      if (currentTrimmed.match(/^(#{1,6})\s+(.+)$/)) break;
      if (isTableCandidate(current)) break;
      paragraphLines.push(current);
      i += 1;
    }
    pushParagraph(paragraphLines);
  }

  return blocks;
}

function InlineMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={INLINE_REMARK_PLUGINS} components={{ p: ({ children }) => <>{children}</> }}>
      {text || ''}
    </ReactMarkdown>
  );
}

export const StreamingMarkdownContent = memo(function StreamingMarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseStreamingMarkdown(content), [content]);

  return (
    <div className="msg-content msg-content-streaming-md">
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          const highlighted = highlightCode(block.text, block.lang || 'text');
          return (
            <div key={idx} className={`stream-md-code ${block.closed ? 'is-closed' : 'is-open'}`}>
              <div className="stream-md-code__bar">
                <span>{block.lang || 'code'}</span>
                {!block.closed && <span className="stream-md-live">streaming</span>}
              </div>
              <pre>
                <code
                  className="oct-prism-code"
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </pre>
            </div>
          );
        }

        if (block.type === 'table') {
          const allRows = block.pendingRow ? [...block.rows, block.pendingRow] : block.rows;
          return (
            <div key={idx} className={`stream-md-table-wrap${block.provisional ? ' is-provisional' : ''}`}>
              <table className="stream-md-table">
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIdx) => <th key={cellIdx}><InlineMarkdown text={cell} /></th>)}
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className={block.pendingRow && rowIdx === allRows.length - 1 ? 'is-pending' : undefined}>
                      {block.headers.map((_, cellIdx) => <td key={cellIdx}><InlineMarkdown text={row[cellIdx] || ''} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'heading') {
          const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
          return <Tag key={idx} className="stream-md-heading"><InlineMarkdown text={block.text} /></Tag>;
        }

        if (block.type === 'blockquote') {
          return <blockquote key={idx} className="stream-md-quote"><InlineMarkdown text={block.text} /></blockquote>;
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={idx} className="stream-md-list">
              {block.items.map((item, itemIdx) => <li key={itemIdx}><InlineMarkdown text={item} /></li>)}
            </ListTag>
          );
        }

        return <p key={idx} className="stream-md-paragraph"><InlineMarkdown text={block.text} /></p>;
      })}
    </div>
  );
});

export default StreamingMarkdownContent;
