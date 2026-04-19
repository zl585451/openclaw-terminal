const fs = require('fs');
const path = require('path');
const { isLocalInternalRequest, readJsonBody } = require('./helpers');
const { streamChat } = require('../ai');

const SCRIPT_FORMAT_SYSTEM_PROMPT = `你是剧本格式化助手。用户会给你一段未标准化的剧本原文，请按以下 OCT 标准格式重新输出：

【格式规范】
1. 章节标题：「第X幕：章节名称」，独占一行，前后各空一行
2. 场景指令：「【场景】描述」「【配乐】描述」「【音效】描述」
3. 角色台词格式1：「角色名：台词内容」（全角冒号）
4. 角色台词格式2：「【角色名】（情绪说明）台词内容」
5. 旁白：「【旁白】旁白内容」或「旁白：旁白内容」
6. 导演备注：「★★ 备注内容」
7. 正文/叙述段落：原样保留

【规则】
- 统一使用全角冒号「：」
- 统一使用全角圆括号「（）」标注情绪
- 保持角色名简洁（去掉多余标签如 OS、内心 等，但可保留到情绪说明）
- 如果原文没有明确章节分隔，不要强行创造章节
- 不要修改台词内容本身，只调整格式
- 只保留“可直接演出/朗读”的剧本正文，删除方案说明、评注、提纲、教程文字
- 删除 markdown 列表/标题/代码块标记（如 #、-、1.、三反引号代码围栏）
- 不要添加任何解释，只输出格式化后的剧本文本`;

function runOneShotCompletion(messages) {
  return new Promise((resolve, reject) => {
    streamChat({
      messages,
      toolChoice: 'none',
      onDelta: () => {},
      onToolEvent: () => {},
      onDone: (reply) => resolve(String(reply || '')),
      onError: (err) => reject(err),
    });
  });
}

function createHttpRequestHandler({
  memory,
  memoryManagementAgent,
  reviewQueueActions,
  toolLoader,
  mcpManager,
  mobileHtmlPath = path.join(__dirname, '..', 'mobile.html'),
}) {
  return async function handleTransportHttpRequest(req, res) {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'oct-vault' }));
      return true;
    }

    if (req.url?.startsWith('/internal/memory/')) {
      if (!isLocalInternalRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'internal_endpoint_local_only' }));
        return true;
      }

      if (req.method === 'GET' && req.url === '/internal/memory/governance/latest') {
        memory.readMemory('core://agent/governance/latest', { treat404AsDebug: true })
          .then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          })
          .catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
          });
        return true;
      }

      if (req.method === 'POST' && req.url === '/internal/memory/governance/run') {
        readJsonBody(req).then(async (body) => {
          const result = await memoryManagementAgent.runMemoryGovernancePass(body || {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result }));
        }).catch((e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
        });
        return true;
      }

      if (req.method === 'POST' && req.url === '/internal/memory/review-action') {
        readJsonBody(req).then(async (body) => {
          const action = String(body?.action || '').trim();
          const uri = String(body?.uri || '').trim();
          let result;

          if (action === 'approve') {
            result = await reviewQueueActions.approveReviewCandidate(uri, body || {});
          } else if (action === 'reject') {
            result = await reviewQueueActions.rejectReviewCandidate(uri, body || {});
          } else if (action === 'archive') {
            result = await reviewQueueActions.archiveReviewCandidate(uri, body || {});
          } else if (action === 'merge') {
            result = await reviewQueueActions.mergeReviewCandidate(uri, body || {});
          } else {
            result = { ok: false, error: 'unsupported_review_action' };
          }

          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }).catch((e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
        });
        return true;
      }
    }

    if (req.method === 'POST' && req.url === '/tool') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { tool, args } = JSON.parse(body || '{}');
          const result = await toolLoader.executeTool(tool, args || {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
        }
      });
      return true;
    }

    if (req.method === 'POST' && req.url === '/api/polish') {
      readJsonBody(req).then(async (body) => {
        const text = String(body?.text || '').trim();
        const instruction = String(body?.instruction || '请润色以下台词，保持角色语气和风格，使表达更生动自然。').trim();

        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'text is required' }));
          return;
        }

        const messages = [
          {
            role: 'system',
            content: '你是专业剧本编辑。请严格保持原意与人设，只输出润色后的文本，不要解释。',
          },
          {
            role: 'user',
            content: `${instruction}\n\n原文：\n${text}`,
          },
        ];

        const reply = await runOneShotCompletion(messages);
        const cleaned = String(reply || '')
          .replace(/\[cot\][\s\S]*?\[\/cot\]/g, '')
          .trim();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          result: cleaned,
        }));
      }).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
      });
      return true;
    }

    if (req.method === 'POST' && req.url === '/api/script-format') {
      readJsonBody(req).then(async (body) => {
        const text = String(body?.text || '');
        const chapterTitles = Array.isArray(body?.chapterTitles)
          ? body.chapterTitles.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 30)
          : [];
        if (!text.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'text is required' }));
          return;
        }

        const truncated = text.slice(0, 10000);
        const chapterConstraint = chapterTitles.length > 0
          ? `\n【章节保留约束】\n请保留这些章节标题（可微调标点，但不能丢失章节结构）：\n${chapterTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
          : '';
        const messages = [
          { role: 'system', content: `${SCRIPT_FORMAT_SYSTEM_PROMPT}${chapterConstraint}` },
          { role: 'user', content: truncated },
        ];

        const reply = await runOneShotCompletion(messages);
        const cleaned = String(reply || '')
          .replace(/\[cot\][\s\S]*?\[\/cot\]/g, '')
          .trim();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result: cleaned }));
      }).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
      });
      return true;
    }

    if (req.method === 'GET' && req.url === '/mcp/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mcpManager.getStatus()));
      return true;
    }

    if (req.method === 'POST' && req.url === '/mcp/server') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const name = parsed.name;
          let command;
          let args;
          let env;
          if (parsed.config && typeof parsed.config === 'object') {
            ({ command, args, env } = parsed.config);
          } else {
            ({ command, args, env } = parsed);
          }
          const serverConfig = { command, args, env: env || {} };
          const status = await mcpManager.addServer(name, serverConfig);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return true;
    }

    if (req.method === 'DELETE' && req.url?.startsWith('/mcp/server/')) {
      const name = req.url.replace('/mcp/server/', '');
      mcpManager.removeServer(name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (req.url === '/' || req.url === '/mobile') {
      try {
        const html = fs.readFileSync(mobileHtmlPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (e) {
        res.writeHead(500);
        res.end('mobile.html not found: ' + e.message);
      }
      return true;
    }

    return false;
  };
}

module.exports = createHttpRequestHandler;
