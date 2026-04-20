# Gateway Token 自动生成与无感认证

> Date: 2026-04-19  
> Type: security

## 变更内容

为普通用户默认启用 Gateway 认证 Token，无需手动填写：

- 首次启动若 `OPENCLAW_TOKEN` 为空，主进程自动生成高熵 token 并持久化到 `userData/config.json`。
- 主进程连接 Gateway（`connect` 请求）自动携带该 token。
- 启动 Gateway 子进程时强制注入 `OCT_GATEWAY_TOKEN` 环境变量，保证服务端校验链路与客户端一致。
- 配置页手动改 `OPENCLAW_TOKEN` 时，视为关键配置变更并触发 Gateway 重启，避免新旧 token 不一致。

## 修改文件

| 文件 | 变更 |
|---|---|
| `electron/main.ts` | 新增 token 生成/持久化逻辑，连接与子进程启动统一使用 token，token 变更触发重启 |

## 实质效果

- 小白用户零配置即可开启 token 认证，不再因“空 token”处于无保护状态。
- 认证链路从“可用但常未启用”变为“默认启用且一致”。
