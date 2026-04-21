# 2026-04-22：provider 工具函数单元测试

## 摘要

为 `src/utils/providerUtils.ts` 中的 `inferProviderFromBaseUrl` 与 `detectProviderFromKey` 新增 `src/utils/providerUtils.test.ts`，覆盖常见 baseUrl、Key 前缀与边界输入；未修改生产逻辑。

## 涉及文件

- `src/utils/providerUtils.test.ts`（新增）
