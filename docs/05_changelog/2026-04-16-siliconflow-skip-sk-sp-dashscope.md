# fix: 硅基流动不再误用百炼 Coding Key（sk-sp-）

## 背景

`OCT_PROVIDER=siliconflow` 时若 `config.json` 里 `DASHSCOPE_API_KEY` 仍为百炼 Coding Plan（常见前缀 `sk-sp-`），网关会把它当作 Bearer 发给 `api.siliconflow.cn`，固定401，随后 DeepSeek fallback。

## 行为

- `getProviderConfig()` 对 **siliconflow**：优先 `SILICONFLOW_API_KEY`；否则仅当 `DASHSCOPE_API_KEY` **不以** `sk-sp-` 开头时才采用（避免百炼 Key 误用）。
- 若仅存在 `sk-sp-` 的 DASHSCOPE，解析到的 **apiKey 为空**，启动日志打警告，聊天会提示未配置 Key（不再用错 Key 去撞硅基）。
- 启动日志改为输出 **当前聊天解析结果**（`Active provider` / `API Key (resolved)` / `Base URL (resolved)`），`DASHSCOPE_API_KEY` 仅作 debug前缀。

## 文件

- `oct-gateway/config.js`
