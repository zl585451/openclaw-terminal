const { ImapFlow } = require('imapflow');
const vault = require('../vault_manager');

module.exports = {
  name: 'email_reader',
  definition: {
    type: 'function',
    function: {
      name: 'email_reader',
      description: '读取邮箱邮件。必须使用保险箱中已存入的邮箱凭证，不得用 exec_command 或脚本替代。参数 vaultRef 为保险箱引用名。',
      parameters: {
        type: 'object',
        properties: {
          vaultRef: {
            type: 'string',
            description: '保险箱中邮箱凭证的引用名，如 163邮箱、email_163、email_qq',
          },
          action: {
            type: 'string',
            enum: ['get_latest', 'find_code', 'find_subject'],
            description: 'get_latest=取最新邮件, find_code=查验证码, find_subject=按主题搜索',
          },
          count: {
            type: 'number',
            description: '取邮件数量，默认 5',
          },
          keyword: {
            type: 'string',
            description: '关键词，find_subject 时使用',
          },
        },
        required: ['vaultRef'],
      },
    },
  },
  execute: async (args) => {
    // 兼容 vaultRef 和 vaultRefName 两种参数名
    const vaultRef = args.vaultRef || args.vaultRefName || args.vault_ref || args.refName;
    const action = args.action || 'get_latest';
    const keyword = args.keyword;
    const count = args.count || 5;
    const folder = args.folder || 'INBOX';

    if (!vaultRef) {
      return '❌ 请指定保险箱凭证引用名，例如：vaultRef: "163邮箱"';
    }

    let rawCreds;
    try {
      rawCreds = vault.getItem(vaultRef);
    } catch (e) {
      return `❌ 无法从保险箱获取凭证 "${vaultRef}"：${e.message}。请先在保险箱中存入该邮箱凭证。`;
    }

    // 取凭证后，兼容多种存储格式
    let credentials = rawCreds;
    if (typeof rawCreds === 'object' && rawCreds !== null && rawCreds.value !== undefined) {
      credentials = rawCreds.value;
    }
    if (typeof rawCreds === 'string') {
      try { credentials = JSON.parse(rawCreds); } catch { credentials = rawCreds; }
    }

    let user, pass;
    if (typeof credentials === 'string') {
      const emailMatch = credentials.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        user = emailMatch[0];
        pass = credentials.replace(emailMatch[0], '').trim();
      } else {
        return '❌ 凭证格式需要更新。\n' +
          '当前存储的是纯文本，email_reader 需要 JSON 格式：\n' +
          '{"user": "你的邮箱", "pass": "授权码"}\n\n' +
          '请告诉我你的邮箱地址和授权码，我帮你重新存入。';
      }
    } else if (typeof credentials === 'object' && credentials !== null) {
      user = credentials.user || credentials.email || credentials.username || credentials.account || '';
      pass = credentials.pass || credentials.password || credentials.authCode || credentials.auth_code
        || credentials.token || credentials.appPassword || '';
    } else {
      user = '';
      pass = '';
    }

    if (!user || !pass) {
      return '❌ 凭证缺少必要字段。\n' +
        '需要格式：{"user": "邮箱地址", "pass": "授权码"}\n' +
        '当前字段：' + (credentials && typeof credentials === 'object'
          ? JSON.stringify(Object.keys(credentials))
          : '(字符串)') + '\n\n' +
        '请告诉我正确的邮箱和授权码，我帮你重新存入。';
    }

    const credsObj = typeof credentials === 'object' ? credentials : {};
    const host = credsObj.host || credsObj.imapHost || (user.includes('163') ? 'imap.163.com' : user.includes('qq') ? 'imap.qq.com' : 'imap.gmail.com');
    const port = credsObj.port || credsObj.imapPort || 993;
    const secure = credsObj.secure !== false;

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen(folder);
      const total = mailbox.exists || 0;
      if (total === 0) {
        return JSON.stringify({ ok: true, count: 0, messages: [], folder });
      }

      const start = Math.max(1, total - count + 1);
      const end = total;
      const messages = [];
      for await (const msg of client.fetch({ start, end }, { envelope: true, bodyStructure: true })) {
        const env = msg.envelope || {};
        messages.push({
          subject: env.subject || '(无主题)',
          from: (env.from || []).map(a => a.address || a).join(', '),
          date: env.date ? new Date(env.date).toISOString() : null,
          messageId: env.messageId || null,
        });
      }
      await client.logout();

      return JSON.stringify({
        ok: true,
        count: messages.length,
        total,
        folder,
        messages: messages.reverse(),
      });
    } catch (e) {
      try { await client.logout(); } catch {}
      throw new Error(`读取邮箱失败：${e.message}`);
    }
  },
};
