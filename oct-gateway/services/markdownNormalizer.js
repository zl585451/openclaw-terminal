'use strict';

const FENCE_RE = /^(\s*)```([^\r\n`]*)\s*$/;
const COMMAND_RE = /^(?:git|npm|npx|node|pnpm|yarn|cd|dir|ls|Get-|Set-|Remove-|Copy-|Move-|New-|Test-|Select-|Where-|Invoke-|Start-|Stop-|\$env:|netstat\b|tasklist\b|taskkill\b)/i;
const EXPLANATION_RE = /^\s*(?:\d+[.)]\s+)?(?:\*\*)?[^`\r\n]{1,100}(?:：|:)(?:\*\*)?\s*$/;

function normalizeAssistantMarkdown(input) {
  const text = String(input || '');
  if (!text) return text;

  const normalizedFences = normalizeFencedBlocks(text);
  return normalizeTableSpacing(normalizedFences);
}

function normalizeFencedBlocks(text) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let inFence = false;
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(FENCE_RE);

    if (!inFence && match) {
      const language = normalizeFenceLanguage(match[2] || '', collectFencePreview(lines, i + 1));
      output.push(`${match[1]}\`\`\`${language}`);
      inFence = true;
      fence = { language, startOutputIndex: output.length - 1, content: [] };
      continue;
    }

    if (inFence && match) {
      const replacement = maybeSplitExplanationFence(fence);
      if (replacement) {
        output.splice(fence.startOutputIndex, output.length - fence.startOutputIndex, ...replacement);
      } else {
        output.push('```');
      }
      inFence = false;
      fence = null;
      continue;
    }

    if (inFence) {
      fence.content.push(line);
      output.push(line);
      continue;
    }

    output.push(line);
  }

  if (inFence && fence) {
    const replacement = maybeSplitExplanationFence(fence);
    if (replacement) {
      output.splice(fence.startOutputIndex, output.length - fence.startOutputIndex, ...replacement);
    } else {
      output.push('```');
    }
  }

  return output.join('\n');
}

function collectFencePreview(lines, startIndex) {
  const preview = [];
  for (let i = startIndex; i < lines.length && preview.length < 6; i += 1) {
    if (FENCE_RE.test(lines[i])) break;
    preview.push(lines[i]);
  }
  return preview;
}

function normalizeFenceLanguage(rawLanguage, previewLines = []) {
  const language = String(rawLanguage || '').trim().toLowerCase();
  if (language === 'code' || language === 'shell' || language === 'sh' || language === 'cmd' || !language) {
    return inferFenceLanguage(previewLines);
  }
  if (language === 'javascript') return 'js';
  if (language === 'typescript') return 'ts';
  if (language === 'txt' || language === 'log') return 'text';
  return language;
}

function inferFenceLanguage(lines = []) {
  const meaningful = lines.map((line) => line.trim()).filter(Boolean);
  if (meaningful.some((line) => line.startsWith('{') || line.startsWith('['))) return 'json';
  if (meaningful.some((line) => /^\s*(const|let|var|function|import|export)\b/.test(line))) return 'js';
  if (meaningful.some((line) => COMMAND_RE.test(line))) {
    return meaningful.some((line) => /^(?:Get-|Set-|Remove-|Copy-|Move-|New-|Test-|Select-|Where-|Invoke-|Start-|Stop-|\$env:)/i.test(line))
      ? 'powershell'
      : 'bash';
  }
  return 'text';
}

function maybeSplitExplanationFence(fence) {
  const content = fence.content || [];
  if (content.length < 2) return null;
  const firstNonEmptyIndex = content.findIndex((line) => line.trim());
  if (firstNonEmptyIndex !== 0) return null;

  const first = content[0];
  const rest = content.slice(1);
  const meaningfulRest = rest.map((line) => line.trim()).filter(Boolean);
  if (!EXPLANATION_RE.test(first) || meaningfulRest.length === 0) return null;
  if (!meaningfulRest.some((line) => COMMAND_RE.test(line))) return null;

  const language = inferFenceLanguage(meaningfulRest);
  return [
    first.replace(/^\s*\d+[.)]\s+/, '').replace(/^\*\*|\*\*$/g, '').trim(),
    '',
    `\`\`\`${language}`,
    ...rest,
    '```',
  ];
}

function normalizeTableSpacing(text) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let inFence = false;
  let previousWasTable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      output.push(line);
      previousWasTable = false;
      continue;
    }

    const isTable = !inFence && isMarkdownTableLine(line);
    if (isTable && output.length > 0 && output[output.length - 1].trim() !== '' && !previousWasTable) {
      output.push('');
    }
    if (!isTable && previousWasTable && line.trim() !== '') {
      output.push('');
    }
    output.push(line);
    previousWasTable = isTable;
  }

  return output.join('\n');
}

function isMarkdownTableLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  return trimmed.split('|').length >= 4;
}

module.exports = {
  normalizeAssistantMarkdown,
  normalizeFenceLanguage,
  normalizeTableSpacing,
};
