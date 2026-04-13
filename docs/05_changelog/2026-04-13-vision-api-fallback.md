# 图片理解重构：移除 BLIP，新增通用视觉 API

**日期：** 2026-04-13  
**类型：** 功能重构 + bug fix

---

## 背景

使用 MiniMax 等不支持 inline vision 的模型时，图片理解全链路失败：
- DashScope 云端：provider 不兼容，跳过
- MCP `understand_image`：每次精确超时 30 秒
- 本地 BLIP：HuggingFace 不可达，从未成功下载

同时，BLIP 本地模型从设计上就不可靠（依赖境外网络下载、推理质量差）。

---

## 变更内容

### 移除

- `oct-gateway/image_analyzer.js`：删除所有 BLIP 相关代码（`analyzeImageLocal`、`useLocal` 分支）
- `oct-gateway/image_analyzer_local.js`：不再被引用（文件保留但不 require）
- `electron/main.ts`：移除 `get-local-vision-status`、`save-local-vision-settings`、`download-local-vision-model` 的实体实现（改为空壳，兼容旧前端调用）
- `src/components/SettingsPanel.tsx`：移除 7 个 localVision state 变量及相关 useEffect、handler
- `src/ui/settings/tabs/ConnectionTabView.tsx`：移除 BLIP section UI 及所有 localVision props

### 新增

**后端**

- `oct-gateway/image_analyzer.js`：新增 `analyzeImageVisionApi()` 函数
  - 读取 `config.VISION_API_KEY / VISION_BASE_URL / VISION_MODEL`
  - 调用任意 OpenAI 兼容视觉接口
  - 与主 provider 完全解耦

- `oct-gateway/config.js`：新增三个配置字段 `VISION_API_KEY / VISION_BASE_URL / VISION_MODEL`

- `electron/main.ts`：`get-api-keys` / `save-api-keys` 新增读写上述三个字段

**前端**

- `src/hooks/settings/useApiKeys.ts`：`ApiKeysState` 和 `GatewayConfigPayload` 新增三个字段
- `src/ui/settings/tabs/ConnectionTabView.tsx`：新增「图片理解 API（视觉助手）」配置区域
  - 预设：硅基流动（推荐，有免费额度）、阿里云百炼、自定义
  - 字段：API Key / Base URL / 视觉模型

---

## 新降级链路

```
主模型支持视觉 → inline_vision（直传）
主模型不支持视觉：
  1. DashScope 云端（provider=bailian 时）
  2. 视觉 API（VISION_API_KEY）← 新增，推荐配置
  3. MCP understand_image（最后兜底）
  4. 降级提示（明确告知用户）
```

---

## 用户配置方式

设置 → ① 连接配置 → 「图片理解 API（视觉助手）」

推荐：硅基流动 + `Qwen/Qwen2.5-VL-7B-Instruct`（免费）或 `Qwen/Qwen2.5-VL-72B-Instruct`（付费，质量更高）
