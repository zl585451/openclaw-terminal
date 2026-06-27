'use strict';

/**
 * 从"可能还没收完"的 JSON 字符串里，按 key 名容错地把字符串字段的值抠出来。
 * 用途：SSE 流式 tool_call.arguments 是边生成边拼接的，完整 JSON 在生成结束前
 * 一直是无效的——但里面某个字符串字段（比如 canvas 工具的 content）此刻已经
 * 收到的那一段，仍然值得提前展示给用户看，不必等全部生成完、JSON.parse 成功。
 *
 * 容错策略：
 * - 遇到不完整的转义序列（比如末尾刚好是一个孤立的 \ 或 \u12）就停在那之前，
 *   等下一帧数据补全后再继续解码，不强行猜测。
 * - 遇到一个不带反斜杠的引号，就认为这个字符串值在这里结束——不管引号后面
 *   是不是还有更多 JSON 语法在路上，反正字符串内容已经完整了。
 *
 * 这只用于"实时预览"，不用于真正执行——工具调用真正执行前，仍然走完整
 * JSON.parse() 的那条路（toolLoop.js 里的 cleanAndParseArguments），本函数的
 * 输出哪怕在某一帧里有一两个字符的偏差，也不影响最终落地的内容。
 */
function extractPartialJsonStringField(partialJson, fieldName) {
  const source = String(partialJson || '');
  const marker = `"${fieldName}":"`;
  const idx = source.indexOf(marker);
  if (idx === -1) return undefined;

  let i = idx + marker.length;
  let out = '';
  const ESCAPE_MAP = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      if (i + 1 >= source.length) break; // 转义序列还没收完，先停在这一帧能确定的内容上
      const next = source[i + 1];
      if (next === 'u') {
        if (i + 6 > source.length) break; // \uXXXX 还没收完
        const code = parseInt(source.slice(i + 2, i + 6), 16);
        if (!Number.isNaN(code)) out += String.fromCharCode(code);
        i += 6;
        continue;
      }
      out += ESCAPE_MAP[next] !== undefined ? ESCAPE_MAP[next] : next;
      i += 2;
      continue;
    }
    if (ch === '"') return out; // 无转义的引号：字符串值到此结束
    out += ch;
    i += 1;
  }
  return out; // 没碰到结束引号——目前收到的就是这些，后续帧会继续补
}

// canvas 工具参数里值得提前展示的字符串字段。content 是主角（画布正文），
// 其余几个用于尽早判断渲染方式/标题，不用等全部生成完。
const CANVAS_PREVIEW_FIELDS = ['action', 'documentId', 'title', 'artifactType', 'mode', 'content', 'language'];

function extractPartialCanvasArgs(partialJson) {
  const out = {};
  for (const field of CANVAS_PREVIEW_FIELDS) {
    const value = extractPartialJsonStringField(partialJson, field);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

module.exports = {
  extractPartialJsonStringField,
  extractPartialCanvasArgs,
};
