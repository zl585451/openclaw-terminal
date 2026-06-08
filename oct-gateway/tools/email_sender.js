const vault = require('../vault_manager');
const { loadOptionalDependency } = require('./optionalDependency');

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
  name: 'email_sender',
  definition: {
    type: 'function',
    function: {
      name: 'email_sender',
      description: '使用保险箱凭证发送邮件。保险箱必须先解锁。',
      parameters: {
        type: 'object',
        properties: {
          vaultRef: {
            type: 'string',
            description: '保险箱邮箱凭证引用名，如 163_邮箱'
          },
          to: {
            type: 'string',
            description: '收件人邮箱地址'
          },
          subject: {
            type: 'string',
            description: '邮件主题'
          },
          body: {
            type: 'string',
            description: '邮件正文内容'
          },
          isHtml: {
            type: 'boolean',
            description: '是否为 HTML 格式，默认 false'
          }
        },
        required: ['vaultRef', 'to', 'subject', 'body']
      }
    }
  },
  execute: async (args) => {
    const vaultRef = args.vaultRef || args.vault_ref;
    const { to, subject, body, isHtml = false } = args;

    if (!vault.isUnlocked()) {
      return '❌ 保险箱未解锁，请先解锁';
    }

    let credentials;
    try {
      const raw = vault.getItem(vaultRef);
      credentials = parseCredentials(raw);
    } catch (e) {
      return `❌ 无法获取凭证 "${vaultRef}"：${e.message}`;
    }

    if (!credentials) {
      return '❌ 凭证格式错误，需要 {"user":"邮箱","pass":"授权码"}';
    }

    const user = credentials.user || credentials.email || credentials.username;
    const pass = credentials.pass || credentials.password || credentials.authCode || credentials.auth_code;
    const emailDomain = (user || '').split('@')[1] || '';

    const SMTP_MAP = {
      '163.com': { host: 'smtp.163.com', port: 465, secure: true },
      '126.com': { host: 'smtp.126.com', port: 465, secure: true },
      'qq.com': { host: 'smtp.qq.com', port: 465, secure: true },
      'gmail.com': { host: 'smtp.gmail.com', port: 587, secure: false },
      'outlook.com': { host: 'smtp.office365.com', port: 587, secure: false },
    };

    const smtp = SMTP_MAP[emailDomain] || {
      host: credentials.smtp || `smtp.${emailDomain}`,
      port: credentials.smtpPort || 587,
      secure: false
    };

    if (!user || !pass) {
      return '❌ 凭证缺少 user 或 pass 字段';
    }

    try {
      const nodemailer = loadOptionalDependency('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      await transporter.sendMail({
        from: `"OCT Assistant" <${user}>`,
        to,
        subject,
        [isHtml ? 'html' : 'text']: body
      });

      console.log(`[EmailSender] 发送成功 → ${to}`);
      return `✅ 邮件已发送\n收件人：${to}\n主题：${subject}`;

    } catch (e) {
      if (e?.code === 'OCT_OPTIONAL_DEPENDENCY_MISSING') {
        return `❌ ${e.message}\n${e.hint}`;
      }
      const msg = e?.message || String(e);
      if (msg.includes('auth') || msg.includes('535')) {
        return '❌ 发件认证失败：请确认使用的是 SMTP 授权码而非登录密码';
      }
      if (msg.includes('ECONNREFUSED')) {
        return `❌ 无法连接 SMTP 服务器 (${smtp.host})：请检查网络或防火墙`;
      }
      return `❌ 发送失败：${msg}`;
    }
  }
};
