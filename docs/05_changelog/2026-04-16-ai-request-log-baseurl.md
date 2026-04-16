# chore: 网关请求日志带出 baseUrl / providerId

便于排查「硅基 Key + 百炼 URL」等错配：每次 `streamChat` 在 `request start` 中增加 `providerId` 与 `baseUrl`（去尾斜杠），与截断后的 `url` 日志对照即可确认实际出站域名。

- 文件：`oct-gateway/ai.js`
