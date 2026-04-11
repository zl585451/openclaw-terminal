# 2026-04-11 MCP 图片日志与聊天区 Diagram JSON 规范化

## 本次改动

- `oct-gateway/image_analyzer.js`
  - MCP 图片理解调用前记录命中的工具名、可用工具数量、临时文件扩展名
  - 当返回文本包含 `fetch failed`、`unauthorized access`、`field required` 等错误特征时，输出更明确的 `failureKind`
  - 日志提示区分：
    - MCP 进程未发现工具
    - MCP 已连接但远端请求失败
    - 鉴权失败
    - 参数不匹配

- `oct-gateway/cot_sanitize.js`
  - 若模型最终回复整体是一个可解析的 diagram JSON（如 `flowchart` / `pie` / `hierarchy`），自动包装为 `json` fenced code block
  - 这样聊天区现有 Markdown/diagram 渲染链可以继续识别并转 Mermaid，而不会把 JSON 当普通段落直接显示

## 解决的问题

- 用户上传图片时，日志不再只剩下笼统的 “MCP 代理连不上 / fetch failed”，而能更接近真实原因。
- 用户要求“不要 Canvas，在聊天区给一个简单流程图”时，如果模型直接吐整段 diagram JSON，前端不再原样显示裸 JSON。
