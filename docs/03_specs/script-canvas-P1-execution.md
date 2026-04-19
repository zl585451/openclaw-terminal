# 剧本 Canvas P1 功能执行方案

> 文件路径：`docs/03_specs/script-canvas-P1-execution.md`  
> 前置条件：P0 已完成（剧本上传、解析、染色渲染已可用）  
> 执行顺序：P1-5 → P1-1 → P1-4 → P1-2 → P1-3（按依赖和风险排序）

---

## 禁区提醒（全局适用）

以下文件/模块本次 P1 所有任务**均不得修改**：

- `useTypewriter` hook / `StreamRouter` / `TurnFSM` / `ChatTab_v2.tsx` 的 block 渲染管线
- `_processContentChunk` / `_flushThinkState`
- `.chat-messages-wrap` 的 `display: block`
- `programmaticScrollRef` 逻辑

---

## P1-5：角色颜色自定义

**为什么先做这个**：最简单、无外部依赖、为后续筛选和导出建立"用户自定义颜色"数据流。

### 改动清单

#### Step 1: `src/utils/scriptParser.ts` — 修改

**目的**：将颜色分配逻辑从解析器内部硬编码，改为可外部覆盖。

**具体改动**：

在现有的 `parseScript()` 函数之外，新增一个独立的颜色分配函数，并导出：

```typescript
// ===== 新增：在文件底部添加 =====

/** 默认 15 色盘（与 P0 一致） */
export const DEFAULT_SCRIPT_COLORS: string[] = [
  // 把 parseScript 内部现有的 15 色数组复制到这里
  // 例如: '#E06C75', '#61AFEF', '#98C379', ...
];

/**
 * 合并用户自定义颜色到角色颜色映射
 * @param baseColors - parseScript 自动分配的颜色映射
 * @param customColors - 用户手动指定的 { 角色名: 颜色值 }
 * @returns 合并后的颜色映射（customColors 优先）
 */
export function mergeCharacterColors(
  baseColors: Record<string, string>,
  customColors: Record<string, string>
): Record<string, string> {
  return { ...baseColors, ...customColors };
}
```

同时，把 `parseScript()` 内部的颜色数组替换为引用 `DEFAULT_SCRIPT_COLORS`，确保单一数据源。

---

#### Step 2: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：在色标条区域添加颜色点击修改功能。

**具体改动**：

**2a. 新增状态：** 在 scriptPlugin 的渲染组件顶部添加：

```typescript
// 在组件函数内部，现有 state 声明附近添加
const [customColors, setCustomColors] = useState<Record<string, string>>({});
const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
```

**2b. 计算合并颜色：** 在渲染逻辑中：

```typescript
// 在使用 parsedScript.characterColors 的地方，替换为合并后的颜色
const effectiveColors = mergeCharacterColors(
  parsedScript.characterColors,
  customColors
);
```

**2c. 修改色标条渲染：** 找到色标条（角色名 + 颜色圆点的那一行），在每个角色色标上添加点击事件：

```tsx
{/* 色标条 - 找到现有的角色遍历渲染处，替换为 */}
{parsedScript.characters.map((char) => (
  <span
    key={char}
    className="script-color-tag"
    style={{ color: effectiveColors[char] }}
    onClick={() => setEditingCharacter(char)}
  >
    <span
      className="script-color-dot"
      style={{ backgroundColor: effectiveColors[char] }}
    />
    {char}
    {editingCharacter === char && (
      <div className="script-color-picker" onClick={(e) => e.stopPropagation()}>
        {DEFAULT_SCRIPT_COLORS.map((color) => (
          <button
            key={color}
            className="script-color-option"
            style={{ backgroundColor: color }}
            onClick={() => {
              setCustomColors((prev) => ({ ...prev, [char]: color }));
              setEditingCharacter(null);
            }}
          />
        ))}
      </div>
    )}
  </span>
))}
```

**2d. 正文台词渲染也使用 effectiveColors：** 找到正文区域中按 `characterColors[line.character]` 取色的地方，全部替换为 `effectiveColors[line.character]`。

---

#### Step 3: `src/styles/ChatTab.css`（或剧本相关的 CSS 文件）— 修改

**目的**：添加颜色选择器的样式。

**具体改动**：在文件底部追加：

```css
/* ===== 剧本角色颜色选择器 ===== */
.script-color-tag {
  position: relative;
  cursor: pointer;
  user-select: none;
}

.script-color-picker {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: var(--bg-panel, #2B2A27);
  border: 1px solid var(--border-subtle, #3E3D39);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  width: 160px;
}

.script-color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s;
  padding: 0;
}

.script-color-option:hover {
  border-color: rgba(255, 255, 255, 0.5);
}
```

### 验证方法

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` + `npm run start`
- [ ] 上传剧本后，色标条中点击角色名弹出颜色选择面板
- [ ] 选择新颜色后，色标和正文台词颜色同步更新
- [ ] 未自定义的角色保持默认颜色不变

---

## P1-1：按角色筛选视图

**为什么排第二**：依赖 P1-5 建立的 `effectiveColors` 数据流，且是 CV 用户最刚需的功能。

### 改动清单

#### Step 1: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：在色标条区域添加角色筛选 toggle。

**具体改动**：

**1a. 新增状态：**

```typescript
// 在组件函数内部添加
const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
// 空 Set = 显示全部，非空 = 只显示选中的角色
```

**1b. 新增筛选切换函数：**

```typescript
const toggleCharacterFilter = (char: string) => {
  setSelectedCharacters((prev) => {
    const next = new Set(prev);
    if (next.has(char)) {
      next.delete(char);
    } else {
      next.add(char);
    }
    return next;
  });
};

const clearFilter = () => setSelectedCharacters(new Set());
```

**1c. 修改色标条渲染（在 P1-5 基础上增强）：**

在色标条区域增加选中/未选中的视觉区分。在现有的 `.script-color-tag` 的 `onClick` 事件上做区分：

- **单击**：切换筛选
- **右键或长按**：打开颜色选择器（P1-5 的功能挪到右键/长按）

```tsx
{/* 色标条区域头部增加"全部"按钮 */}
<span
  className={`script-filter-all ${selectedCharacters.size === 0 ? 'active' : ''}`}
  onClick={clearFilter}
>
  全部
</span>

{parsedScript.characters.map((char) => (
  <span
    key={char}
    className={`script-color-tag ${
      selectedCharacters.size > 0 && !selectedCharacters.has(char) ? 'dimmed' : ''
    }`}
    style={{ color: effectiveColors[char] }}
    onClick={() => toggleCharacterFilter(char)}
    onContextMenu={(e) => {
      e.preventDefault();
      setEditingCharacter(char);
    }}
  >
    <span className="script-color-dot" style={{ backgroundColor: effectiveColors[char] }} />
    {char}
    {/* 颜色选择器保持不变 */}
  </span>
))}
```

**1d. 修改正文渲染——根据筛选过滤行：**

找到当前章节台词行的遍历渲染处（`chapter.lines.map(...)` 或类似逻辑），在 map 之前添加过滤：

```typescript
// 过滤逻辑：在渲染行之前
const visibleLines = selectedCharacters.size === 0
  ? currentChapter.lines
  : currentChapter.lines.filter((line) => {
      // 台词行：只显示选中角色
      if (line.type === 'dialogue' || line.type === 'dialogue2') {
        return selectedCharacters.has(line.character);
      }
      // 场景指令、章节标题、旁白：始终显示（提供上下文）
      if (line.type === 'scene' || line.type === 'chapter' || line.type === 'narrator') {
        return true;
      }
      // 导演备注：有任何筛选时隐藏
      if (line.type === 'direction') {
        return false;
      }
      // 正文行：有任何筛选时隐藏
      return false;
    });
```

**注意**：`line.type` 的具体取值需要对照 `scriptParser.ts` 中 `ScriptLine` 的 type 定义。如果 type 名称不同，按实际值替换。

#### Step 2: CSS 追加

```css
/* ===== 角色筛选 ===== */
.script-filter-all {
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #999);
  transition: all 0.15s;
}

.script-filter-all.active {
  color: var(--accent-primary, #E8A84C);
  background: var(--accent-primary-muted, rgba(232, 168, 76, 0.1));
}

.script-color-tag.dimmed {
  opacity: 0.3;
}
```

### 验证方法

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` + `npm run start`
- [ ] 点击色标条中的角色名，正文只显示该角色台词 + 场景指令
- [ ] 可多选多个角色
- [ ] 点击"全部"恢复完整视图
- [ ] 右键色标可修改颜色（P1-5 功能不受影响）

---

## P1-4：导出回 .txt

**为什么排第三**：无 AI 依赖，纯前端功能，且为 P1-2/P1-3 的 AI 修改结果提供导出通道。

### 改动清单

#### Step 1: `src/utils/scriptExporter.ts` — 新建

**目的**：将 `ParsedScript` 结构序列化回标准格式纯文本。

```typescript
import type { ParsedScript, ScriptLine, ScriptChapter } from './scriptParser';

/**
 * 将 ParsedScript 导出为 OCT 标准格式文本
 */
export function exportScriptToText(script: ParsedScript): string {
  const lines: string[] = [];

  // 标题
  lines.push(script.title);
  lines.push('');

  script.chapters.forEach((chapter, chapterIndex) => {
    // 章节标题
    if (chapter.title && chapter.title !== '（无章节标题）') {
      lines.push(chapter.title);
      lines.push('');
    }

    chapter.lines.forEach((line) => {
      lines.push(serializeLine(line));
    });

    // 章节间空行
    if (chapterIndex < script.chapters.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}

function serializeLine(line: ScriptLine): string {
  // 根据 ScriptLine 的 type 字段还原格式
  // 以下 type 名称需要对照 scriptParser.ts 中的实际定义

  switch (line.type) {
    case 'chapter':
      return line.raw || line.text || '';

    case 'scene':
    case 'music':
    case 'sfx':
      // 场景指令类：还原为 【标签】内容
      return line.raw || line.text || '';

    case 'narrator':
      // 旁白：还原原始格式
      return line.raw || line.text || '';

    case 'direction':
      // 导演备注
      return line.raw || line.text || '';

    case 'dialogue':
      // 格式1：角色名：台词
      if (line.character && line.text) {
        return `${line.character}：${line.text}`;
      }
      return line.raw || line.text || '';

    case 'dialogue2':
      // 格式2：【角色名】（情绪）台词
      if (line.character) {
        const emotion = line.emotion ? `（${line.emotion}）` : '';
        return `【${line.character}】${emotion}${line.text || ''}`;
      }
      return line.raw || line.text || '';

    default:
      // 正文：原样
      return line.raw || line.text || '';
  }
}
```

**⚠️ 重要提示**：上面的 `line.type`、`line.raw`、`line.text`、`line.character`、`line.emotion` 等字段名需要与 `scriptParser.ts` 中 `ScriptLine` 的实际定义对齐。执行前请先打开 `src/utils/scriptParser.ts`，检查 `ScriptLine` interface 的字段名和 type union 的取值，替换为实际值。

---

#### Step 2: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：在工具栏或面板中添加"导出 TXT"按钮。

**具体改动**：

**2a. 引入导出函数：**

```typescript
// 在文件顶部的 import 区域添加
import { exportScriptToText } from '../../utils/scriptExporter';
```

**2b. 添加导出处理函数：**

```typescript
// 在组件函数内部添加
const handleExportTxt = () => {
  if (!parsedScript) return;
  const text = exportScriptToText(parsedScript);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${parsedScript.title || '剧本'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
```

**注意**：这里使用浏览器下载方式。如果 Electron 环境中 `Blob` 下载不工作，替代方案是通过 IPC 调用主进程的 `dialog.showSaveDialog` + `fs.writeFile`。先试浏览器方式，不行再改 IPC。

**2c. 在工具栏中添加导出按钮：** 找到工具栏（📄 剧本 / Details / Copy / Export / ✕ 那一行），在 Export 按钮的位置或旁边添加：

```tsx
<button
  className="workbench-toolbar-btn"
  onClick={handleExportTxt}
  title="导出为 TXT"
>
  📥 导出 TXT
</button>
```

### 验证方法

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` + `npm run start`
- [ ] 上传剧本 → 点击导出 TXT → 浏览器弹出下载
- [ ] 下载的 TXT 用文本编辑器打开，格式与原文件基本一致
- [ ] 如果浏览器下载不触发，需改用 IPC 方式（见上面注意）

---

## P1-2：选段 AI 润色

**为什么排第四**：需要与 oct-gateway 的 AI 调用链路配合，涉及前后端联动。

### 改动清单

#### Step 1: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：添加文本选择 + AI 润色弹出按钮。

**具体改动**：

**1a. 新增状态：**

```typescript
const [selectedText, setSelectedText] = useState<string>('');
const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
const [isPolishing, setIsPolishing] = useState(false);
const [polishResult, setPolishResult] = useState<string | null>(null);
```

**1b. 文本选择监听：** 在正文渲染区域的容器 div 上添加 `onMouseUp` 事件：

```typescript
const handleTextSelection = () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    setSelectedText('');
    setSelectionPosition(null);
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 5) return; // 太短的选择忽略

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  setSelectedText(text);
  setSelectionPosition({
    top: rect.top - 40,  // 按钮显示在选择区上方
    left: rect.left + rect.width / 2,
  });
};
```

**1c. AI 润色调用：** 通过 WebSocket 发送润色请求给 oct-gateway。

```typescript
const handlePolish = async () => {
  if (!selectedText) return;
  setIsPolishing(true);
  setPolishResult(null);

  try {
    // 通过 electronAPI 发送消息给 gateway
    // 这里的具体方法取决于现有的 WebSocket 通信方式
    // 方案 A：直接用现有的 chat WebSocket 发一条特殊消息
    // 方案 B：新增一个 IPC 通道专门处理非聊天 AI 调用
    //
    // 推荐方案 B，避免污染聊天消息流。
    // 需要在 oct-gateway 新增一个 HTTP endpoint 或 WebSocket 消息类型

    const response = await fetch('http://localhost:3377/api/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: selectedText,
        instruction: '请润色以下台词，保持角色语气和风格，使表达更生动自然：',
      }),
    });

    const data = await response.json();
    if (data.success && data.result) {
      setPolishResult(data.result);
    }
  } catch (err) {
    console.error('AI 润色失败:', err);
  } finally {
    setIsPolishing(false);
  }
};
```

**1d. 润色 UI 渲染：** 在正文容器内添加浮动按钮和结果面板：

```tsx
{/* 选择浮动按钮 */}
{selectionPosition && selectedText && (
  <div
    className="script-polish-trigger"
    style={{
      position: 'fixed',
      top: selectionPosition.top,
      left: selectionPosition.left,
      transform: 'translateX(-50%)',
    }}
  >
    <button
      className="script-polish-btn"
      onClick={handlePolish}
      disabled={isPolishing}
    >
      {isPolishing ? '润色中...' : '✨ AI 润色'}
    </button>
  </div>
)}

{/* 润色结果面板 */}
{polishResult && (
  <div className="script-polish-result">
    <div className="script-polish-result-header">
      <span>✨ 润色结果</span>
      <button onClick={() => setPolishResult(null)}>✕</button>
    </div>
    <div className="script-polish-result-body">
      <div className="script-polish-original">
        <strong>原文：</strong>{selectedText}
      </div>
      <div className="script-polish-new">
        <strong>润色：</strong>{polishResult}
      </div>
      <div className="script-polish-actions">
        <button onClick={() => {
          // TODO: 替换原文逻辑（需要修改 parsedScript 数据）
          // 暂时先复制到剪贴板
          navigator.clipboard.writeText(polishResult);
          setPolishResult(null);
        }}>
          📋 复制润色结果
        </button>
        <button onClick={() => setPolishResult(null)}>取消</button>
      </div>
    </div>
  </div>
)}
```

---

#### Step 2: `oct-gateway/index.js` — 修改

**目的**：新增 `/api/polish` HTTP endpoint。

**具体改动**：在现有的 HTTP server 处理逻辑中（找到 `createServer` 或路由定义处），添加一个新的路由：

```javascript
// 在现有路由之后添加
// 找到 HTTP 请求处理函数，添加以下分支

if (req.method === 'POST' && req.url === '/api/polish') {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const { text, instruction } = JSON.parse(body);

      // 复用现有的 AI 调用逻辑
      // 调用 ai.js 中的方法，发送非流式请求
      const ai = require('./ai');
      const result = await ai.chatCompletion({
        messages: [
          { role: 'system', content: '你是一个专业的剧本编辑。用户会给你一段台词，请按照指令润色。只输出润色后的台词，不要解释。' },
          { role: 'user', content: `${instruction}\n\n${text}` },
        ],
        stream: false,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
  return;
}
```

**⚠️ 重要提示**：上面的 `ai.chatCompletion` 是假设的函数名。实际需要看 `oct-gateway/ai.js` 中导出的非流式调用方法叫什么。执行前先检查 `ai.js` 的导出内容。如果只有流式方法，需要新增一个非流式包装函数。

---

#### Step 3: CSS 追加

```css
/* ===== AI 润色 ===== */
.script-polish-trigger {
  z-index: 100;
}

.script-polish-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--accent-primary, #E8A84C);
  background: var(--bg-panel, #2B2A27);
  color: var(--accent-primary, #E8A84C);
  font-size: var(--text-sm, 13px);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.script-polish-btn:hover:not(:disabled) {
  background: var(--accent-primary-muted, rgba(232, 168, 76, 0.1));
}

.script-polish-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.script-polish-result {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 400px;
  max-height: 300px;
  background: var(--bg-panel, #2B2A27);
  border: 1px solid var(--border-subtle, #3E3D39);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 200;
  overflow: hidden;
}

.script-polish-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle, #3E3D39);
  font-size: var(--text-sm, 13px);
  color: var(--accent-primary, #E8A84C);
}

.script-polish-result-body {
  padding: 12px;
  font-size: var(--text-sm, 13px);
  line-height: 1.6;
  overflow-y: auto;
  max-height: 240px;
}

.script-polish-original {
  color: var(--text-tertiary, #666);
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-subtle, #3E3D39);
}

.script-polish-new {
  color: var(--text-primary, #E8E6E1);
  margin-bottom: 12px;
}

.script-polish-actions {
  display: flex;
  gap: 8px;
}

.script-polish-actions button {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle, #3E3D39);
  background: transparent;
  color: var(--text-secondary, #999);
  font-size: var(--text-sm, 13px);
  cursor: pointer;
}
```

### 验证方法

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` + `npm run start`
- [ ] Gateway 也重启（因为改了 `index.js`）
- [ ] 在剧本正文中选中一段台词，出现"✨ AI 润色"浮动按钮
- [ ] 点击按钮，等待几秒后弹出润色结果面板
- [ ] 可复制润色结果
- [ ] 选择小于 5 字不触发按钮
- [ ] Gateway 控制台无报错

---

## P1-3：章节级 AI 操作

**为什么排最后**：依赖 P1-2 建立的 `/api/polish` 后端通道，且是最复杂的功能。

### 改动清单

#### Step 1: `oct-gateway/index.js` — 修改

**目的**：新增 `/api/script-chapter-rewrite` endpoint，处理章节级改写。

```javascript
if (req.method === 'POST' && req.url === '/api/script-chapter-rewrite') {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const { chapterText, characterName, instruction } = JSON.parse(body);

      const ai = require('./ai');
      const result = await ai.chatCompletion({
        messages: [
          {
            role: 'system',
            content: `你是一个专业的剧本编辑。用户会给你一整幕的剧本内容，以及一个角色名和修改指令。
请只修改该角色的台词，保持其他角色台词和场景描述不变。
输出完整的章节内容（包括未修改的部分），保持原有格式。`
          },
          {
            role: 'user',
            content: `角色：${characterName}\n指令：${instruction}\n\n章节内容：\n${chapterText}`
          },
        ],
        stream: false,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
  return;
}
```

---

#### Step 2: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：在章节目录区域添加右键菜单，提供"改写此角色台词风格"操作。

**具体改动**：

**2a. 新增状态：**

```typescript
const [chapterMenuTarget, setChapterMenuTarget] = useState<{
  chapterIndex: number;
  position: { top: number; left: number };
} | null>(null);
const [rewriteDialogOpen, setRewriteDialogOpen] = useState(false);
const [rewriteCharacter, setRewriteCharacter] = useState<string>('');
const [rewriteInstruction, setRewriteInstruction] = useState<string>('');
const [isRewriting, setIsRewriting] = useState(false);
```

**2b. 章节目录右键菜单：** 在左侧章节目录的章节标题元素上添加 `onContextMenu`：

```tsx
{parsedScript.chapters.map((chapter, idx) => (
  <div
    key={idx}
    className={`script-chapter-item ${idx === currentChapterIndex ? 'active' : ''}`}
    onClick={() => setCurrentChapterIndex(idx)}
    onContextMenu={(e) => {
      e.preventDefault();
      setChapterMenuTarget({
        chapterIndex: idx,
        position: { top: e.clientY, left: e.clientX },
      });
    }}
  >
    {chapter.title}
  </div>
))}

{/* 右键菜单 */}
{chapterMenuTarget && (
  <div
    className="script-chapter-menu"
    style={{
      position: 'fixed',
      top: chapterMenuTarget.position.top,
      left: chapterMenuTarget.position.left,
    }}
  >
    <button onClick={() => {
      setRewriteDialogOpen(true);
      setChapterMenuTarget(null);
    }}>
      ✏️ AI 改写角色台词风格
    </button>
    <button onClick={() => setChapterMenuTarget(null)}>取消</button>
  </div>
)}
```

**2c. 改写对话框：**

```tsx
{rewriteDialogOpen && (
  <div className="script-rewrite-dialog-overlay" onClick={() => setRewriteDialogOpen(false)}>
    <div className="script-rewrite-dialog" onClick={(e) => e.stopPropagation()}>
      <h3>AI 改写 — {parsedScript.chapters[chapterMenuTarget?.chapterIndex ?? currentChapterIndex]?.title}</h3>

      <label>选择角色：</label>
      <select
        value={rewriteCharacter}
        onChange={(e) => setRewriteCharacter(e.target.value)}
      >
        <option value="">请选择角色</option>
        {parsedScript.characters.map((char) => (
          <option key={char} value={char}>{char}</option>
        ))}
      </select>

      <label>改写指令：</label>
      <input
        type="text"
        value={rewriteInstruction}
        onChange={(e) => setRewriteInstruction(e.target.value)}
        placeholder="例如：让语气更强硬、加入古风用词、更口语化"
      />

      <div className="script-rewrite-actions">
        <button
          disabled={!rewriteCharacter || !rewriteInstruction || isRewriting}
          onClick={async () => {
            setIsRewriting(true);
            try {
              const targetChapter = parsedScript.chapters[chapterMenuTarget?.chapterIndex ?? currentChapterIndex];
              // 将章节内容序列化为文本
              const chapterText = targetChapter.lines
                .map((l) => l.raw || l.text || '')
                .join('\n');

              const response = await fetch('http://localhost:3377/api/script-chapter-rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chapterText,
                  characterName: rewriteCharacter,
                  instruction: rewriteInstruction,
                }),
              });

              const data = await response.json();
              if (data.success && data.result) {
                // 显示结果供用户确认
                // 这里可以弹出对比面板，或者直接用结果重新解析
                // 最简单的方式：把结果作为 polishResult 显示
                setPolishResult(data.result);
              }
            } catch (err) {
              console.error('章节改写失败:', err);
            } finally {
              setIsRewriting(false);
              setRewriteDialogOpen(false);
            }
          }}
        >
          {isRewriting ? '改写中...' : '开始改写'}
        </button>
        <button onClick={() => setRewriteDialogOpen(false)}>取消</button>
      </div>
    </div>
  </div>
)}
```

---

#### Step 3: CSS 追加

```css
/* ===== 章节右键菜单 ===== */
.script-chapter-menu {
  z-index: 200;
  background: var(--bg-panel, #2B2A27);
  border: 1px solid var(--border-subtle, #3E3D39);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  padding: 4px;
  min-width: 180px;
}

.script-chapter-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  font-size: var(--text-sm, 13px);
  cursor: pointer;
  border-radius: 4px;
}

.script-chapter-menu button:hover {
  background: var(--bg-hover, #3E3D39);
  color: var(--text-primary, #E8E6E1);
}

/* ===== 改写对话框 ===== */
.script-rewrite-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}

.script-rewrite-dialog {
  background: var(--bg-panel, #2B2A27);
  border: 1px solid var(--border-subtle, #3E3D39);
  border-radius: 8px;
  padding: 20px;
  width: 400px;
  max-width: 90vw;
}

.script-rewrite-dialog h3 {
  margin: 0 0 16px;
  font-size: var(--text-base, 15px);
  color: var(--accent-primary, #E8A84C);
}

.script-rewrite-dialog label {
  display: block;
  margin-bottom: 4px;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #999);
}

.script-rewrite-dialog select,
.script-rewrite-dialog input {
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle, #3E3D39);
  background: var(--bg-input, #1E1D1A);
  color: var(--text-primary, #E8E6E1);
  font-size: var(--text-sm, 13px);
}

.script-rewrite-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.script-rewrite-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle, #3E3D39);
  background: transparent;
  color: var(--text-secondary, #999);
  font-size: var(--text-sm, 13px);
  cursor: pointer;
}

.script-rewrite-actions button:first-child:not(:disabled) {
  border-color: var(--accent-primary, #E8A84C);
  color: var(--accent-primary, #E8A84C);
}

.script-rewrite-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 验证方法

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` + `npm run start`
- [ ] Gateway 重启
- [ ] 右键章节目录中的章节标题，弹出"AI 改写角色台词风格"菜单
- [ ] 在对话框中选择角色、输入指令，点击开始改写
- [ ] 改写完成后显示结果面板
- [ ] 结果可复制

---

## 全局执行顺序总结

```
P1-5（颜色自定义） ← 最简单，建立 effectiveColors 数据流
  ↓
P1-1（角色筛选）   ← 依赖 effectiveColors，CV 最刚需
  ↓
P1-4（导出 TXT）   ← 无 AI 依赖，纯前端
  ↓
P1-2（选段润色）   ← 需要 Gateway 新增 API
  ↓
P1-3（章节改写）   ← 依赖 P1-2 的 Gateway 通道
```

每完成一个功能后：
1. 运行 `npx tsc --noEmit`
2. `npm run build` + `npm run start` 冒烟测试
3. `git add -A :!resources/nocturne_memory :!"docs/发布文档"`
4. `git commit -m "feat(script-canvas): P1-N 简短描述"`
