# 2026-04-27 Script Adapter Export And Chunking

## 这次做了什么

Week 6 Track 2 已落地：

1. `DeliveryPreview` 新增 `导出 Markdown` 按钮
2. 导出链路走 Electron 主进程 `dialog.showSaveDialog` + `fs.promises.writeFile`
3. `textRewriterAgent` 内部新增长章节切片，4000-12000 字自动分段串行改编
4. 切片失败时生成占位 segment，后续分片继续，不中断整个 pipeline

## 改动文件

1. `electron/main.ts`
2. `electron/preload.ts`
3. `src/types/electronAPI.ts`
4. `src/modules/script-adapter/services/exportClient.ts`
5. `src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx`
6. `oct-gateway/script_adapter/agents/textRewriterAgent.js`
7. `oct-gateway/test/textRewriterAgent.test.js`
8. `oct-gateway/test/textRewriterChunking.test.js`

## 复制粘贴就能用的开关说明

这轮功能默认就是开着的，不需要 Zilong 改任何配置文件，也不需要跑任何命令。

1. 跑完一轮 5 Agent 后，在 `交付预览` 卡片直接点 `导出 Markdown`。
2. 弹出系统保存框后，选一个位置保存。
3. 双击 `.md` 文件，用记事本或任意 Markdown 编辑器打开即可。

长章节切片也没有单独开关：

1. 4000 字以内，仍走原来的单次改编。
2. 4001-12000 字，`textRewriterAgent` 自动切片，外部调用完全不用改。
3. 超过 12000 字，仍会报 `TEXT_REWRITER_TOO_LONG`。

## 真实 .md 证明产物

仓库里已放一份真实 Markdown 样例：

`docs/05_changelog/2026-04-27-script-adapter-delivery-proof.md`

这份文件按本轮导出格式组织，包含改编台本、角色音表、演播设计、质检报告和交付清单。

## 切片日志证明

新增测试 `oct-gateway/test/textRewriterChunking.test.js` 已覆盖：

1. 200 字文本保持单 pass
2. 8000 字文本进入 chunked 流程并全局重编 `segmentId`
3. 中间某片失败时生成 fallback segment，后续继续

本地测试输出：

```text
PASS short text stays single-pass
PASS 8000-char text uses chunked mode and renumbers segments globally
PASS chunk failure falls back to placeholder and later chunks continue
```

## 已知限制

1. 导出目前只支持 `.md` / `.txt`，没有 `.docx`。
2. 12000 字以上章节仍会被拒绝，留给 Week 7 再分级处理。
3. 切片版对白跨片节奏仍可能略生硬，后续可以继续调 prompt。

## 自测

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.electron.json --noEmit`
3. `node oct-gateway/test/textRewriterAgent.test.js`
4. `node oct-gateway/test/textRewriterChunking.test.js`

## 录屏说明

当前这台执行环境没有可用桌面会话，无法在这里直接产出真正的 Electron 录屏文件；代码、导出样例和切片测试证明都已落仓。若要补最终演示视频，建议在 Zilong 本机按本 changelog 的 3 步点击路径录一遍，过程不需要终端和配置修改。
