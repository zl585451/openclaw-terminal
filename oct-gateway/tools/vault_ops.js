const vault = require('../vault_manager');

module.exports = {
  name: 'vault_ops',
  definition: {
    type: 'function',
    function: {
      name: 'vault_ops',
      description: '操作加密保险箱：存取密码、API Key、邮箱凭证等敏感信息。解锁后才能使用。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'unlock', 'lock', 'set', 'get', 'list', 'delete', 'create'],
            description: 'status=查看状态, create=创建(需主密码), unlock=解锁, lock=锁定, set=存入, get=取出(仅用于执行任务), list=列举, delete=删除'
          },
          masterPassword: { type: 'string', description: '主密码（create/unlock 时需要）' },
          refName: { type: 'string', description: '凭证引用名，如 github_token, email_163' },
          label: { type: 'string', description: '凭证说明，如 "GitHub 个人令牌"' },
          value: { description: '凭证值，字符串或对象' },
          category: {
            type: 'string',
            enum: ['api_key', 'email', 'wallet', 'password', 'token', 'general'],
            description: '凭证分类'
          },
          riskLevel: {
            type: 'string',
            enum: ['normal', 'high', 'critical'],
            description: 'critical 级别（如钱包助记词）使用时需额外确认'
          }
        },
        required: ['action']
      }
    }
  },
  execute: async ({ action, masterPassword, refName, label, value, category, riskLevel }) => {
    try {
      switch (action) {
        case 'status':
          return JSON.stringify({
            exists: vault.vaultExists(),
            unlocked: vault.isUnlocked(),
            hint: vault.vaultExists()
              ? (vault.isUnlocked() ? '保险箱已解锁，可以操作' : '保险箱已锁定，需要主密码解锁')
              : '保险箱不存在，需要先创建（action: create）'
          });

        case 'create':
          if (!masterPassword) throw new Error('需要提供主密码');
          vault.create(masterPassword);
          return JSON.stringify({ ok: true, message: '保险箱已创建并解锁，请妥善保管主密码' });

        case 'unlock':
          if (!masterPassword) throw new Error('需要提供主密码');
          const unlockResult = vault.unlock(masterPassword);
          return JSON.stringify({ ok: true, message: `保险箱已解锁，共 ${unlockResult.itemCount} 条凭证` });

        case 'lock':
          vault.lock();
          return JSON.stringify({ ok: true, message: '保险箱已锁定' });

        case 'set':
          if (!refName || !label || value === undefined) throw new Error('需要提供 refName、label 和 value');
          vault.setItem(refName, label, value, category || 'general', riskLevel || 'normal');
          return JSON.stringify({ ok: true, message: `已安全存入「${label}」，引用名：${refName}` });

        case 'get':
          if (!refName) throw new Error('需要提供 refName');
          console.warn(`[Vault] ⚠️ get 操作被调用，refName: ${refName} - 请确认是工具调用而非 AMY 直接使用`);
          const itemValue = vault.getItem(refName);
          return typeof itemValue === 'object'
            ? JSON.stringify(itemValue)
            : String(itemValue);

        case 'list': {
          const listItems = vault.listItems();
          return JSON.stringify({ items: listItems });
        }

        case 'delete':
          if (!refName) throw new Error('需要提供 refName');
          vault.deleteItem(refName);
          return JSON.stringify({ ok: true, message: `已删除凭证：${refName}` });

        default:
          throw new Error(`未知操作：${action}`);
      }
    } catch (e) {
      throw new Error(e?.message || '保险箱操作失败');
    }
  }
};
