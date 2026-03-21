const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tools.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. 添加 time_inject 到 TOOL_DEFINITIONS (在 memory_write 之前)
const timeInjectDef = `,
  {
    type: 'function',
    function: {
      name: 'time_inject',
      description: '注入当前时间信息到指定记忆节点或任务中',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '目标 URI 或任务标题' },
          format: { type: 'string', description: '时间格式，默认 ISO', enum: ['iso', 'locale', 'unix', 'custom'] },
          customFormat: { type: 'string', description: '自定义格式（当 format 为 custom 时使用）' }
        },
        required: ['target']
      }
    }
  }`;

// 在 memory_write 定义前插入
content = content.replace(
  /(\s*\{\s*type:\s*'function',\s*function:\s*\{\s*name:\s*'memory_write')/,
  timeInjectDef + '$1'
);

// 2. 添加 time_inject 执行逻辑 (在 task_list case 之前，default 之后)
const timeInjectLogic = `
      case 'time_inject': {
        const target = (args.target || '').trim();
        if (!target) return { success: false, error: '目标不能为空' };
        
        const format = args.format || 'iso';
        let timeStr;
        
        const now = new Date();
        switch (format) {
          case 'iso':
            timeStr = now.toISOString();
            break;
          case 'locale':
            timeStr = now.toLocaleString('zh-CN');
            break;
          case 'unix':
            timeStr = String(Math.floor(now.getTime() / 1000));
            break;
          case 'custom':
            const customFmt = args.customFormat || 'YYYY-MM-DD HH:mm:ss';
            timeStr = customFmt
              .replace('YYYY', now.getFullYear())
              .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
              .replace('DD', String(now.getDate()).padStart(2, '0'))
              .replace('HH', String(now.getHours()).padStart(2, '0'))
              .replace('mm', String(now.getMinutes()).padStart(2, '0'))
              .replace('ss', String(now.getSeconds()).padStart(2, '0'));
            break;
          default:
            timeStr = now.toISOString();
        }
        
        // 判断是 URI 还是任务标题
        if (target.includes('://')) {
          // 记忆节点
          const result = await enqueueWrite(target, timeStr, 0, '时间注入');
          return { success: result.success, time: timeStr, target };
        } else {
          // 任务标题 - 在任务内容后追加时间
          const data = loadTasksData();
          const idx = data.tasks.findIndex(t => (t.content || '').trim() === target);
          if (idx === -1) return { success: false, error: '未找到任务: ' + target };
          
          data.tasks[idx].content += ' [时间注入: ' + timeStr + ']';
          if (saveTasksData(data)) {
            if (onTaskBoardUpdate) onTaskBoardUpdate();
            return { success: true, time: timeStr, target };
          }
          return { success: false, error: '保存失败' };
        }
      }`;

// 在 default case 前插入
content = content.replace(
  /(\s*default:\s*\n\s*return \{ success: false, error: `未知工具: \$\{name\}` \})/,
  timeInjectLogic + '$1'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ time_inject 功能已添加成功!');
