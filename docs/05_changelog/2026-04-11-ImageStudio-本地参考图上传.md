# 2026-04-11 ImageStudio 本地参考图上传

## 本次改动

- Image Studio 的图生图模式新增本地参考图入口，支持：
  - 拖拽图片到参考图区
  - 点击“上传本地图片”选择文件
- 前端会将本地参考图转成 `data:image/...;base64,...`，并通过 `image-generate` IPC 发送到主进程。
- Gateway `image.generate` 新增 `referenceImageDataUrl` 参数，图生图时优先使用本地 data URL，再回退远程 `referenceImageUrl`。
- MiniMax 图生图请求的参考图字段统一改为 `subject_reference[].image_file`，与官方图生图接口示例保持一致。

## 影响

- 图生图不再只能依赖公网可访问的参考图 URL。
- 通用 Image Studio 面板继续保持“前端通用语义，网关按供应商适配”的方向。

## 备注

- 当前本地参考图链路优先为 MiniMax 图生图做适配；其他供应商若不支持该输入形式，可在后续 capability 层继续细分。
