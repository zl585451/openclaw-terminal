# E 阶段：真实执行链路打通

**日期**：2026-04-29  
**阶段**：Enable（接 P1 重命名/清理阶段之后）  
**目标**：让系统能真实从 0→1 跑起来，调用真实 LLM，交付真实 DOCX/Markdown 产物

---

## 变更列表

### E-1：修复 batchOrchestrator AI Library 强依赖

**文件**：`oct-gateway/script_adapter/batchOrchestrator.js`

**问题**：`fetchBook` / `fetchChapters` / `fetchChapter` 在 ai_library 服务（port 8001）离线时 hard fail，整个批次启动失败，用户完全无法开工。

**修复**：
- `fetchBook(bookId, params)` — 当 `params.bookTitle` 存在时直接返回内联书籍对象，跳过 HTTP 请求；否则 try-catch 包裹，失败时给出 `AI_LIBRARY_UNAVAILABLE` 明确错误
- `fetchChapters(bookId, params)` — 当 `params.chapters` 数组存在时返回内联章节列表；否则 try-catch 包裹
- `fetchChapter(bookId, chapterIndex)` — try-catch 包裹，给出 `AI_LIBRARY_CHAPTER_UNAVAILABLE` 明确错误
- `startBatch` 在 `config.inlineChapterTexts` 存储内联章节文本（`params.chapters[i].text`）
- `executeChapter` 优先读 `batch.config.inlineChapterTexts[chapterIndex]`，有内联文本则跳过 `fetchChapter` HTTP 请求

**效果**：
- 当 ai_library 运行时：行为不变
- 当 ai_library 离线、调用方提供 `bookTitle + chapters[]`（含 `text`）时：批次可以正常启动并执行全链路

### E-2：修复 WorkbenchView 单章执行 realAgents 硬编码

**文件**：`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`

**问题**：`startExecution()` 中 `realAgents: 'off'` 硬编码，即使用户配置了真实 LLM，单章试跑路径（非批次）也永远使用 mock 数据。

**修复**：
- 添加 `executionMode` state（`'mock' | 'real'`，默认 `'mock'`）
- `startExecution()` 中改为 `realAgents: executionMode === 'real' ? 'all' : 'off'`
- 在工作台 main 区域（当 `!currentBatch` 时）显示执行模式单选："模拟演示（不调 LLM）" / "真实 Agent（调用 LLM，产生费用）"

**效果**：单章执行路径现在响应用户意图，选"真实"时会调用真实 LLM。

### E-3：config.json 添加 scriptAdapter 配置节点

**文件**：`oct-gateway/config.json`

**问题**：无 `scriptAdapter` 节点，LLM provider 配置不可见，也无法静态设置默认 `realAgents`。

**修复**：在 `ai_library` 节点之后添加：
```json
"scriptAdapter": {
  "_comment": "有声书台本 Agent 配置...",
  "realAgents": "off",
  "baseUrl": "",
  "apiKey": "",
  "model": ""
}
```

- `realAgents` 默认 `"off"`（安全侧）
- `baseUrl`/`apiKey`/`model` 留空时自动复用主 gateway provider
- 想全局开启真实 Agent，改 `"all"` 即可（UI 层的"真实 Agent"单选优先级更高）

### E-4：整理 batchOrchestrator runBatchLoop 缩进

**文件**：`oct-gateway/script_adapter/batchOrchestrator.js`

**问题**：while 循环结束后 `finalSnapshot` 块缩进错乱（6 空格混用 4 空格），`persistence.updateBatch` 和 `emit` 视觉上看起来在 `if (finalSnapshot)` 外面。

**修复**：整理为标准 4 空格缩进，删除冗余三元 `failedChapters > 0 ? 'completed' : 'completed'`，保持逻辑不变。

---

## 验收命令

```bash
node --check oct-gateway/index.js
node --check oct-gateway/script_adapter/batchOrchestrator.js
node --check oct-gateway/script_adapter/chapterPipeline.js
npx tsc --noEmit
```

---

## 完整 0→1 操作路径

**路径 A（有 ai_library）**：
1. 启动 ai_library 服务（port 8001）
2. 确认 LLM API Key 在设置面板已配置
3. 打开工作台 → 选书 → 选章节
4. 选"真实 Agent 试产" → 确认开工
5. 等待批次完成 → 点"导出 Word DOCX"

**路径 B（无 ai_library，直接传内容）**：
通过 WebSocket 向 `ws://127.0.0.1:18789` 发送：
```json
{
  "type": "req",
  "method": "scriptAdapter.batch.start",
  "params": {
    "bookId": "test-001",
    "bookTitle": "测试书名",
    "chapterIndices": [0],
    "chapters": [
      {
        "chapter_index": 0,
        "title": "第一章",
        "text": "章节正文内容……"
      }
    ],
    "config": {
      "executionMode": "real",
      "realAgents": "all",
      "deliveryOptions": {
        "adaptedScript": true,
        "voiceRegistry": true,
        "qualityReview": true,
        "cvDirections": false,
        "bgmSfx": false,
        "finalPackage": true
      }
    }
  }
}
```
然后监听 `script-adapter-event` 推送，批次完成后通过 IPC 导出 DOCX。
