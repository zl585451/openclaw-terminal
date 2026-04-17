# 设置：硅基流动聊天模型改为自由填写

## 背景

硅基流动模型广场更新频繁，固定下拉项无法覆盖用户实际可用的模型 ID。

## 行为

- 在 **设置 → ① 连接配置** 中，当 **AI 服务商** 为 **硅基流动 SiliconFlow** 时，**当前模型** 由下拉框改为 **文本输入框**，内容直接对应配置项 `OCT_MODEL`（与 OpenAI 兼容请求体中的 `model` 字段一致）。
- 保留服务商预设中的常用模型及 `SILICONFLOW_MODEL_EXAMPLES` 为 **快捷芯片**，点击即可填入对应 ID。
- 网关与保存逻辑未改：`buildGatewayPayload` 仍使用 `OCT_MODEL`；若输入框留空，保存时仍按原有规则回退到服务商 `defaultModel`。

## 涉及文件

- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `docs/02_architecture/provider-system.md`
- `docs/05_changelog/CHANGELOG.md`
