// 修复版 parseTaggedContent - 解决 pills 标签内代码框断节问题

/** 解析成对标签 [pills]...[/pills] 等，返回按顺序排列的渲染段 */
function parseTaggedContent(content: string): { segments: RenderSegment[]; found: boolean } {
  PAIRED_TAG_RX.lastIndex = 0;
  const allMatches = [...content.matchAll(PAIRED_TAG_RX)];
  
  if (allMatches.length === 0) return { segments: [], found: false };

  const codeRanges = getCodeBlockRanges(content);
  const matches = codeRanges.length > 0
    ? allMatches.filter(m => !isInsideCodeBlock(m.index!, codeRanges))
    : allMatches;

  if (matches.length === 0) return { segments: [], found: false };

  const segments: RenderSegment[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    const matchStart = m.index!;
    const matchEnd = matchStart + m[0].length;

    const textBefore = content.slice(lastIndex, matchStart);
    
    if (textBefore.trim()) {
      // 【修复 A】textBefore 不经过 filterExpectedEffect，避免误删代码块
      segments.push({ type: 'text', content: textBefore, options: [] });
    }

    const tagType = m[1].toLowerCase() as SegmentType;
    const inner = m[2].trim();

    switch (tagType) {
      case 'text':
        // 【修复 B】text 标签内容也不过滤
        if (inner) segments.push({ type: 'text', content: inner, options: [] });
        break;
      
      case 'pills': {
        // 1. 提取选项按钮
        let opts = parseSymbolOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        
        // 2. 【修复 C】保留完整的 inner 内容作为 text segment，不做任何过滤
        // 这样代码块、表格、列表都能完整保留
        if (opts.length > 0) {
          segments.push({ 
            type: 'pills', 
            content: '', 
            options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) 
          });
        }
        
        // 3. 将 pills 标签内的剩余内容（含代码块、表格等）作为 text segment
        // 不再尝试分离选项行，而是保留完整格式
        if (inner.length > 0) {
          segments.push({ type: 'text', content: inner, options: [] });
        }
        break;
      }
      
      case 'checkbox': {
        let opts = parseCheckboxOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: 'checkbox', content: inner, options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
      
      case 'question': {
        let opts = parseNumberedOptions(inner);
        if (opts.length < 2) opts = parseLineOptions(inner);
        if (opts.length < 2) opts = parsePipeSeparatedOptions(inner);
        if (opts.length < 2) opts = parsePlainLines(inner);
        const qOpts = opts.filter(o => isQuestionLabel(o.label));
        const finalOpts = qOpts.length >= 2 ? qOpts : opts;
        segments.push({ type: 'question', content: inner, options: finalOpts.map((o, i) => ({ ...o, num: i + 1, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
      
      case 'tasklist': {
        let opts = parseCheckboxOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: 'tasklist', content: inner, options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
    }

    lastIndex = matchEnd;
  }

  // 处理剩余内容
  const textAfter = content.slice(lastIndex);
  if (textAfter.trim()) {
    segments.push({ type: 'text', content: textAfter, options: [] });
  }

  return { segments, found: true };
}
