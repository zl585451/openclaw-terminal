# OCT ImageStudio 功能实现规范

> 目标：在 OCT 中实现文生图 / 图生图功能，AMY 可协助优化提示词，结果注入聊天流。  
> 执行方式：按 Step 顺序逐步完成，每步结束后运行 `npx tsc --noEmit`，无报错再继续。  
> **绝对禁止**：不得修改任何现有消息链路逻辑（chat.send / streamChat / useMessages / useWebSocket 均不得改动），只在旁路新增。

---

## 架构说明（读完再动手）

```
ImageStudio 组件（React）
    │
    │ 点击「生成」
    ▼
window.electronAPI.imageGenerate(payload)   ← 新增 IPC
    │
    ▼
electron/main.ts  ipcMain.handle('image-generate')
    │  直接调用 openclawWs.send(JSON)，type=req, method=image.generate
    ▼
oct-gateway/index.js   method === 'image.generate' 分支
    │
    ▼
oct-gateway/image_gen.js   handleImageGenerate()
    │  调用 MiniMax / OpenAI兼容 REST API
    ▼
gateway 把结果通过 ws.send 回传
    │
    ▼
main.ts  收到 method=image.generate 的 res → mainWindow.webContents.send('image-result', payload)
    │
    ▼
ImageStudio useEffect 监听 window.electronAPI.onImageResult
    │  收到图片 URL → 更新预览 → 调用 onInsertToChat(url)
    ▼
ChatTab.v2.tsx  setMessages 插入一条 assistant 消息（带图片 Markdown）
```

**关键原则**：图片生成走独立 IPC `image-generate` / `image-result`，完全不经过 `openclaw-send` / `chat.send` 链路，零污染聊天 context。

---

## Step 1：oct-gateway/image_gen.js（新建文件）

**新建文件**：`oct-gateway/image_gen.js`

内容如下，完整粘贴，不要修改现有任何文件：

```js
/**
 * oct-gateway/image_gen.js
 * OCT ImageStudio 生图处理器
 * 支持：MiniMax image-01 / OpenAI DALL-E 兼容接口
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * 解析 size 字符串为宽高，返回 { width, height }
 * 支持格式：'1024x1024' / '1:1' / '16:9' 等
 */
function parseSize(sizeStr) {
  if (!sizeStr) return { width: 1024, height: 1024 };
  if (sizeStr.includes('x')) {
    const [w, h] = sizeStr.split('x').map(Number);
    return { width: w || 1024, height: h || 1024 };
  }
  // aspect ratio 格式，默认以 1024 为基准长边
  if (sizeStr.includes(':')) {
    const [a, b] = sizeStr.split(':').map(Number);
    if (a >= b) return { width: 1024, height: Math.round(1024 * b / a) };
    return { width: Math.round(1024 * a / b), height: 1024 };
  }
  return { width: 1024, height: 1024 };
}

/**
 * 将 size 转为 MiniMax 的 aspect_ratio 格式
 * MiniMax image-01 接受：1:1 / 16:9 / 9:16 / 4:3 / 3:4
 */
function sizeToAspectRatio(sizeStr) {
  const MAP = {
    '1024x1024': '1:1',
    '1280x720':  '16:9',
    '720x1280':  '9:16',
    '1024x768':  '4:3',
    '768x1024':  '3:4',
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
  };
  return MAP[sizeStr] || '1:1';
}

/**
 * 通用 HTTP/HTTPS POST，返回 Promise<Object>
 */
function httpPost(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 60000,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout (60s)')); });
    req.write(bodyStr);
    req.end();
  });
}

/**
 * MiniMax image-01 adapter
 * API 文档：https://platform.minimaxi.com/document/image-generation
 */
async function minimaxAdapter(payload, config) {
  const baseUrl = (config.IMAGE_BASE_URL || 'https://api.minimax.chat').replace(/\/$/, '');
  const url = `${baseUrl}/v1/image_generation`;
  const apiKey = config.resolvedApiKey;
  const model = config.IMAGE_MODEL || 'image-01';
  const aspectRatio = sizeToAspectRatio(config.IMAGE_SIZE || '1024x1024');

  const body = {
    model,
    prompt: payload.prompt,
    negative_prompt: payload.negativePrompt || '',
    aspect_ratio: aspectRatio,
    response_format: 'url',
    n: 1,
  };

  // 图生图：加 subject_reference
  if (payload.referenceImageUrl) {
    body.subject_reference = [{
      type: 'character',
      image_url: payload.referenceImageUrl,
    }];
  }

  const result = await httpPost(url, { 'Authorization': `Bearer ${apiKey}` }, body);

  // 响应路径尝试多种格式
  const imageUrl =
    result?.data?.[0]?.url ||
    result?.image_url ||
    result?.data?.image_url ||
    result?.output?.image_url ||
    null;

  if (!imageUrl) {
    throw new Error(`MiniMax 未返回图片 URL。响应：${JSON.stringify(result).slice(0, 300)}`);
  }
  return imageUrl;
}

/**
 * OpenAI DALL-E / 兼容接口 adapter
 * 兼容：SiliconFlow、Azure OpenAI、其他 /v1/images/generations 接口
 */
async function openaiAdapter(payload, config) {
  const baseUrl = (config.IMAGE_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
  const url = `${baseUrl}/v1/images/generations`;
  const apiKey = config.resolvedApiKey;
  const model = config.IMAGE_MODEL || 'dall-e-3';
  const size = config.IMAGE_SIZE || '1024x1024';

  const body = {
    model,
    prompt: payload.prompt,
    n: 1,
    size,
    response_format: 'url',
  };

  const result = await httpPost(url, { 'Authorization': `Bearer ${apiKey}` }, body);

  const imageUrl = result?.data?.[0]?.url || null;
  if (!imageUrl) {
    throw new Error(`接口未返回图片 URL。响应：${JSON.stringify(result).slice(0, 300)}`);
  }
  return imageUrl;
}

/**
 * 主入口：handleImageGenerate
 * @param {Object} payload - { requestId, prompt, negativePrompt?, referenceImageUrl? }
 * @param {Object} rawConfig - 从 getEnvOrConfig 读取的配置对象
 * @param {Function} sendToClient - function(msg: Object) 回传给 ws 客户端
 */
async function handleImageGenerate(payload, rawConfig, sendToClient) {
  const requestId = payload.requestId || `img_${Date.now()}`;

  // --- 解析 API Key（优先级：IMAGE_API_KEY > provider fallback）---
  let resolvedApiKey = rawConfig.IMAGE_API_KEY || '';
  if (!resolvedApiKey || resolvedApiKey.length < 5) {
    const provider = (rawConfig.IMAGE_PROVIDER || 'minimax').toLowerCase();
    if (provider === 'minimax') {
      resolvedApiKey = rawConfig.MINIMAX_API_KEY || rawConfig.DASHSCOPE_API_KEY || '';
    } else {
      resolvedApiKey = rawConfig.DASHSCOPE_API_KEY || rawConfig.MINIMAX_API_KEY || '';
    }
  }

  if (!resolvedApiKey) {
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: { requestId, error: '未配置生图 API Key，请在设置 → 生图配置中填写' },
    });
    return;
  }

  if (!payload.prompt || !payload.prompt.trim()) {
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: { requestId, error: '提示词不能为空' },
    });
    return;
  }

  const config = { ...rawConfig, resolvedApiKey };

  // 发送进度通知
  sendToClient({
    type: 'res',
    method: 'image.generate',
    ok: true,
    payload: { requestId, status: 'generating', message: '正在生成图片...' },
  });

  try {
    const provider = (rawConfig.IMAGE_PROVIDER || 'minimax').toLowerCase();
    let imageUrl;
    if (provider === 'minimax') {
      imageUrl = await minimaxAdapter(payload, config);
    } else {
      // openai 或 auto（根据 base_url 也走 openai 兼容）
      imageUrl = await openaiAdapter(payload, config);
    }

    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: true,
      payload: {
        requestId,
        status: 'done',
        imageUrl,
        prompt: payload.prompt,
        negativePrompt: payload.negativePrompt || '',
      },
    });
  } catch (err) {
    console.error('[image_gen] 生图失败:', err.message);
    sendToClient({
      type: 'res',
      method: 'image.generate',
      ok: false,
      payload: { requestId, error: err.message || '生图请求失败，请检查 API Key 和网络' },
    });
  }
}

module.exports = { handleImageGenerate };
```

---

## Step 2：oct-gateway/index.js（添加路由分支）

**修改文件**：`oct-gateway/index.js`

找到文件顶部 `require` 区域，在其他 require 之后追加：

```js
const { handleImageGenerate } = require('./image_gen');
```

---

然后找到 WebSocket 消息处理区域。该区域通常有 `ws.on('message', ...)` 或处理 `msg.method` 的 switch/if 块。  
找到处理 `method === 'chat.send'` 的位置，在其**上方**（优先级更高）插入以下代码块：

```js
// ── 生图路由（优先级高于 chat.send，完全独立，不进入 AI 上下文）──
if (msg.method === 'image.generate') {
  const { getEnvOrConfig } = require('./config');
  const imageConfig = {
    IMAGE_PROVIDER:  getEnvOrConfig('IMAGE_PROVIDER')  || 'minimax',
    IMAGE_API_KEY:   getEnvOrConfig('IMAGE_API_KEY')   || '',
    IMAGE_BASE_URL:  getEnvOrConfig('IMAGE_BASE_URL')  || 'https://api.minimax.chat',
    IMAGE_MODEL:     getEnvOrConfig('IMAGE_MODEL')     || 'image-01',
    IMAGE_SIZE:      getEnvOrConfig('IMAGE_SIZE')      || '1024x1024',
    DASHSCOPE_API_KEY: getEnvOrConfig('DASHSCOPE_API_KEY') || '',
    MINIMAX_API_KEY:   getEnvOrConfig('MINIMAX_API_KEY')   || '',
  };
  handleImageGenerate(
    msg.params || {},
    imageConfig,
    (responseMsg) => {
      try { ws.send(JSON.stringify(responseMsg)); } catch (e) { /* ignore */ }
    }
  );
  return; // 不继续走 chat.send
}
```

> **注意**：只添加这一块，不修改任何已有的 `chat.send` / `handleSlashCommand` / `streamChat` 逻辑。

---

## Step 3：electron/main.ts（添加 IPC 通道）

**修改文件**：`electron/main.ts`

### 3-A：添加 image-generate IPC handler

找到其他 `ipcMain.handle(...)` 注册的位置（如 `get-api-keys`、`openclaw-send` 等附近），在其后追加：

```typescript
// ── 生图 IPC：前端 → Gateway，绕过 chat.send 链路 ──
ipcMain.handle('image-generate', async (_event, payload: {
  requestId: string;
  prompt: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
}) => {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'Gateway 未连接，请先启动 Gateway' };
  }
  const msg = {
    type: 'req',
    id: payload.requestId || `img_${Date.now()}`,
    method: 'image.generate',
    params: {
      requestId: payload.requestId,
      prompt: payload.prompt,
      negativePrompt: payload.negativePrompt || '',
      referenceImageUrl: payload.referenceImageUrl || '',
    },
  };
  try {
    openclawWs.send(JSON.stringify(msg));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || '发送失败' };
  }
});
```

### 3-B：在 gateway 消息转发处拦截 image.generate 响应

找到 `main.ts` 中处理 Gateway → 前端消息转发的函数（通常叫 `handleMessage` 或在 `ws.on('message', ...)` 里）。  
找到 `switch (msg.method)` 或处理各种 method 的地方，在处理 `chat` 消息的分支**之前**插入：

```typescript
// 生图响应：转发给前端专用 image-result 通道
if (msg.method === 'image.generate') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('image-result', msg.payload || {});
  }
  return; // 不走聊天转发
}
```

### 3-C：在 preload.ts 暴露新 API

**修改文件**：`electron/preload.ts`（或 `preload.js`）

找到 `contextBridge.exposeInMainWorld('electronAPI', { ... })` 中的对象，在已有 API 之后追加两个新方法（注意不要破坏已有 API 的逗号结构）：

```typescript
// 生图相关
imageGenerate: (payload: {
  requestId: string;
  prompt: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
}) => ipcRenderer.invoke('image-generate', payload),

onImageResult: (callback: (payload: any) => void) => {
  const handler = (_event: any, payload: any) => callback(payload);
  ipcRenderer.on('image-result', handler);
  // 返回 cleanup 函数
  return () => ipcRenderer.removeListener('image-result', handler);
},
```

运行 `npx tsc --noEmit`，确认无类型报错。

---

## Step 4：设置面板新增生图配置区（SettingsPanel.tsx + useApiKeys.ts）

### 4-A：useApiKeys.ts — 添加默认值

**修改文件**：`src/hooks/settings/useApiKeys.ts`

找到初始 `apiKeys` state 定义（包含 `DASHSCOPE_API_KEY`、`OCT_MODEL` 等字段的对象），在其中追加 5 个新字段：

```typescript
IMAGE_PROVIDER: '',
IMAGE_API_KEY: '',
IMAGE_BASE_URL: '',
IMAGE_MODEL: '',
IMAGE_SIZE: '',
```

找到 `buildGatewayPayload` 函数（或类似的把 apiKeys 打包发给 Gateway 的函数），确认这 5 个新 key 会被包含进去（通常是展开 `...apiKeys` 就自动包含了，无需额外处理）。

### 4-B：SettingsPanel.tsx — 新增生图配置 section

**修改文件**：`src/components/SettingsPanel.tsx`

找到 `activeTab === 'required'` 的渲染块（含「1. Gateway 连接」和「2. AI 服务商与模型」两个 section）。  
在「2. AI 服务商与模型」section 的**末尾**（`</section>` 之后）追加以下 JSX，不修改任何已有代码：

```tsx
<section className="settings-section">
  <h3>3. 生图配置</h3>
  <p className="settings-desc">
    独立于聊天模型的生图 API 配置。留空 API Key 则自动复用当前聊天服务商的 Key。
  </p>

  {/* 生图服务商 */}
  <div className="settings-field">
    <label>生图服务商</label>
    <select
      value={apiKeys.IMAGE_PROVIDER || 'minimax'}
      onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_PROVIDER: e.target.value }))}
      className="settings-input settings-input-focusable"
    >
      <option value="minimax">MiniMax image-01（推荐）</option>
      <option value="openai">OpenAI DALL-E / 兼容接口</option>
    </select>
  </div>

  {/* 生图 API Key */}
  <div className="settings-field">
    <label>生图 API Key</label>
    <div className="settings-input-row">
      <input
        type={showApiKey.IMAGE_API_KEY ? 'text' : 'password'}
        value={apiKeys.IMAGE_API_KEY || ''}
        onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_API_KEY: e.target.value }))}
        placeholder="留空则自动复用聊天服务商的 Key"
        className="settings-input settings-input-focusable"
        autoComplete="off"
      />
      <button
        type="button"
        className="settings-eye-btn"
        onClick={() => setShowApiKey((s) => ({ ...s, IMAGE_API_KEY: !s.IMAGE_API_KEY }))}
      >
        {showApiKey.IMAGE_API_KEY ? '🙈' : '👁'}
      </button>
    </div>
  </div>

  {/* Base URL */}
  <div className="settings-field">
    <label>生图 Base URL</label>
    <input
      type="text"
      value={apiKeys.IMAGE_BASE_URL || ''}
      onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_BASE_URL: e.target.value }))}
      placeholder="https://api.minimax.chat（留空用默认值）"
      className="settings-input settings-input-focusable"
      autoComplete="off"
    />
  </div>

  {/* 生图模型 */}
  <div className="settings-field">
    <label>生图模型</label>
    <input
      type="text"
      value={apiKeys.IMAGE_MODEL || ''}
      onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_MODEL: e.target.value }))}
      placeholder="image-01（MiniMax）或 dall-e-3（OpenAI）"
      className="settings-input settings-input-focusable"
      autoComplete="off"
    />
  </div>

  {/* 图片尺寸 */}
  <div className="settings-field">
    <label>图片尺寸</label>
    <select
      value={apiKeys.IMAGE_SIZE || '1024x1024'}
      onChange={(e) => setApiKeys((k) => ({ ...k, IMAGE_SIZE: e.target.value }))}
      className="settings-input settings-input-focusable"
    >
      <option value="1024x1024">1024×1024（方形 1:1）</option>
      <option value="1280x720">1280×720（横向 16:9）</option>
      <option value="720x1280">720×1280（竖向 9:16）</option>
      <option value="1024x768">1024×768（横向 4:3）</option>
      <option value="768x1024">768×1024（竖向 3:4）</option>
    </select>
  </div>
</section>
```

同时在 `showApiKey` 的初始 state（含 `DASHSCOPE_API_KEY: false` 等的对象）中追加：

```typescript
IMAGE_API_KEY: false,
```

运行 `npx tsc --noEmit`，确认无报错。

---

## Step 5：新建 ImageStudio 组件

**新建文件**：`src/ui/image/ImageStudio.tsx`

完整内容如下：

```tsx
/**
 * src/ui/image/ImageStudio.tsx
 * OCT 生图工作台
 * - 文生图 / 图生图 模式切换
 * - AMY 协助优化提示词
 * - 生成结果展示（最近 8 张）
 * - 通过 electronAPI.imageGenerate 走独立 IPC，不污染聊天上下文
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ImageResult {
  url: string;
  prompt: string;
  timestamp: number;
}

interface ImageStudioProps {
  /** 向聊天区发送消息（AMY 优化 prompt 时使用） */
  onSendToChat: (text: string) => void;
  /** 父级调用此方法注入 AMY 返回的优化 prompt */
  registerPromptInjector: (fn: (prompt: string) => void) => void;
  /** 生图成功后，把图片 URL 插入聊天流 */
  onInsertImageToChat: (imageUrl: string, prompt: string) => void;
}

const ImageStudio: React.FC<ImageStudioProps> = ({
  onSendToChat,
  registerPromptInjector,
  onInsertImageToChat,
}) => {
  const [mode, setMode] = useState<'text2img' | 'img2img'>('text2img');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ImageResult | null>(null);
  const currentRequestId = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // 注册 prompt 注入器（AMY 优化后调用）
  useEffect(() => {
    registerPromptInjector((optimized: string) => {
      setPrompt(optimized);
    });
  }, [registerPromptInjector]);

  // 监听生图结果
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onImageResult) return;

    const cleanup = api.onImageResult((payload: any) => {
      // 只处理当前请求
      if (payload.requestId && payload.requestId !== currentRequestId.current) return;

      if (payload.status === 'generating') {
        setStatusMsg('正在生成，请稍候...');
        return;
      }

      setIsGenerating(false);
      currentRequestId.current = null;

      if (payload.error) {
        setStatusMsg(`❌ 生成失败：${payload.error}`);
        return;
      }

      if (payload.imageUrl) {
        const newResult: ImageResult = {
          url: payload.imageUrl,
          prompt: payload.prompt || prompt,
          timestamp: Date.now(),
        };
        setResults((prev) => [newResult, ...prev].slice(0, 8));
        setSelectedResult(newResult);
        setStatusMsg('✅ 生成成功');
        // 插入聊天流
        onInsertImageToChat(payload.imageUrl, payload.prompt || prompt);
      }
    });

    cleanupRef.current = cleanup;
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [prompt, onInsertImageToChat]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setStatusMsg('请输入提示词');
      return;
    }
    if (isGenerating) return;

    const requestId = `img_${Date.now()}`;
    currentRequestId.current = requestId;
    setIsGenerating(true);
    setStatusMsg('发送请求中...');

    const api = (window as any).electronAPI;
    if (!api?.imageGenerate) {
      setStatusMsg('❌ electronAPI.imageGenerate 未找到，请检查 preload');
      setIsGenerating(false);
      return;
    }

    const result = await api.imageGenerate({
      requestId,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      referenceImageUrl: mode === 'img2img' ? referenceImageUrl.trim() : '',
    });

    if (!result?.success) {
      setIsGenerating(false);
      currentRequestId.current = null;
      setStatusMsg(`❌ ${result?.error || '发送失败'}`);
    }
  }, [prompt, negativePrompt, referenceImageUrl, mode, isGenerating]);

  const handleAMYOptimize = useCallback(() => {
    if (!prompt.trim()) {
      setStatusMsg('请先输入初始提示词，再让 AMY 优化');
      return;
    }
    onSendToChat(
      `请帮我优化以下生图提示词，让画面更具体、更有美感。直接输出优化后的英文 prompt，不要解释，不要加引号：\n\n${prompt}`
    );
    setStatusMsg('已发送给 AMY，等待优化结果...');
  }, [prompt, onSendToChat]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-base)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
    }}>
      {/* 顶部标题栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 'var(--text-base)' }}>
          🎨 生图工作台
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['text2img', 'img2img'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '4px 12px',
                fontSize: 'var(--text-sm)',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                background: mode === m ? 'var(--accent-primary)' : 'var(--bg-surface)',
                color: mode === m ? 'var(--bg-base)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              {m === 'text2img' ? '文生图' : '图生图'}
            </button>
          ))}
        </div>
      </div>

      {/* 输入区 */}
      <div style={{ padding: '12px 16px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        {/* 提示词 */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
            提示词 Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想生成的画面，支持中英文..."
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              padding: '8px 10px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <button
            onClick={handleAMYOptimize}
            style={{
              marginTop: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--accent-primary)',
              background: 'none',
              border: '1px solid var(--accent-primary)',
              borderRadius: 5,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            ✨ 让 AMY 优化提示词
          </button>
        </div>

        {/* 负向提示词 */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
            负向提示词（可选）
          </label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="不希望出现的元素，如：blurry, ugly, watermark..."
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              padding: '8px 10px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* 图生图参考图 URL */}
        {mode === 'img2img' && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
              参考图片 URL（图生图）
            </label>
            <input
              type="text"
              value={referenceImageUrl}
              onChange={(e) => setReferenceImageUrl(e.target.value)}
              placeholder="https://... 或粘贴图片直链"
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                padding: '8px 10px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* 状态提示 */}
        {statusMsg && (
          <div style={{
            fontSize: 'var(--text-xs)',
            color: statusMsg.startsWith('❌') ? 'var(--status-error)' : 'var(--text-tertiary)',
            marginBottom: 8,
          }}>
            {statusMsg}
          </div>
        )}

        {/* 生成按钮 */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          style={{
            width: '100%',
            padding: '10px 0',
            background: isGenerating ? 'var(--bg-surface)' : 'var(--accent-primary)',
            color: isGenerating ? 'var(--text-tertiary)' : 'var(--bg-base)',
            border: 'none',
            borderRadius: 8,
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isGenerating ? '⏳ 生成中...' : '🚀 生 成'}
        </button>
      </div>

      {/* 结果预览区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {results.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
            gap: 8,
            opacity: 0.5,
          }}>
            <span style={{ fontSize: 32 }}>🖼️</span>
            <span>生成的图片将在这里显示</span>
          </div>
        ) : (
          <>
            {/* 当前选中大图 */}
            {selectedResult && (
              <div style={{ marginBottom: 12 }}>
                <img
                  src={selectedResult.url}
                  alt={selectedResult.prompt}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    display: 'block',
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open(selectedResult.url, '_blank')}
                  title="点击在浏览器中查看原图"
                />
                <div style={{
                  marginTop: 6,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                  lineHeight: 1.4,
                  wordBreak: 'break-all',
                }}>
                  {selectedResult.prompt.slice(0, 80)}{selectedResult.prompt.length > 80 ? '...' : ''}
                </div>
              </div>
            )}

            {/* 历史缩略图网格 */}
            {results.length > 1 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}>
                {results.map((r) => (
                  <img
                    key={r.timestamp}
                    src={r.url}
                    alt={r.prompt}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: 5,
                      border: selectedResult?.timestamp === r.timestamp
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedResult(r)}
                    title={r.prompt}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImageStudio;
```

---

## Step 6：集成到 ChatTab.v2.tsx

**修改文件**：`src/ui/chat/ChatTab.v2.tsx`

### 6-A：在文件顶部 import 区域追加

```tsx
import ImageStudio from '../image/ImageStudio';
```

### 6-B：在组件内 state 区域（useState 集中的地方）追加

```tsx
const [imageStudioOpen, setImageStudioOpen] = useState(false);
const imagePromptInjectorRef = useRef<((p: string) => void) | null>(null);
```

### 6-C：添加 AMY prompt 注入逻辑

找到 `useWebSocket` 的回调处理区域，或者 `onChatDone` / 消息入库完成后的逻辑。  
在 assistant 消息最终写入 `messages` state 之后（finalize 阶段），追加以下检测：

```tsx
// AMY 优化 prompt 注入：如果上一条 user 消息包含「生图提示词」关键字，把 AMY 回复注入 ImageStudio
setMessages((prev) => {
  const lastUser = [...prev].reverse().find((m) => m.role === 'user');
  if (
    lastUser?.content?.includes('生图提示词') &&
    imagePromptInjectorRef.current &&
    finalAssistantText  // 此处替换为实际的最终 assistant 文本变量名
  ) {
    // 延迟一帧注入，确保 state 更新完成
    setTimeout(() => {
      imagePromptInjectorRef.current?.(finalAssistantText.trim());
    }, 100);
  }
  return prev; // 不改 messages，只是借 setMessages 的时机读 prev
});
```

> **注意**：`finalAssistantText` 替换为你的实际变量名（在 `useMessages.ts` 或 `onChatDone` 回调里的最终文本）。如果找不到合适的注入点，可以先跳过此小节——AMY 优化功能仍可通过聊天区手动复制粘贴 prompt 使用，不影响核心生图功能。

### 6-D：添加图片插入聊天流的函数

在组件内（其他 callback 函数附近）追加：

```tsx
const insertImageToChat = useCallback((imageUrl: string, prompt: string) => {
  const imgMessage = {
    id: `img_${Date.now()}`,
    role: 'assistant' as const,
    content: `✅ 生图完成\n\n![生成图片](${imageUrl})\n\n> ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}\n\n[🔗 查看原图](${imageUrl})`,
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, imgMessage]);
}, [setMessages]);
```

### 6-E：在 JSX 底部添加 ImageStudio 面板

找到 `canvas-drawer` 的 JSX（如果有），在其下方（或在 `chat-tab` 根 div 的末尾，截图 flash overlay 之前）添加：

```tsx
{/* ── ImageStudio 抽屉 ── */}
<div
  className={`canvas-drawer${imageStudioOpen ? ' canvas-drawer--open' : ''}`}
  style={{ zIndex: 51 }}
>
  <div className="canvas-drawer-shadow" aria-hidden />
  <ImageStudio
    onSendToChat={(text) => {
      // AMY 优化请求：走正常聊天链路
      quickSend(text);
    }}
    registerPromptInjector={(fn) => {
      imagePromptInjectorRef.current = fn;
    }}
    onInsertImageToChat={insertImageToChat}
  />
</div>
```

### 6-F：在工具栏添加触发按钮

找到 `ChatInputArea` 组件或输入框区域的 JSX，在发送按钮附近（或 chat-section 顶部工具栏）添加：

```tsx
<button
  onClick={() => setImageStudioOpen((v) => !v)}
  title="生图工作台"
  style={{
    background: imageStudioOpen ? 'var(--accent-primary)' : 'none',
    color: imageStudioOpen ? 'var(--bg-base)' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 16,
    cursor: 'pointer',
    lineHeight: 1,
  }}
>
  🎨
</button>
```

运行 `npx tsc --noEmit`，确认无报错。

---

## Step 7：验证清单

完成所有步骤后，按以下顺序测试：

```
□ 1. 设置面板 → ① 连接配置 → 「3. 生图配置」section 可见
□ 2. 填入 IMAGE_API_KEY（或留空），点「保存并重新连接」
□ 3. 重启 Gateway（右侧面板 ▶ 启动，或重启应用）
□ 4. 点击聊天输入框附近的 🎨 按钮，右侧 ImageStudio 抽屉滑入
□ 5. 输入提示词，点「🚀 生 成」
□ 6. 等待 10-60 秒，图片出现在预览区
□ 7. 聊天流中出现 AMY 的图片消息（含 Markdown 图片）
□ 8. 输入提示词后点「✨ 让 AMY 优化提示词」，聊天区 AMY 回复，面板 prompt 更新
□ 9. 文生图 / 图生图 模式切换正常
```

---

## 常见问题排查

| 现象 | 检查点 |
|------|--------|
| 点生成没反应 | preload.ts 是否暴露了 `imageGenerate`；electron 重新 build 了吗 |
| gateway 日志没有 image.generate | index.js 的路由分支是否在 chat.send 之前 |
| 报 "API Key 未配置" | IMAGE_API_KEY 留空时，检查 MINIMAX_API_KEY 或 DASHSCOPE_API_KEY 是否有值 |
| MiniMax 报 400 | aspect_ratio 格式检查；model 名称是否是 `image-01` |
| 图片不显示在聊天流 | insertImageToChat 是否被调用；检查 markdown 渲染是否支持 img 标签 |
| TypeScript 报错 | 检查 preload 的类型声明；electronAPI 的 window 类型扩展 |

---

## 执行顺序

```
Step 1 → Step 2 → Step 3（3-A → 3-B → 3-C）→ Step 4 → Step 5 → Step 6 → Step 7 验证
```

每完成一个 Step：`npx tsc --noEmit` → 手动 smoke test → git commit（标注 step 号）。

---

*文档版本：2026-04-11 | 作者：Claude（为 OCT 项目生成）*
