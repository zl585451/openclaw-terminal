function createPseudoToolCompat({ toolLoader, logger }) {
  function buildToolSignature(toolCalls) {
    return JSON.stringify(
      (toolCalls || [])
        .filter(Boolean)
        .map((tc) => ({
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        }))
    );
  }

  function decodePseudoToolValue(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('"') && value.endsWith('"')) {
      try { return JSON.parse(value); } catch { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1).replace(/\\'/g, '\'').replace(/\\"/g, '"');
    }
    return value;
  }

  function parsePseudoToolArgs(blockText) {
    const args = {};
    const text = String(blockText || '');
    const flagRe = /--([a-zA-Z][\w-]*)\s+/g;
    let match;
    while ((match = flagRe.exec(text)) !== null) {
      const key = match[1];
      const valueStart = flagRe.lastIndex;
      const nextMatch = flagRe.exec(text);
      const valueEnd = nextMatch ? nextMatch.index : text.length;
      const rawValue = text.slice(valueStart, valueEnd).trim();
      args[key] = decodePseudoToolValue(rawValue);
      if (nextMatch) {
        flagRe.lastIndex = nextMatch.index;
      }
    }
    return args;
  }

  function extractRubyPseudoToolCalls(text) {
    const source = String(text || '');
    if (!source || !/tool\s*=>/i.test(source) || !/args\s*=>/i.test(source)) {
      return [];
    }

    const blocks = [];
    const headerRe = /\{tool\s*=>\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z_][\w-]*))\s*,\s*args\s*=>\s*\{/gi;
    let header;

    while ((header = headerRe.exec(source)) !== null) {
      const toolName = header[1] || header[2] || header[3] || '';
      const argsOpenBracePos = source.indexOf('{', header.index + header[0].lastIndexOf('args'));
      if (argsOpenBracePos < 0) continue;

      let depth = 0;
      let inString = false;
      let escaped = false;
      let quoteChar = '"';
      let i = argsOpenBracePos;
      let argsClosePos = -1;

      for (; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === quoteChar) {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === "'") {
          inString = true;
          quoteChar = ch;
          continue;
        }
        if (ch === '{') {
          depth += 1;
          continue;
        }
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            argsClosePos = i;
            break;
          }
        }
      }

      if (argsClosePos < 0) continue;

      const argsBlock = source.slice(argsOpenBracePos + 1, argsClosePos);
      const parsedArgs = parsePseudoToolArgs(argsBlock);
      if (!parsedArgs.action) continue;

      blocks.push({
        id: `pseudo-${Date.now()}-${blocks.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(parsedArgs),
        },
      });
    }

    return blocks;
  }

  function findBalancedJsonObjectSlice(s, fromIndex) {
    const start = s.indexOf('{', fromIndex);
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quoteChar = '"';
    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return { start, end: i + 1, jsonStr: s.slice(start, i + 1) };
        }
      }
    }
    return null;
  }

  function extractKimiStylePseudoToolCalls(text) {
    const source = String(text || '');
    if (!source || !/tool_calls_section_begin/i.test(source)) {
      return [];
    }
    const sectionRe = /<\|[^|]*tool_calls_section_begin[^|]*\|>([\s\S]*?)<\|[^|]*tool_calls_section_end[^|]*\|>/gi;
    const calls = [];
    let sec;
    while ((sec = sectionRe.exec(source)) !== null) {
      const inner = sec[1];
      const argSep = /<\|[^|]*tool_call_argument_begin[^|]*\|>/i;
      const am = inner.match(argSep);
      if (!am || am.index === undefined) continue;
      const jsonFrom = inner.slice(am.index + am[0].length);
      const hit = findBalancedJsonObjectSlice(jsonFrom, 0);
      if (!hit) continue;
      let obj;
      try {
        obj = JSON.parse(hit.jsonStr);
      } catch {
        continue;
      }
      const toolName = obj.name || (obj.function && obj.function.name);
      const args = obj.arguments !== undefined ? obj.arguments : (obj.args !== undefined ? obj.args : undefined);
      if (!toolName) continue;
      const argString = typeof args === 'string' ? args : JSON.stringify(args || {});
      calls.push({
        id: `pseudo-kimi-${Date.now()}-${calls.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: argString,
        },
      });
    }
    return calls;
  }

  function extractXmlPseudoToolCalls(text) {
    const source = String(text || '');
    if (!source || !/<tool_call>/i.test(source)) {
      return [];
    }
    const knownToolNames = new Set(
      (toolLoader.getDefinitions?.() || [])
        .map((def) => String(def?.function?.name || '').trim())
        .filter(Boolean)
    );

    const callRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
    const calls = [];
    let match;
    while ((match = callRe.exec(source)) !== null) {
      const block = String(match[1] || '').trim();

      const fnMatch = block.match(/<function=([a-zA-Z0-9_.-]+)>/i);
      if (fnMatch?.[1]) {
        const toolName = String(fnMatch[1]).trim();
        const args = {};
        const paramRe = /<parameter-([a-zA-Z0-9_-]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
        let pm;
        while ((pm = paramRe.exec(block)) !== null) {
          const key = String(pm[1] || '').trim();
          const rawVal = String(pm[2] || '').trim();
          if (!key) continue;
          args[key] = rawVal;
        }

        if (args.type && !args.artifactType) {
          args.artifactType = args.type;
          delete args.type;
        }
        if (
          toolName === 'canvas' &&
          String(args.action || '').toLowerCase() === 'update' &&
          !args.documentId
        ) {
          args.action = 'create';
        }

        calls.push({
          id: `pseudo-xml-${Date.now()}-${calls.length}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        });
        continue;
      }

      const jsonHit = findBalancedJsonObjectSlice(block, 0);
      if (jsonHit) {
        let obj;
        try { obj = JSON.parse(jsonHit.jsonStr); } catch { continue; }
        const toolName = obj.name || obj.function?.name;
        if (!toolName || !knownToolNames.has(String(toolName))) continue;

        let args = obj.arguments ?? obj.args ?? obj.parameters ?? {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch {}
        }

        if (
          toolName === 'canvas' &&
          typeof args === 'object' && args !== null &&
          String(args.action || '').toLowerCase() === 'update' &&
          !args.documentId
        ) {
          args.action = 'create';
        }

        calls.push({
          id: `pseudo-xml-json-${Date.now()}-${calls.length}`,
          type: 'function',
          function: {
            name: String(toolName),
            arguments: typeof args === 'string' ? args : JSON.stringify(args || {}),
          },
        });
      }
    }

    return calls;
  }

  function getKnownToolNames() {
    return new Set(
      (toolLoader.getDefinitions?.() || [])
        .map((def) => String(def?.function?.name || '').trim())
        .filter(Boolean)
    );
  }

  function isRegisteredToolName(toolName) {
    const normalized = String(toolName || '').trim();
    if (!normalized) return false;
    return getKnownToolNames().has(normalized);
  }

  function extractBracketToolCodePseudoToolCalls(text) {
    const source = String(text || '');
    if (!source || !/<tool_code>/i.test(source)) {
      return [];
    }
    const calls = [];
    const callRe = /\[([a-zA-Z0-9_.-]+)\]\s*<tool_code>\s*([\s\S]*?)\s*<\/tool_code>/gi;
    let match;
    while ((match = callRe.exec(source)) !== null) {
      const toolName = String(match[1] || '').trim();
      if (!toolName) continue;
      if (!isRegisteredToolName(toolName)) continue;

      const block = String(match[2] || '').trim();
      const jsonHit = findBalancedJsonObjectSlice(block, 0);
      if (!jsonHit) continue;

      let args;
      try {
        args = JSON.parse(jsonHit.jsonStr);
      } catch {
        continue;
      }

      calls.push({
        id: `pseudo-bracket-tool-code-${Date.now()}-${calls.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(args || {}),
        },
      });
    }
    return calls;
  }

  function extractPseudoToolCalls(text) {
    const bracketToolCode = extractBracketToolCodePseudoToolCalls(text);
    if (bracketToolCode.length > 0) return bracketToolCode;
    const ruby = extractRubyPseudoToolCalls(text);
    if (ruby.length > 0) return ruby;
    const kimi = extractKimiStylePseudoToolCalls(text);
    if (kimi.length > 0) return kimi;
    return extractXmlPseudoToolCalls(text);
  }

  function tryParseJsonWithSingleQuotes(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(String(raw).replace(/'/g, '"'));
      } catch {
        return null;
      }
    }
  }

  function extractFunctionStyleToolCalls(text) {
    const source = String(text || '');
    if (!source) return [];

    const knownTools = [
      'canvas',
      'read_file',
      'read_document',
      'write_file',
      'web_search',
      'web_fetch',
      'memory_write',
      'memory_search',
      'memory_read',
      'memory_vector_search',
      'exec_command',
    ];
    const toolPattern = new RegExp(`(?:^|\\n|\\s)(${knownTools.join('|')})\\s*\\(`, 'g');
    const calls = [];
    let match;

    while ((match = toolPattern.exec(source)) !== null) {
      const toolName = match[1];
      const openParenPos = source.indexOf('(', match.index + toolName.length);
      if (openParenPos < 0) continue;

      let depth = 0;
      let inString = false;
      let escaped = false;
      let quoteChar = '"';
      let closeParenPos = -1;
      for (let i = openParenPos; i < source.length; i += 1) {
        const ch = source[i];
        if (inString) {
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === quoteChar) inString = false;
          continue;
        }
        if (ch === '"' || ch === "'") { inString = true; quoteChar = ch; continue; }
        if (ch === '(') { depth += 1; continue; }
        if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            closeParenPos = i;
            break;
          }
        }
      }
      if (closeParenPos < 0) continue;

      const argsStr = source.slice(openParenPos + 1, closeParenPos).trim();
      const lastBraceStart = argsStr.lastIndexOf('{');
      if (lastBraceStart < 0) continue;

      let braceDepth = 0;
      let inObjString = false;
      let escapedObj = false;
      let objQuoteChar = '"';
      let braceEnd = -1;
      for (let i = lastBraceStart; i < argsStr.length; i += 1) {
        const ch = argsStr[i];
        if (inObjString) {
          if (escapedObj) { escapedObj = false; continue; }
          if (ch === '\\') { escapedObj = true; continue; }
          if (ch === objQuoteChar) inObjString = false;
          continue;
        }
        if (ch === '"' || ch === "'") { inObjString = true; objQuoteChar = ch; continue; }
        if (ch === '{') { braceDepth += 1; continue; }
        if (ch === '}') {
          braceDepth -= 1;
          if (braceDepth === 0) {
            braceEnd = i;
            break;
          }
        }
      }
      if (braceEnd < 0) continue;

      const jsonStr = argsStr.slice(lastBraceStart, braceEnd + 1);
      const parsedArgs = tryParseJsonWithSingleQuotes(jsonStr);
      if (!parsedArgs || typeof parsedArgs !== 'object') continue;

      const prefix = argsStr.slice(0, lastBraceStart);
      const positionalArgs = prefix
        .split(',')
        .map((s) => String(s || '').trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length > 0);

      if (toolName === 'canvas' && positionalArgs.length > 0) {
        if (!parsedArgs.action && positionalArgs[0]) parsedArgs.action = positionalArgs[0];
        if (!parsedArgs.title && positionalArgs[1]) parsedArgs.title = positionalArgs[1];
        if (!parsedArgs.artifactType && positionalArgs[2]) parsedArgs.artifactType = positionalArgs[2];
      }

      calls.push({
        id: `pseudo-fn-${Date.now()}-${calls.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(parsedArgs),
        },
      });
    }

    return calls;
  }

  function extractBracketTagPseudoToolCalls(text) {
    const source = String(text || '');
    if (!source) return [];

    const callRe = /\[([a-zA-Z0-9_.-]+)\]([\s\S]*?)\[\/\1\]/gi;
    const calls = [];
    let match;

    while ((match = callRe.exec(source)) !== null) {
      const toolName = String(match[1] || '').trim();
      if (!toolName || !isRegisteredToolName(toolName)) continue;

      const rawBody = String(match[2] || '').trim();
      if (!rawBody) continue;

      const args = {};
      const lines = rawBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*([\s\S]+)$/);
        if (!kv) continue;
        const key = String(kv[1] || '').trim();
        const value = String(kv[2] || '').trim();
        if (!key || !value) continue;
        args[key] = value;
      }

      if (Object.keys(args).length === 0) {
        if (toolName === 'web_search' || toolName === 'memory_search' || toolName === 'memory_vector_search') {
          args.query = rawBody.replace(/^query\s*:\s*/i, '').trim();
        } else if (toolName === 'web_fetch') {
          args.url = rawBody.replace(/^url\s*:\s*/i, '').trim();
        } else if (toolName === 'read_file' || toolName === 'read_document') {
          args.path = rawBody.replace(/^(path|file_path)\s*:\s*/i, '').trim();
        } else if (toolName === 'write_file') {
          args.path = rawBody.replace(/^(path|file_path)\s*:\s*/i, '').trim();
        }
      }

      if (Object.keys(args).length === 0 || Object.values(args).some((value) => !String(value || '').trim())) {
        continue;
      }

      calls.push({
        id: `pseudo-bracket-tag-${Date.now()}-${calls.length}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      });
    }

    return calls;
  }

  function extractAllPseudoToolCalls(text) {
    const legacy = extractPseudoToolCalls(text);
    const rawCalls = legacy.length > 0
      ? legacy
      : (() => {
          const bracketTagCalls = extractBracketTagPseudoToolCalls(text);
          if (bracketTagCalls.length > 0) return bracketTagCalls;
          return extractFunctionStyleToolCalls(text);
        })();

    const validCalls = [];
    for (const call of rawCalls) {
      const toolName = String(call?.function?.name || '').trim();
      if (!toolName) {
        logger.warn('Pseudo tool call intercepted: empty tool name');
        continue;
      }

      if (!isRegisteredToolName(toolName)) {
        logger.warn('Pseudo tool call intercepted: tool is not registered or allowed', { toolName });
        continue;
      }

      try {
        const argsStr = call?.function?.arguments;
        if (typeof argsStr === 'string') {
          JSON.parse(argsStr);
        } else {
          throw new Error('arguments is not a string');
        }
      } catch (error) {
        logger.warn('Pseudo tool call intercepted: invalid parameter structure', { toolName, error: error.message });
        continue;
      }

      validCalls.push(call);
    }

    return validCalls;
  }

  function hasPseudoToolResidue(text) {
    const source = String(text || '');
    if (!source.trim()) return false;
    return (
      /<tool_call>/i.test(source) ||
      /<tool_code>/i.test(source) ||
      /<function=\w+>/i.test(source) ||
      /tool_calls_section_begin/i.test(source) ||
      /\[[a-zA-Z0-9_.-]+\]\s*<tool_code>/i.test(source) ||
      /\[[a-zA-Z0-9_.-]+\][\s\S]*?\[\/[a-zA-Z0-9_.-]+\]/i.test(source)
    );
  }

  function stripPseudoToolResidue(text) {
    const source = String(text || '');
    if (!source.trim()) return source;

    return source
      .replace(/<\|[^|]*tool_calls_section_begin[^|]*\|>[\s\S]*?<\|[^|]*tool_calls_section_end[^|]*\|>/gi, '')
      .replace(/\[[a-zA-Z0-9_.-]+\]\s*<tool_code>[\s\S]*?<\/tool_code>/gi, '')
      .replace(/\[[a-zA-Z0-9_.-]+\][\s\S]*?\[\/[a-zA-Z0-9_.-]+\]/gi, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
      .replace(/<function=\w+>[\s\S]*?(?=(?:<function=\w+>|$))/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return {
    buildToolSignature,
    extractAllPseudoToolCalls,
    hasPseudoToolResidue,
    stripPseudoToolResidue,
  };
}

module.exports = {
  createPseudoToolCompat,
};
