module.exports = {
  name: 'http_request',
  definition: {
    type: 'function',
    function: {
      name: 'http_request',
      description: '发送 HTTP 请求调用外部 API。支持 GET/POST/PUT/DELETE，可携带自定义 Headers 和 Body。用于对接第三方平台、调用开放 API、获取结构化数据。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '请求 URL' },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            description: '请求方法，默认 GET'
          },
          headers: {
            type: 'object',
            description: '请求头，如 {"Authorization": "Bearer xxx", "Content-Type": "application/json"}'
          },
          body: {
            description: '请求体，对象或字符串（POST/PUT 时使用）'
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒），默认 15000'
          },
          responseType: {
            type: 'string',
            enum: ['json', 'text', 'auto'],
            description: '响应解析方式，默认 auto（自动判断）'
          }
        },
        required: ['url']
      }
    }
  },
  execute: async ({ url, method = 'GET', headers = {}, body, timeout = 15000, responseType = 'auto' }) => {
    try {
      const options = {
        method,
        headers: {
          'User-Agent': 'OCT-Gateway/1.0',
          ...headers,
        },
        signal: AbortSignal.timeout(timeout),
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        if (typeof body === 'object') {
          options.body = JSON.stringify(body);
          if (!options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
          }
        } else {
          options.body = String(body);
        }
      }

      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';

      let data;
      if (responseType === 'json' || (responseType === 'auto' && contentType.includes('json'))) {
        try {
          data = await res.json();
          data = JSON.stringify(data, null, 2).slice(0, 8000);
        } catch {
          data = await res.text().then(t => t.slice(0, 8000));
        }
      } else {
        data = (await res.text()).slice(0, 8000);
      }

      if (!res.ok) {
        return `❌ HTTP ${res.status} ${res.statusText}\n${data}`;
      }

      return `✅ HTTP ${res.status}\n${data}`;

    } catch (e) {
      if (e.name === 'TimeoutError') return `❌ 请求超时（${timeout}ms）：${url}`;
      if (e.message?.includes('ENOTFOUND')) return `❌ 域名解析失败：${url}`;
      return `❌ 请求失败：${e.message}`;
    }
  }
};
