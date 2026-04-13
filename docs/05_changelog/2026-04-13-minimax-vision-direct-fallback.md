# 修复：MiniMax 图片理解全链路失败

**日期：** 2026-04-13  
**文件：** `oct-gateway/image_analyzer.js`  
**类型：** bug fix

---

## 问题

用户使用 MiniMax 系列模型（如 MiniMax-M2.7）发送图片时，图片理解始终失败，AI 收到降级提示而非图片内容。

**失败链路（逐步确认自日志）：**

1. MiniMax-M2.7 不支持 inline_vision → 路由到 `image_analyzer_fallback`
2. DashScope 云端路径被跳过（`currentProviderId=minimax`，不满足 `cloudCompatible` 条件）
3. MCP `mcp_minimax_understand_image` 精确 30 秒超时（`mcp/client.js` 硬编码 30s，MiniMax 官方 MCP server 响应极慢）
4. 本地 BLIP 模型无法下载（hf-mirror.com + huggingface.co 均 fetch failed）
5. 全链路失败 → 返回 `[图片分析] 图片分析失败，请用户描述图片内容。`

---

## 修复

在 `analyzeImage()` 的步骤 2 中，当 `currentProviderId === 'minimax'` 且 `options.apiKey` 可用时，**直接调用 MiniMax 视觉 API**：

- 模型：`MiniMax-VL-01`
- 端点：`{baseUrl}/chat/completions`（使用现有 MINIMAX_API_KEY）
- 绕过 MCP，不引入新的 API Key 依赖

新增 `analyzeImageMinimax()` 函数，结构与 `analyzeImageCloud()` 一致。

**新降级顺序（provider=minimax 时）：**

1. DashScope 云端（跳过，不兼容）  
2. ✅ **MiniMax 直连视觉 API（新增）**  
3. MCP `understand_image`（备用）  
4. 本地 BLIP（离线备用）  
5. 降级提示

---

## 为什么不修复 MCP 超时

MCP 超时（30s）是 `mcp/client.js` 协议层的硬编码，提高超时不解决根本问题（MiniMax MCP server 的网络/鉴权问题）。直连更可靠。
