# OCT 瘦身 Phase F-2：图片 analyzer fallback 按需加载

日期：2026-05-25

## 背景

Phase F-1 将 `image_analysis` 标记为可选能力包。此前 `oct-gateway/index.js` 启动时会直接 require `oct-gateway/image_analyzer.js`，即使用户只进行普通聊天，或使用支持 inline vision 的模型直接发送图片，也会初始化图片分析 fallback 依赖。

## 本次变更

- `oct-gateway/services/imageService.js`
  - 支持注入 `getImageAnalyzer()` 工厂。
  - inline vision 路径继续直接返回 multimodal content parts，不加载 analyzer。
  - 只有非视觉模型需要把图片转成文本上下文时，才调用工厂加载 `image_analyzer.js`。
  - analyzer 加载/执行失败时仍保持原有 text-only prompt 降级。
- `oct-gateway/index.js`
  - 删除启动期 eager `require('./image_analyzer')`。
  - 改为向 `ImageService` 注入 `getImageAnalyzer: () => require('./image_analyzer')`。
- `oct-gateway/test/imageService.test.js`
  - 覆盖 inline vision 不加载 analyzer。
  - 覆盖 fallback 按需加载。
  - 覆盖 analyzer 失败后保留文本 prompt。

## 非目标

- 不改变图片附件协议。
- 不改变 `image.generate` 生成图片链路。
- 不删除 `image_analyzer.js`，也不改变 DashScope / Vision API / MCP understand_image 的 fallback 顺序。

## 验证

- `node oct-gateway/test/imageService.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `npx tsc --noEmit`
- `npx vitest run`
