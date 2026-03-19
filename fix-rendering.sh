#!/bin/bash
# ============================================================
# OCT 渲染链路修复脚本
# 修复：Markdown / [pills] / 表格 / 代码块 全部显示为原始文本
# 
# 用法：
#   cd E:\windows-window\OpenClaw-Terminal
#   bash fix-rendering.sh
#
# 或在 Git Bash / WSL 中运行
# ============================================================

set -e

FILE="src/components/ChatTab.tsx"

if [ ! -f "$FILE" ]; then
  echo "❌ 找不到 $FILE，请确认在项目根目录运行"
  exit 1
fi

# 备份
cp "$FILE" "${FILE}.bak.$(date +%Y%m%d%H%M%S)"
echo "✅ 已备份原文件"

# ──────────────────────────────────────────────────────────────
# FIX 1: splitTableBlockForStreaming — 表格后的内容（pills等）被当纯文本
# 
# 原因：从第一个 | 行开始，到文件结尾的所有内容都被当作 tableAndRest
#       用 whiteSpace:'pre' 原样显示，pills/列表/代码块全部失效
# 
# 修复：只隔离连续的表格行，表格后的内容继续走 Markdown 渲染
# ──────────────────────────────────────────────────────────────

echo "🔧 Fix 1: splitTableBlockForStreaming..."

python3 -c "
import re, sys

with open('$FILE', 'r', encoding='utf-8') as f:
    content = f.read()

# --- Fix 1a: 修改函数签名和逻辑 ---
old_func = '''function splitTableBlockForStreaming(text: string): { before: string; tableAndRest: string } | null {
  const lines = text.split('\\\\n');
  const idx = lines.findIndex((line) => /^\|.+\|/.test(line.trim()));
  if (idx < 0) return null;
  return {
    before: lines.slice(0, idx).join('\\\\n'),
    tableAndRest: lines.slice(idx).join('\\\\n'),
  };
}'''

new_func = '''function splitTableBlockForStreaming(text: string): { before: string; tableBlock: string; after: string } | null {
  const lines = text.split('\\\\n');
  const idx = lines.findIndex((line) => /^\|.+\|/.test(line.trim()));
  if (idx < 0) return null;
  // 只隔离连续的表格行，不吞掉表格后面的内容（pills/列表等）
  let endIdx = idx;
  while (endIdx < lines.length && /^\|.+\|/.test(lines[endIdx].trim())) {
    endIdx++;
  }
  // 包含分隔符行（|---|---|）
  if (endIdx < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[endIdx])) {
    endIdx++;
  }
  return {
    before: lines.slice(0, idx).join('\\\\n'),
    tableBlock: lines.slice(idx, endIdx).join('\\\\n'),
    after: lines.slice(endIdx).join('\\\\n'),
  };
}'''

if old_func not in content:
    print('⚠️  Fix 1a: 未找到原始 splitTableBlockForStreaming，可能已修改过', file=sys.stderr)
else:
    content = content.replace(old_func, new_func, 1)
    print('  ✓ splitTableBlockForStreaming 函数已修复')

with open('$FILE', 'w', encoding='utf-8') as f:
    f.write(content)
"

# --- Fix 1b: 修改 MarkdownContent 中的调用处 ---
echo "🔧 Fix 1b: MarkdownContent 流式表格渲染..."

python3 -c "
import sys

with open('$FILE', 'r', encoding='utf-8') as f:
    content = f.read()

old_usage = '''      const tableBlock = splitTableBlockForStreaming(text);
      if (tableBlock) {
        return (
          <span className=\"msg-content markdown-body msg-content-streaming-root\" ref={contentRef}>
            {tableBlock.before && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.before}
              </ReactMarkdown>
            )}
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-code)',
              color: 'var(--accent-primary)',
              whiteSpace: 'pre',
              lineHeight: 1.6,
              marginTop: '4px',
              opacity: 0.8,
            }}>
              {tableBlock.tableAndRest}
            </span>
          </span>
        );
      }'''

new_usage = '''      const tableBlock = splitTableBlockForStreaming(text);
      if (tableBlock) {
        return (
          <span className=\"msg-content markdown-body msg-content-streaming-root\" ref={contentRef}>
            {tableBlock.before && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.before}
              </ReactMarkdown>
            )}
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-code)',
              color: 'var(--accent-primary)',
              whiteSpace: 'pre',
              lineHeight: 1.6,
              marginTop: '4px',
              opacity: 0.8,
            }}>
              {tableBlock.tableBlock}
            </span>
            {tableBlock.after && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.after}
              </ReactMarkdown>
            )}
          </span>
        );
      }'''

if old_usage not in content:
    print('⚠️  Fix 1b: 未找到原始 MarkdownContent 表格渲染块', file=sys.stderr)
else:
    content = content.replace(old_usage, new_usage, 1)
    print('  ✓ MarkdownContent 表格渲染已修复（表格后内容恢复 Markdown 渲染）')

with open('$FILE', 'w', encoding='utf-8') as f:
    f.write(content)
"

# ──────────────────────────────────────────────────────────────
# FIX 2: parseOptionBox 只在 !isStreamingMsg 时调用 → 改为始终调用
#
# 原因：isStreaming 为 true 时，parseOptionBox 永远不执行
#       所有 [pills] 标签、交互元素都原样显示为文本
#       如果打字机定时器异常，isStreaming 永远不变 false
#
# 修复：对所有 assistant 消息始终调用 parseOptionBox
# ──────────────────────────────────────────────────────────────

echo "🔧 Fix 2: parseOptionBox 始终调用..."

python3 -c "
import sys

with open('$FILE', 'r', encoding='utf-8') as f:
    content = f.read()

old_parse = 'const parsed = (msg.role === \'assistant\' && !isStreamingMsg)'
new_parse = 'const parsed = (msg.role === \'assistant\')'

if old_parse not in content:
    print('⚠️  Fix 2: 未找到原始 parseOptionBox 条件', file=sys.stderr)
else:
    content = content.replace(old_parse, new_parse, 1)
    print('  ✓ parseOptionBox 现在对所有 assistant 消息始终调用')

with open('$FILE', 'w', encoding='utf-8') as f:
    f.write(content)
"

# ──────────────────────────────────────────────────────────────
# FIX 3: textToShow — 有 segments 时优先用 parsed.text
#
# 原因：流式期间 displayedLength > 0 时，textToShow = display（原始切片）
#       即使 parseOptionBox 已解析出 segments，textToShow 仍是未清理的原文
#       导致 segments 路径虽然渲染了 pills，但文本部分还是原始标签文本
#
# 修复：有 segments 时跳过 displayedLength 逻辑，直接用 parsed.text
# ──────────────────────────────────────────────────────────────

echo "🔧 Fix 3: textToShow segments 优先..."

python3 -c "
import sys

with open('$FILE', 'r', encoding='utf-8') as f:
    content = f.read()

old_text = '''const textToShow = msg.role === 'assistant'
          ? (isStreamingMsg && displayedLength > 0 ? display : (parsed.text?.trim() ? parsed.text : raw))
          : display;'''

new_text = '''const textToShow = msg.role === 'assistant'
          ? (isStreamingMsg && displayedLength > 0 && !parsed.segments
              ? display
              : (parsed.text?.trim() ? parsed.text : raw))
          : display;'''

if old_text not in content:
    print('⚠️  Fix 3: 未找到原始 textToShow 逻辑', file=sys.stderr)
else:
    content = content.replace(old_text, new_text, 1)
    print('  ✓ textToShow 现在有 segments 时优先使用 parsed.text')

with open('$FILE', 'w', encoding='utf-8') as f:
    f.write(content)
"

echo ""
echo "============================================================"
echo "✅ 全部 3 处修复已应用！"
echo ""
echo "修复内容："
echo "  1. splitTableBlockForStreaming: 表格后内容不再被当纯文本"
echo "  2. parseOptionBox: 始终解析（不再等打字机结束）"  
echo "  3. textToShow: 有 segments 时优先用解析后的文本"
echo ""
echo "下一步："
echo "  npm run dev    # 启动开发模式测试"
echo ""
echo "回滚："
echo "  cp ${FILE}.bak.* ${FILE}"
echo "============================================================"
