# 生图：硅基流动适配与超时延长

**日期**：2026-04-13

## 问题

- 使用硅基流动 Key 生图失败：此前「OpenAI 兼容」分支对 `/v1/images/generations` 使用了 DALL·E 的 JSON 字段（`size`、`response_format`），与[硅基流动文档](https://docs.siliconflow.cn/cn/api-reference/images/images-generations)不一致；响应解析也未处理 `images[].url`。
- `Request timeout (60s)`：生图 HTTP 固定 60s，慢模型或排队易超时。
- `IMAGE_BASE_URL` 为空时一律默认 MiniMax，与 `IMAGE_PROVIDER=openai` 组合会指向错误主机。

## 改动

- `oct-gateway/image_gen.js`：新增 `siliconflowAdapter`；按 URL 或 `IMAGE_PROVIDER=siliconflow` 选择；默认超时改为 180s，支持 `OCT_IMAGE_HTTP_TIMEOUT_MS`；`resolveApiKey` 增加 `DEEPSEEK_API_KEY` 兜底。
- `oct-gateway/index.js`：按 `IMAGE_PROVIDER` 默认正确的 `IMAGE_BASE_URL` 与空模型时的默认模型名；`imageConfig` 传入 `DEEPSEEK_API_KEY`。
- `src/ui/settings/tabs/ConnectionTabView.tsx`：生图服务商增加「硅基流动」选项与说明。
- `docs/03_specs/WEBSOCKET_PROTOCOL.md`：补充硅基生图与超时说明。
