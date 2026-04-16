# fix: 硅基流动 API Key 与设置面板字段对齐

## 现象

网关日志出现 `HTTP 401: Api key is invalid`，模型为硅基上的 `Pro/moonshotai/Kimi-K2.5` 等；用户已在设置里填写硅基 Key，仍报错。

## 原因

- 设置「① 连接配置」在选中硅基流动时，将 **API Key 写入 `config.json` 的 `DASHSCOPE_API_KEY`**（与其它走 DashScope 字段的服务商共用存储键）。
- `oct-gateway/config.js` 的 `getProviderConfig()` 按 `providers.js` 里 `keyEnvVars` **顺序**取第一个「合法」Key。
- 原先硅基为 `['SILICONFLOW_API_KEY', 'DASHSCOPE_API_KEY']`，若用户或旧版在配置里留有 **无效/过期的 `SILICONFLOW_API_KEY`**，会一直优先于界面新保存的 `DASHSCOPE_API_KEY`，从而固定 401。

## 修改

- `oct-gateway/providers.js`：硅基 `keyEnvVars` 改为 **`DASHSCOPE_API_KEY` 优先**，与设置面板一致；仍保留 `SILICONFLOW_API_KEY` 作为兼容（环境变量、手动配置）。

## 用户自检

1. Key 须为 **[硅基流动控制台](https://cloud.siliconflow.cn/)** 申请的 Key；`Pro/moonshotai/Kimi-K2.5` 走硅基端点，**不能**用 Moonshot 官方 Key。
2. 若曾手动编辑 `config.json`，可删除错误的 `SILICONFLOW_API_KEY` 行，或在设置里重新保存一次连接配置。
