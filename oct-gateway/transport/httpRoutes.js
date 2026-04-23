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

const SCRIPT_ROLE_DETECT_SYSTEM_PROMPT = `你是小说对话角色识别助手。

你的任务是在“当前章节”中同时做两件事：
1. 识别说话角色，并判断给定引号句属于谁
2. 判断给定的“冒号标签行”哪些更像结构化记录，而不是角色对白

【硬规则】
- 只能做角色识别与归属判断，不能改写原文
- 不能补写剧情，不能新增原文中不存在的台词
- 只能使用章节文本中已经出现或高度确定的角色名
- 不确定时不要硬猜，可跳过该句
- 对于案卷、档案、表单、记录字段这类内容，应优先标记为 structuredLines，而不是角色
- 引号里的可发声文本优先视为对白候选；结构化字段、编号、日期、案号、记录项优先排除
- 只输出 JSON，不要解释，不要 markdown 代码块

【输出 JSON 结构】
{
  "roles": ["角色A", "角色B"],
  "structuredLines": [
    { "lineIndex": 3, "label": "案号" }
  ],
  "voiceFragments": [
    { "lineIndex": 9, "speaker": "老马", "mentionedNames": ["老马"] }
  ],
  "attributions": [
    { "lineIndex": 12, "speaker": "角色A", "confidence": "high" }
  ]
}

【说明】
- roles: 当前章节里识别出的角色名数组
- structuredLines: 你判断为结构化记录、应从角色对白里排除的冒号标签行
- voiceFragments: 更像 OS / 回声 / 碎片化角色音的引号句，可不给 speaker，但可给 mentionedNames
- attributions: 只包含你有把握判断的引号句
- confidence 只能是 high / medium / low`;

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

function parseJsonFromModelReply(reply) {
  const cleaned = String(reply || '')
    .replace(/\[cot\][\s\S]*?\[\/cot\]/g, '')
    .trim();
  if (!cleaned) return null;
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : cleaned;
  const objectMatch = source.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  return JSON.parse(objectMatch[0]);
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

    if (req.method === 'POST' && req.url === '/api/script-role-detect') {
      readJsonBody(req).then(async (body) => {
        const chapterTitle = String(body?.chapterTitle || '').trim();
        const chapterText = String(body?.chapterText || '').trim();
        const existingRoles = Array.isArray(body?.existingRoles)
          ? body.existingRoles.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 40)
          : [];
        const candidateLines = Array.isArray(body?.candidateLines)
          ? body.candidateLines
            .map((entry) => ({
              lineIndex: Number(entry?.lineIndex),
              text: String(entry?.text || '').trim(),
            }))
            .filter((entry) => Number.isInteger(entry.lineIndex) && entry.lineIndex >= 0 && entry.text)
            .slice(0, 80)
          : [];
        const structuredCandidates = Array.isArray(body?.structuredCandidates)
          ? body.structuredCandidates
            .map((entry) => ({
              lineIndex: Number(entry?.lineIndex),
              label: String(entry?.label || '').trim(),
              text: String(entry?.text || '').trim(),
            }))
            .filter((entry) => Number.isInteger(entry.lineIndex) && entry.lineIndex >= 0 && entry.label && entry.text)
            .slice(0, 80)
          : [];

        if (!chapterText || (candidateLines.length === 0 && structuredCandidates.length === 0)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'chapterText and at least one candidate set are required' }));
          return;
        }

        const messages = [
          { role: 'system', content: SCRIPT_ROLE_DETECT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              chapterTitle ? `【当前章节】${chapterTitle}` : '',
              existingRoles.length > 0 ? `【已有角色库】${existingRoles.join('、')}` : '',
              candidateLines.length > 0
                ? ['【候选引号句】', candidateLines.map((entry) => `- lineIndex=${entry.lineIndex}: ${entry.text}`).join('\n')].join('\n')
                : '',
              structuredCandidates.length > 0
                ? ['【冒号标签候选】', structuredCandidates.map((entry) => `- lineIndex=${entry.lineIndex}, label=${entry.label}: ${entry.text}`).join('\n')].join('\n')
                : '',
              '',
              '【章节全文】',
              chapterText.slice(0, 16000),
            ].filter(Boolean).join('\n'),
          },
        ];

        const reply = await runOneShotCompletion(messages);
        const parsed = parseJsonFromModelReply(reply);
        const roles = Array.isArray(parsed?.roles)
          ? parsed.roles.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 40)
          : [];
        const structuredLines = Array.isArray(parsed?.structuredLines)
          ? parsed.structuredLines
            .map((entry) => ({
              lineIndex: Number(entry?.lineIndex),
              label: String(entry?.label || '').trim(),
            }))
            .filter((entry) =>
              Number.isInteger(entry.lineIndex)
              && entry.lineIndex >= 0
              && structuredCandidates.some((line) => line.lineIndex === entry.lineIndex))
            .slice(0, 80)
          : [];
        const voiceFragments = Array.isArray(parsed?.voiceFragments)
          ? parsed.voiceFragments
            .map((entry) => ({
              lineIndex: Number(entry?.lineIndex),
              speaker: String(entry?.speaker || '').trim(),
              mentionedNames: Array.isArray(entry?.mentionedNames)
                ? entry.mentionedNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 12)
                : [],
            }))
            .filter((entry) =>
              Number.isInteger(entry.lineIndex)
              && entry.lineIndex >= 0
              && candidateLines.some((line) => line.lineIndex === entry.lineIndex))
            .slice(0, 80)
          : [];
        const attributions = Array.isArray(parsed?.attributions)
          ? parsed.attributions
            .map((entry) => ({
              lineIndex: Number(entry?.lineIndex),
              speaker: String(entry?.speaker || '').trim(),
              confidence: entry?.confidence === 'high' || entry?.confidence === 'low'
                ? entry.confidence
                : 'medium',
            }))
            .filter((entry) =>
              Number.isInteger(entry.lineIndex)
              && entry.lineIndex >= 0
              && entry.speaker
              && candidateLines.some((line) => line.lineIndex === entry.lineIndex))
            .slice(0, 80)
          : [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          result: {
            roles,
            structuredLines,
            voiceFragments,
            attributions,
          },
        }));
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
