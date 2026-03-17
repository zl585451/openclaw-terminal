/**
 * 测试 memory_write 创建新节点（POST）与更新已存在节点（PUT）
 * 要求：Nocturne 已启动
 * 运行：node scripts/test_memory_write_node.js
 */

const path = require('path');
const toolsPath = path.join(__dirname, '..', 'oct-gateway', 'tools.js');
const { executeTool } = require(toolsPath);

const testUri = 'core://my_user/test_memory_write_node';

async function main() {
  console.log('1. 创建新节点（应走 POST）...');
  const r1 = await executeTool('memory_write', {
    uri: testUri,
    content: '这是通过 memory_write 创建的新节点内容',
    priority: 2,
    disclosure: '测试',
  });
  console.log('   结果:', r1.success ? 'OK' + (r1.created ? ' (created)' : r1.updated ? ' (updated)' : '') : r1.error);

  console.log('2. 再次写入同一 URI（应走 PUT 更新）...');
  const r2 = await executeTool('memory_write', {
    uri: testUri,
    content: '已更新内容',
    priority: 1,
    disclosure: '',
  });
  console.log('   结果:', r2.success ? 'OK' + (r2.updated ? ' (updated)' : '') : r2.error);

  console.log('3. 读取验证...');
  const r3 = await executeTool('memory_read', { uri: testUri });
  if (r3.success && r3.data) {
    const node = r3.data?.node || r3.data;
    console.log('   内容:', (node?.content || '').slice(0, 60) + '...');
  } else {
    console.log('   读取失败:', r3.error);
  }
}

main().catch((e) => console.error(e));
