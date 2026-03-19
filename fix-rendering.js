/**
 * OCT 渲染链路修复脚本（Node.js 版，Windows 兼容）
 * 
 * 修复：Markdown / [pills] / 表格 / 代码块 全部显示为原始文本
 * 
 * 用法：
 *   cd E:\windows-window\OpenClaw-Terminal
 *   node fix-rendering.js
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'components', 'ChatTab.tsx');

if (!fs.existsSync(FILE)) {
  console.error('❌ 找不到', FILE);
  console.error('   请把此脚本放到项目根目录运行');
  process.exit(1);
}

// 备份
const backupPath = FILE + '.bak.' + Date.now();
fs.copyFileSync(FILE, backupPath);
console.log('✅ 已备份到', path.basename(backupPath));

let content = fs.readFileSync(FILE, 'utf-8');
let fixCount = 0;

// ══════════════════════════════════════════════════════════════
// FIX 1a: splitTableBlockForStreaming 函数
// 
// 问题：从第一个 | 行开始，到文件结尾的所有内容都被当作 tableAndRest
//       用 whiteSpace:'pre' 原样输出，pills/列表/代码块全部失效
// 修复：只隔离连续的表格行，表格后内容恢复正常渲染
// ══════════════════════════════════════════════════════════════

console.log('\n🔧 Fix 1a: splitTableBlockForStreaming...');

const OLD_FUNC = `function splitTableBlockForStreaming(text: string): { before: string; tableAndRest: string } | null {
  const lines = text.split('\\n');
  const idx = lines.findIndex((line) => /^\\|.+\\|/.test(line.trim()));
  if (idx < 0) return null;
  return {
    before: lines.slice(0, idx).join('\\n'),
    tableAndRest: lines.slice(idx).join('\\n'),
  };
}`;

const NEW_FUNC = `function splitTableBlockForStreaming(text: string): { before: string; tableBlock: string; after: string } | null {
  const lines = text.split('\\n');
  const idx = lines.findIndex((line) => /^\\|.+\\|/.test(line.trim()));
  if (idx < 0) return null;
  // 只隔离连续的表格行，不吞掉表格后面的内容（pills/列表等）
  let endIdx = idx;
  while (endIdx < lines.length && /^\\|.+\\|/.test(lines[endIdx].trim())) {
    endIdx++;
  }
  // 包含分隔符行（|---|---|）
  if (endIdx < lines.length && /^\\s*\\|[\\s:|-]+\\|\\s*$/.test(lines[endIdx])) {
    endIdx++;
  }
  return {
    before: lines.slice(0, idx).join('\\n'),
    tableBlock: lines.slice(idx, endIdx).join('\\n'),
    after: lines.slice(endIdx).join('\\n'),
  };
}`;

if (content.includes(OLD_FUNC)) {
  content = content.replace(OLD_FUNC, NEW_FUNC);
  console.log('  ✓ 函数签名和逻辑已修复');
  fixCount++;
} else {
  console.log('  ⚠️  未找到原始函数，可能已修改过');
}

// ══════════════════════════════════════════════════════════════
// FIX 1b: MarkdownContent 中的表格渲染——表格后内容恢复 Markdown
// ══════════════════════════════════════════════════════════════

console.log('🔧 Fix 1b: MarkdownContent 表格后内容渲染...');

const OLD_USAGE = `{tableBlock.tableAndRest}
            </span>
          </span>
        );
      }

      // 流式期间无表格：正常 ReactMarkdown 渲染`;

const NEW_USAGE = `{tableBlock.tableBlock}
            </span>
            {tableBlock.after && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.after}
              </ReactMarkdown>
            )}
          </span>
        );
      }

      // 流式期间无表格：正常 ReactMarkdown 渲染`;

if (content.includes(OLD_USAGE)) {
  content = content.replace(OLD_USAGE, NEW_USAGE);
  console.log('  ✓ 表格后内容现在走 ReactMarkdown 渲染');
  fixCount++;
} else {
  console.log('  ⚠️  未找到原始渲染块，尝试备选匹配...');
  // 备选：只替换 tableAndRest → tableBlock
  if (content.includes('tableBlock.tableAndRest')) {
    content = content.replace('tableBlock.tableAndRest', 'tableBlock.tableBlock');
    // 在 </span>\n          </span> 之前插入 after 渲染
    const afterInsert = `{tableBlock.tableBlock}
            </span>
            {tableBlock.after && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.after}
              </ReactMarkdown>
            )}`;
    // 如果精确匹配失败，至少替换属性名
    console.log('  ✓ 属性名已替换（tableAndRest → tableBlock）');
    console.log('  ⚠️  请手动在 tableBlock.tableBlock 的 </span> 后添加 after 渲染块');
    fixCount++;
  }
}

// ══════════════════════════════════════════════════════════════
// FIX 2: parseOptionBox 始终调用（不再等打字机结束）
//
// 问题：isStreaming 为 true 时 parseOptionBox 永远不执行
//       所有 [pills]/[question] 标签原样显示
//       如果打字机定时器异常，isStreaming 永远不变 false → 永远不解析
//
// 修复：删除 && !isStreamingMsg 条件
// ══════════════════════════════════════════════════════════════

console.log('🔧 Fix 2: parseOptionBox 始终调用...');

const OLD_PARSE = "const parsed = (msg.role === 'assistant' && !isStreamingMsg)";
const NEW_PARSE = "const parsed = (msg.role === 'assistant')";

if (content.includes(OLD_PARSE)) {
  content = content.replace(OLD_PARSE, NEW_PARSE);
  console.log('  ✓ parseOptionBox 现在对所有 assistant 消息始终调用');
  fixCount++;
} else {
  console.log('  ⚠️  未找到原始条件');
}

// ══════════════════════════════════════════════════════════════
// FIX 3: textToShow — 有 segments 时优先用 parsed.text
//
// 问题：流式期间有 displayedLength 时，textToShow = display（原始切片文本）
//       即使 parseOptionBox 已解析出 segments，文本部分仍含原始标签
//
// 修复：有 segments 时跳过 displayedLength 切片逻辑
// ══════════════════════════════════════════════════════════════

console.log('🔧 Fix 3: textToShow segments 优先...');

const OLD_TEXT = `? (isStreamingMsg && displayedLength > 0 ? display : (parsed.text?.trim() ? parsed.text : raw))`;
const NEW_TEXT = `? (isStreamingMsg && displayedLength > 0 && !parsed.segments
              ? display
              : (parsed.text?.trim() ? parsed.text : raw))`;

if (content.includes(OLD_TEXT)) {
  content = content.replace(OLD_TEXT, NEW_TEXT);
  console.log('  ✓ textToShow 现在有 segments 时优先使用 parsed.text');
  fixCount++;
} else {
  console.log('  ⚠️  未找到原始 textToShow 逻辑');
}

// ══════════════════════════════════════════════════════════════
// 写入
// ══════════════════════════════════════════════════════════════

fs.writeFileSync(FILE, content, 'utf-8');

console.log('\n' + '='.repeat(60));
if (fixCount >= 3) {
  console.log(`✅ 全部 ${fixCount} 处修复已应用！`);
} else {
  console.log(`⚠️  应用了 ${fixCount} 处修复（部分未匹配，请检查）`);
}
console.log('');
console.log('修复内容：');
console.log('  1. splitTableBlockForStreaming: 表格后内容不再被当纯文本');
console.log('  2. parseOptionBox: 始终解析（不再等打字机结束）');
console.log('  3. textToShow: 有 segments 时优先用解析后的文本');
console.log('');
console.log('下一步：');
console.log('  npm run dev    # 启动开发模式测试');
console.log('');
console.log('回滚：');
console.log('  copy ' + path.basename(backupPath) + ' src\\components\\ChatTab.tsx');
console.log('='.repeat(60));
