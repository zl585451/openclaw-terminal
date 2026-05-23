# 2026-05-23 Google 生图配置与 Gateway 重启收敛

## 变更

- 设置页「生图配置」新增 `Google Cloud Vertex AI / Gemini 生图` 服务商选项。
- `get-api-keys` / `save-api-keys` 新增并回填 `IMAGE_GOOGLE_API_KEY`、`IMAGE_GOOGLE_BASE_URL`、`IMAGE_GOOGLE_MODEL`。
- Gateway `image.generate` 会把 `IMAGE_GOOGLE_*`、`GOOGLE_AI_*`、`GOOGLE_CLOUD_*` 配置传入 Google 原生服务层。
- 默认 Google 生图模型为 `gemini-3.1-flash-image-preview`（Nano Banana 2）。
- Google 生图模型改为下拉选择，内置 Nano Banana 2、Nano Banana Pro、Nano Banana、Imagen 4 Standard/Fast/Ultra，并保留自定义模型 ID。
- Gemini 图像模型请求改为官方当前 `models.generateContent` 路径，Imagen 模型继续使用 `models.generateImages`。
- Electron 保存设置时改为按配置值实际变化判断是否重启 Gateway，避免只切换设置展示模式或保存未变化配置时打断当前对话连接。

## 影响

- 使用 Google Cloud Vertex AI API Key 配置生图时，不需要把聊天 provider 切到 Google。
- 单纯切换旧配置/推荐配置展示模式不会触发 Gateway 重启；真正改变 provider、模型、Key、代理、OmniRoute 或生图配置时仍会重启以让 Gateway 读到新配置。
