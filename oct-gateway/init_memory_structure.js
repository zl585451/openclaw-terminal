const NOCTURNE_BASE = 'http://127.0.0.1:8000';

async function req(method, path, params, body) {
  const url = new URL(NOCTURNE_BASE + path);
  if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function main() {
  console.log('连接到 Nocturne:', NOCTURNE_BASE);

  // 第一步：注册 core domain
  console.log('\n[1] 注册 core domain...');
  const domainRes = await req('POST', '/browse/domains', null, {
    domain: 'core',
    description: 'OCT 核心记忆'
  });
  console.log(`  core domain: ${domainRes.status} ${domainRes.ok ? '✅' : '(已存在或错误)'}`);

  // 第二步：创建根节点（PUT）
  const roots = [
    { path: 'agent',       content: 'AMY 根节点',    priority: 0 },
    { path: 'my_user',     content: '少爷信息根节点', priority: 0 },
    { path: 'project',     content: '项目根节点',     priority: 0 },
    { path: 'conclusions', content: '重要结论根节点', priority: 1 },
    { path: 'daily',       content: '每日摘要根节点', priority: 2 },
  ];

  console.log('\n[2] 创建根节点（PUT）...');
  for (const node of roots) {
    const r = await req('PUT', '/browse/node',
      { path: node.path, domain: 'core' },
      { content: node.content, priority: node.priority, disclosure: '' }
    );
    console.log(`  ${r.ok ? '✅' : '❌'} core://${node.path} [${r.status}]`);
  }

  // 第三步：创建子节点（POST）
  const children = [
    { path: 'agent/rules',              content: '行为规则',       priority: 0 },
    { path: 'agent/corrections',        content: '行为纠正记录',   priority: 1 },
    { path: 'my_user/preferences',      content: '少爷偏好和习惯', priority: 1 },
    { path: 'my_user/communication',    content: '沟通风格备注',   priority: 1 },
    { path: 'project/oct',              content: 'OCT 项目',       priority: 1 },
    { path: 'project/oct/decisions',    content: 'OCT 决策记录',   priority: 1 },
    { path: 'project/oct/status',       content: 'OCT 当前状态',   priority: 1 },
    { path: 'project/oct/milestones',   content: 'OCT 里程碑',     priority: 2 },
  ];

  console.log('\n[3] 创建子节点（POST）...');
  for (const node of children) {
    const r = await req('POST', '/browse/node',
      { path: node.path, domain: 'core' },
      { content: node.content, priority: node.priority, disclosure: '' }
    );
    console.log(`  ${r.ok ? '✅' : '❌'} core://${node.path} [${r.status}]`);
  }

  console.log('\n✅ 初始化完成');
}

main().catch(e => console.error(e));
