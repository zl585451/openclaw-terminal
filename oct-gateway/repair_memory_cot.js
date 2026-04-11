/**
 * 一次性修复历史/反馈记忆中混入的 CoT 内容。
 * 只修：
 * - core://my_user/history
 * - core://agent/feedback/positive
 * - core://agent/feedback/negative
 *
 * 明确跳过：
 * - core://agent/corrections
 */

const memory = require('./memory');
const { sanitizeMemoryNodeContent } = require('./cot_sanitize');

const TARGET_ROOTS = [
  'core://my_user/history',
  'core://agent/feedback/positive',
  'core://agent/feedback/negative',
];

function getChildren(data) {
  return data?.node?.children || data?.children || [];
}

function getNodeContent(data) {
  return data?.node?.content || data?.content || '';
}

function normalizeChildUri(child, parentUri) {
  if (child?.uri) return child.uri;
  const childPath = child?.path || '';
  if (!childPath) return '';
  if (/^[^:]+:\/\//.test(childPath)) return childPath;
  const parentDomain = parentUri.split('://')[0];
  return `${parentDomain}://${childPath}`;
}

async function collectLeafUris(rootUri, out = []) {
  const r = await memory.readMemory(rootUri, { treat404AsDebug: true });
  if (!r.ok || !r.data) return out;

  const children = getChildren(r.data);
  const content = getNodeContent(r.data);

  if ((!children || children.length === 0) && typeof content === 'string' && content.trim()) {
    out.push(rootUri);
    return out;
  }

  for (const child of children) {
    const childUri = normalizeChildUri(child, rootUri);
    if (!childUri) continue;
    await collectLeafUris(childUri, out);
  }
  return out;
}

async function repairUri(uri) {
  const r = await memory.readMemory(uri, { treat404AsDebug: true });
  if (!r.ok || !r.data) return { checked: 1, repaired: 0 };

  const node = r.data?.node || r.data;
  const raw = node?.content || node?.content_snippet || '';
  const sanitized = sanitizeMemoryNodeContent(raw);
  if (!sanitized.changed) return { checked: 1, repaired: 0 };

  const priority = node?.priority ?? 2;
  const wr = await memory.writeMemory(uri, sanitized.content, priority, '自动清理 CoT 污染');
  return { checked: 1, repaired: wr.ok ? 1 : 0, failed: wr.ok ? 0 : 1 };
}

async function main() {
  const alive = await memory.isAlive();
  if (!alive) {
    console.error('[repair_memory_cot] Nocturne offline');
    process.exit(1);
  }

  const leafUris = [];
  for (const root of TARGET_ROOTS) {
    await collectLeafUris(root, leafUris);
  }

  let checked = 0;
  let repaired = 0;
  let failed = 0;
  for (const uri of leafUris) {
    const res = await repairUri(uri);
    checked += res.checked || 0;
    repaired += res.repaired || 0;
    failed += res.failed || 0;
  }

  console.log(JSON.stringify({ checked, repaired, failed, scannedRoots: TARGET_ROOTS }, null, 2));
}

main().catch((err) => {
  console.error('[repair_memory_cot] fatal', err);
  process.exit(1);
});
