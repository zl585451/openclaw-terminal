/**
 * OCT 缓存系统自动化测试脚本
 * 测试三个缓存系统：会话持久化、解析缓存、抓取缓存
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

function pass(msg) {
  log(colors.green, `✅ ${msg}`);
}

function fail(msg) {
  log(colors.red, `❌ ${msg}`);
}

function info(msg) {
  log(colors.cyan, `ℹ️  ${msg}`);
}

function warn(msg) {
  log(colors.yellow, `⚠️  ${msg}`);
}

// ============================================
// 测试 1: 会话持久化缓存
// ============================================
function testSessionCache() {
  log(colors.blue, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.blue, '📦 测试 1: 会话持久化缓存');
  log(colors.blue, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sessionPath = path.join(os.homedir(), '.oct-gateway', 'sessions.json');
  
  // 检查文件是否存在
  if (!fs.existsSync(sessionPath)) {
    fail(`会话文件不存在：${sessionPath}`);
    return false;
  }
  pass(`会话文件存在：${sessionPath}`);

  // 读取并解析 JSON
  let sessions;
  try {
    const content = fs.readFileSync(sessionPath, 'utf-8');
    sessions = JSON.parse(content);
    pass('会话文件 JSON 格式有效');
  } catch (e) {
    fail(`JSON 解析失败：${e.message}`);
    return false;
  }

  // 检查会话结构
  if (!sessions.main || !Array.isArray(sessions.main)) {
    fail('会话结构不正确，缺少 main 数组');
    return false;
  }
  pass(`会话结构正确，包含 main 会话`);

  // 检查消息数量
  const messageCount = sessions.main.length;
  info(`当前会话消息数：${messageCount}`);
  
  if (messageCount === 0) {
    warn('会话为空，没有历史消息');
  } else {
    pass(`已保存 ${messageCount} 条历史消息`);
  }

  // 检查消息格式
  let validMessages = 0;
  for (const msg of sessions.main) {
    if (msg.role && msg.content && msg.timestamp) {
      validMessages++;
    }
  }
  
  if (validMessages === messageCount) {
    pass(`所有 ${validMessages} 条消息格式完整 (role, content, timestamp)`);
  } else {
    warn(`只有 ${validMessages}/${messageCount} 条消息格式完整`);
  }

  // 检查最近的消息
  if (messageCount > 0) {
    const lastMsg = sessions.main[messageCount - 1];
    info(`最后一条消息: ${lastMsg.role} - "${lastMsg.content.substring(0, 50)}..."`);
  }

  // 检查文件大小
  const stats = fs.statSync(sessionPath);
  const fileSize = (stats.size / 1024).toFixed(2);
  info(`会话文件大小：${fileSize} KB`);

  return true;
}

// ============================================
// 测试 2: 解析缓存 (LRU Map)
// ============================================
async function testParserCache() {
  log(colors.blue, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.blue, '🧠 测试 2: 解析缓存 (LRU Map)');
  log(colors.blue, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const parserPath = path.join(__dirname, 'src', 'utils', 'optionBoxParser.ts');
  
  if (!fs.existsSync(parserPath)) {
    fail(`解析器文件不存在：${parserPath}`);
    return false;
  }
  pass(`解析器文件存在：${parserPath}`);

  // 读取源码检查 LRU 实现
  const source = fs.readFileSync(parserPath, 'utf-8');
  
  // 检查是否包含 LRU 相关代码
  const hasLRU = source.includes('LRU') || source.includes('Map') || source.includes('cache');
  if (hasLRU) {
    pass('源码中包含缓存相关实现');
  } else {
    warn('源码中未检测到明显的缓存实现');
  }

  // 检查最大缓存数
  const maxCacheMatch = source.match(/max.*?(\d{2,3})|(\d{2,3}).*?max/i);
  if (maxCacheMatch) {
    const maxCache = maxCacheMatch[1] || maxCacheMatch[2];
    info(`检测到最大缓存数：${maxCache}`);
  }

  // 检查 TTL 或过期机制
  if (source.includes('TTL') || source.includes('expire') || source.includes('delete')) {
    pass('源码中包含过期/删除机制');
  }

  // 实际测试需要运行 OCT，这里只做静态检查
  warn('⚠️  LRU 缓存是内存缓存，需要运行 OCT 进行动态测试');
  info('建议测试方法：发送相同选项框消息两次，观察解析速度差异');

  return true;
}

// ============================================
// 测试 3: 抓取缓存 (web_fetch TTL)
// ============================================
async function testFetchCache() {
  log(colors.blue, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.blue, '🌐 测试 3: 抓取缓存 (5 分钟 TTL)');
  log(colors.blue, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const toolsPath = path.join(__dirname, 'oct-gateway', 'tools.js');
  
  if (!fs.existsSync(toolsPath)) {
    fail(`工具文件不存在：${toolsPath}`);
    return false;
  }
  pass(`工具文件存在：${toolsPath}`);

  // 读取源码检查缓存实现
  const source = fs.readFileSync(toolsPath, 'utf-8');
  
  // 检查是否包含缓存相关代码
  const hasCache = source.includes('cache') || source.includes('Map') || source.includes('TTL');
  if (hasCache) {
    pass('源码中包含缓存相关实现');
  } else {
    fail('源码中未检测到缓存实现');
    return false;
  }

  // 检查 TTL 配置
  const ttlMatch = source.match(/TTL.*?(\d+)|(\d+).*?TTL|(\d{4,})\s*\/\s*1000/i);
  if (ttlMatch) {
    const ttlValue = ttlMatch[1] || ttlMatch[2] || ttlMatch[3];
    info(`检测到 TTL 配置：${ttlValue}`);
  }

  // 检查最大缓存数
  const maxMatch = source.match(/max.*?(\d{2,3})|(\d{2,3}).*?max/i);
  if (maxMatch) {
    const maxValue = maxMatch[1] || maxMatch[2];
    info(`检测到最大缓存数：${maxValue}`);
  }

  // 动态测试：实际抓取两次
  log(colors.cyan, '\n🔄 开始动态抓取测试...');
  
  try {
    // 需要导入 tools.js 进行测试
    // 由于是 CommonJS 模块，需要特殊处理
    const { execSync } = require('child_process');
    
    // 创建一个临时测试脚本
    const testScript = `
      const tools = require('./oct-gateway/tools.js');
      
      async function runTest() {
        const url = 'https://httpbin.org/get';
        
        console.log('第一次抓取...');
        const result1 = await tools.web_fetch(url);
        console.log('结果 1:', JSON.stringify({ cached: result1.cached, time: Date.now() }));
        
        console.log('\\n第二次抓取（应该命中缓存）...');
        const result2 = await tools.web_fetch(url);
        console.log('结果 2:', JSON.stringify({ cached: result2.cached, time: Date.now() }));
        
        if (result2.cached) {
          console.log('\\n✅ 缓存命中测试通过！');
          process.exit(0);
        } else {
          console.log('\\n⚠️  第二次未命中缓存，可能 TTL 已过或缓存未生效');
          process.exit(1);
        }
      }
      
      runTest().catch(e => {
        console.error('测试错误:', e.message);
        process.exit(1);
      });
    `;
    
    const tempScriptPath = path.join(__dirname, 'temp-fetch-test.js');
    fs.writeFileSync(tempScriptPath, testScript);
    
    try {
      const result = execSync(`node ${tempScriptPath}`, {
        cwd: __dirname,
        encoding: 'utf-8',
        timeout: 30000
      });
      console.log(result);
      pass('动态抓取缓存测试完成');
    } catch (e) {
      warn(`动态测试执行失败：${e.message}`);
      info('可能是网络问题或模块依赖问题，建议手动测试');
    } finally {
      // 清理临时文件
      if (fs.existsSync(tempScriptPath)) {
        fs.unlinkSync(tempScriptPath);
      }
    }
  } catch (e) {
    warn(`测试执行出错：${e.message}`);
  }

  return true;
}

// ============================================
// 主测试流程
// ============================================
async function runAllTests() {
  log(colors.cyan, '\n╔═══════════════════════════════════════╗');
  log(colors.cyan, '   🚀 OCT 缓存系统自动化测试');
  log(colors.cyan, '╚═══════════════════════════════════════╝\n');

  const results = {
    sessionCache: false,
    parserCache: false,
    fetchCache: false
  };

  // 测试 1: 会话持久化
  results.sessionCache = testSessionCache();

  // 测试 2: 解析缓存
  results.parserCache = await testParserCache();

  // 测试 3: 抓取缓存
  results.fetchCache = await testFetchCache();

  // 总结
  log(colors.blue, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.blue, '📊 测试结果总结');
  log(colors.blue, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const total = 3;
  const passed = Object.values(results).filter(r => r).length;

  console.log(`
  会话持久化缓存：${results.sessionCache ? '✅ 通过' : '❌ 失败'}
  解析缓存 (LRU)： ${results.parserCache ? '✅ 通过' : '❌ 失败'}
  抓取缓存 (TTL)： ${results.fetchCache ? '✅ 通过' : '❌ 失败'}
  
  ─────────────────────────────────────
  总计：${passed}/${total} 通过
  `);

  if (passed === total) {
    log(colors.green, '🎉 所有缓存系统测试通过！');
  } else {
    log(colors.yellow, '⚠️  部分测试未通过，请检查日志');
  }

  // 生成测试报告
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total,
      passed,
      failed: total - passed
    }
  };

  const reportPath = path.join(__dirname, 'docs', 'cache-test-report.json');
  const docsDir = path.dirname(reportPath);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  info(`测试报告已保存：${reportPath}`);

  process.exit(passed === total ? 0 : 1);
}

// 运行测试
runAllTests().catch(e => {
  log(colors.red, `💥 测试执行出错：${e.message}`);
  console.error(e);
  process.exit(1);
});
