const vault = require('../vault_manager');

function parseCredentials(raw) {
  let credentials = raw;
  if (typeof raw === 'object' && raw !== null && raw.value !== undefined) {
    credentials = raw.value;
  }
  if (typeof credentials === 'string') {
    try { credentials = JSON.parse(credentials); } catch { return null; }
  }
  return credentials && typeof credentials === 'object' ? credentials : null;
}

module.exports = {
  name: 'email_manager',
  definition: {
    type: 'function',
    function: {
      name: 'email_manager',
      description: '管理邮件：标记已读、删除、移动到文件夹、搜索邮件',
      parameters: {
        type: 'object',
        properties: {
          vaultRef: {
            type: 'string',
            description: '保险箱邮箱凭证引用名'
          },
          action: {
            type: 'string',
            enum: ['mark_read', 'delete', 'move', 'search', 'count_unread'],
            description: 'mark_read=标记已读, delete=删除, move=移动, search=搜索, count_unread=统计未读'
          },
          uid: {
            type: 'string',
            description: '邮件 UID（从 email_reader 结果里获取）'
          },
          targetFolder: {
            type: 'string',
            description: 'move 操作的目标文件夹名'
          },
          searchQuery: {
            type: 'string',
            description: 'search 操作的搜索关键词'
          },
          folder: {
            type: 'string',
            description: '操作的文件夹，默认 INBOX'
          }
        },
        required: ['vaultRef', 'action']
      }
    }
  },
  execute: async (args) => {
    const vaultRef = args.vaultRef || args.vault_ref;
    const { action, uid, targetFolder, searchQuery, folder = 'INBOX' } = args;

    if (!vault.isUnlocked()) return '❌ 保险箱未解锁';

    let credentials;
    try {
      const raw = vault.getItem(vaultRef);
      credentials = parseCredentials(raw);
    } catch (e) {
      return `❌ 无法获取凭证：${e.message}`;
    }

    if (!credentials) {
      return '❌ 凭证格式错误，需要 {"user":"邮箱","pass":"授权码"}';
    }

    const user = credentials.user || credentials.email || credentials.username;
    const pass = credentials.pass || credentials.password || credentials.authCode || credentials.auth_code;
    const emailDomain = (user || '').split('@')[1] || '';

    const IMAP_MAP = {
      '163.com': { host: 'imap.163.com', port: 993 },
      '126.com': { host: 'imap.126.com', port: 993 },
      'qq.com': { host: 'imap.qq.com', port: 993 },
      'gmail.com': { host: 'imap.gmail.com', port: 993 },
    };
    const imap = IMAP_MAP[emailDomain] || {
      host: credentials.imap || `imap.${emailDomain}`,
      port: 993
    };

    if (!user || !pass) {
      return '❌ 凭证缺少 user 或 pass 字段';
    }

    try {
      const { ImapFlow } = require('imapflow');
      const client = new ImapFlow({
        host: imap.host,
        port: imap.port,
        secure: true,
        auth: { user, pass },
        logger: false,
        tls: { rejectUnauthorized: false }
      });

      await client.connect();
      const lock = await client.getMailboxLock(folder);

      try {
        switch (action) {
          case 'count_unread': {
            const status = await client.status(folder, { unseen: true });
            const count = status?.unseen ?? 0;
            return `📬 ${folder} 未读邮件：${count} 封`;
          }

          case 'mark_read': {
            if (!uid) return '❌ 需要提供邮件 uid';
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            return `✅ 邮件 ${uid} 已标记为已读`;
          }

          case 'delete': {
            if (!uid) return '❌ 需要提供邮件 uid';
            await client.messageDelete(uid, { uid: true });
            return `✅ 邮件 ${uid} 已删除`;
          }

          case 'move': {
            if (!uid || !targetFolder) return '❌ 需要提供 uid 和 targetFolder';
            await client.messageMove(uid, targetFolder, { uid: true });
            return `✅ 邮件已移动到 ${targetFolder}`;
          }

          case 'search': {
            if (!searchQuery) return '❌ 需要提供搜索关键词';
            const results = [];
            for await (const msg of client.fetch({ subject: searchQuery }, { envelope: true })) {
              const env = msg.envelope || {};
              results.push({
                uid: msg.uid,
                subject: env.subject || '(无主题)',
                from: (env.from || [])[0]?.address || (env.from || [])[0],
                date: env.date
              });
              if (results.length >= 10) break;
            }
            if (results.length === 0) return `未找到包含"${searchQuery}"的邮件`;
            return results.map((r, i) =>
              `${i + 1}. [uid:${r.uid}] ${r.subject}\n   来自：${r.from} | ${r.date ? new Date(r.date).toLocaleDateString('zh-CN') : '-'}`
            ).join('\n\n');
          }

          default:
            return `未知操作：${action}`;
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (e) {
      return `❌ 邮件操作失败：${e.message}`;
    }
  }
};
