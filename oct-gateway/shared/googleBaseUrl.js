'use strict';

/**
 * Gemini OpenAI 兼容层：请求通过 `x-goog-api-key` 等头传递密钥（见 oct-gateway/ai.js、Electron 设置内探测）。
 * Base URL 若带 `?key=` 会与头里 API Key 重复，触发 400（Multiple authentication credentials）。
 *
 * @param {string} url
 * @returns {string}
 */
function sanitizeGoogleOpenAiBaseUrl(url) {
  const s = String(url || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    const isGoogleEndpoint =
      host.includes('generativelanguage.googleapis.com')
      || host.includes('aiplatform.googleapis.com');
    if (!isGoogleEndpoint) {
      return s.replace(/\/$/, '');
    }
    u.search = '';
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return s.split('?')[0].split('#')[0].trim().replace(/\/$/, '');
  }
}

module.exports = { sanitizeGoogleOpenAiBaseUrl };
