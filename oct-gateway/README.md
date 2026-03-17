# OCT Gateway

OCT 独立 AI Gateway，替换 OpenClaw Gateway。

## 启动

```bash
cd oct-gateway
npm install
node index.js
```

## 环境变量

在项目根目录的 `.env` 中配置：

```
DASHSCOPE_API_KEY=你的百炼API Key
DEEPSEEK_API_KEY=你的DeepSeek Key（可选，百炼失败时备用）
OCT_MODEL=qwen-plus
OCT_GATEWAY_PORT=18789
```

## 图片分析（云端 + 本地降级）

- **首选**：阿里云百炼 qwen-vl-max（精度高，能识别红框/箭头/标注）
- **备选**：本地 BLIP（`@xenova/transformers`），云端失败时自动切换，无感
- **都失败**：返回「图片分析失败，请少爷描述图片内容」

**首次使用本地模型**：首次触发本地分析时会自动下载 BLIP 模型（约 ~100MB），控制台会提示「首次使用本地图片分析，正在下载模型（~100MB）…」，请保持网络畅通。

配置（可选，在 `config.json` 或环境对应配置中）：

```json
{
  "image_analysis": {
    "enabled": true,
    "provider": "aliyun_vl",
    "timeout_seconds": 30,
    "vision_model": "qwen-vl-max",
    "local": {
      "enabled": true,
      "model_cache_path": "./models/blip",
      "timeout_seconds": 30
    }
  }
}
```

- `provider`: `aliyun_vl` 仅云端，`local_blip` 仅本地，`auto` 云端优先+本地降级
- 关闭本地降级：`local.enabled: false`

### 测试方法

1. **云端 + 本地都可用**：少爷发一张截图 → AMY 应收到带「[图片分析] …」的上下文并正常回复（优先为云端描述）。
2. **仅测本地降级**：在 config 中临时去掉 `DASHSCOPE_API_KEY` 或设错 Key → 再发图 → 应无感切换到本地 BLIP，AMY 仍能拿到基础描述。
3. **都失败**：关闭 `image_analysis.enabled` 或断网且本地未装模型 → 发图后应得到「图片分析失败，请少爷描述图片内容」。
4. **首次本地**：确保未下载过 BLIP 时，第一次发图且云端失败 → 控制台出现「首次使用本地图片分析，正在下载模型（~100MB）…」，下载完成后返回本地分析结果。

## 与 Electron 集成

main.ts 通过 `spawn('node', ['oct-gateway/index.js'])` 启动。
