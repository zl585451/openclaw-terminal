'use strict';

/**
 * OmniRoute 最小化 ToolAdapter 格式治理模块 (Phase 6 返工)
 *
 * 职责：
 * - 清洗 Markdown Code Fence 语法包裹 (如 ```json ... ```)
 * - 纠正对象/数组尾部多余的逗号 (trailing commas)
 * - 诊断检测截断的 JSON 字符串并安全拒绝，绝不进行不安全的自动补齐或执行
 * - 失败时给予清晰的解析异常报告，绝不引发死循环
 */

/**
 * 诊断并检测 JSON 是否因 Token 溢出截断而残缺
 * @param {string} str - 原始 JSON 字符串
 * @returns {boolean} 是否被截断
 */
function detectTruncatedJson(str) {
  let s = str.trim();
  if (!s) return false;

  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        const top = stack[stack.length - 1];
        if ((char === '}' && top === '{') || (char === ']' && top === '[')) {
          stack.pop();
        }
      }
    }
  }

  return inString || stack.length > 0 || s.endsWith('\\');
}

/**
 * 治理、清洗并安全解析大模型生成的工具参数
 * @param {string} argumentsStr - 原始参数 JSON 字符串
 * @returns {object} 解析出的对象
 * @throws {Error} TOOL_PARAMS_PARSE_FAILED 包含清洗及检测失败的说明
 */
function cleanAndParseArguments(argumentsStr) {
  let cleaned = String(argumentsStr || '').trim();
  if (!cleaned) {
    return {};
  }

  // 1. 清洗 Markdown 标记块
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
  }

  // 2. 清洗尾部多余逗号 (trailing commas)
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  // 3. 尝试解析
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // 4. 解析失败，诊断是否截断，抛出明确错误，不自动修复
    const isTruncated = detectTruncatedJson(cleaned);
    const errorType = isTruncated ? 'truncated_or_malformed_json' : 'malformed_json';
    throw new Error(`TOOL_PARAMS_PARSE_FAILED: ${errorType}. Details: ${firstErr.message}. Original arguments: "${argumentsStr}"`);
  }
}

module.exports = {
  detectTruncatedJson,
  cleanAndParseArguments,
};
