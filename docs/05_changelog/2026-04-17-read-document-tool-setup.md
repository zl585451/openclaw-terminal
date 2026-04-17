# feat: 新增 read_document 文档解析工具

> Date: 2026-04-17  
> Type: Feature  
> Scope: `oct-gateway/tools/read_document.js`, `oct-gateway/tools/read_file.js`

## 变更

- 新增 `read_document` 工具，支持读取二进制文档：`.docx`、`.xlsx`、`.xls`、`.csv`、`.pdf`。
- 增加格式化解析能力：
  - Word 走 `mammoth`，优先提取纯文本，必要时降级 Markdown。
  - Excel/CSV 走 `xlsx`，输出 Markdown 表格并限制最大 200 行展示。
  - PDF 走 `pdf-parse`，提取纯文本并提示扫描件场景。
- 增加返回内容保护：文档内容统一上限 30000 字符，超长时截断并附警告。
- 更新 `read_file` 描述，显式引导二进制文档改用 `read_document`，降低工具误选概率。

## 部署动作

- 已安装依赖：`mammoth`、`xlsx`、`pdf-parse`（位于 `oct-gateway`）。
- 已将工具文件部署到：`oct-gateway/tools/read_document.js`。

## 影响

- 网关重启后可自动加载新工具，无需改 ToolLoader。
- AI 在读取二进制文档时可避免 `read_file` 乱码路径。
