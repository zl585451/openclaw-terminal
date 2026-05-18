# 2026-05-19 Render Protocol v2 Phase 1

## 变更

- 将 `docs/03_specs/RENDER_PROTOCOL.md` 升级到 `v2.0.0`，新增 Markdown 输出稳定协议。
- 将 `docs/01_system_prompts/OCT_PROTOCOL.md` 与模板升级到 `v2.5.0`，要求模型分离正文、命令块、表格和交互标签。
- 明确命令块语言标记：Windows 使用 `powershell`，Linux/macOS 使用 `bash`，JSON 使用 `json`，日志/示例输出使用 `text`。
- 明确禁止把说明文字、编号步骤、交互标签混进代码块。

## 验证

- 本阶段只修改协议和提示词文档，未改运行时代码。
- 后续 Phase 2 将新增 Gateway Markdown normalizer 与单元测试。
