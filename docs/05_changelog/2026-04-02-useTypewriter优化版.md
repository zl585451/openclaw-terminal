# 2026-04-02 useTypewriter 优化版

## 变更

- `src/hooks/useTypewriter.ts`：替换为优化版流式打字机逻辑。

## 行为

- 每帧最多输出字符数 4 → 12。
- 追赶：积压 20 字符起加速（原 60），曲线更陡（80 / 200 档位）。
- 流结束后收尾预算 +500（原 +300）。
- 每 2 帧合并一次 `setDisplayedText`，减少约一半渲染。
- 音效改为内联 Web Audio（每 3 字符一次），与优化版一致。

## 兼容

- `UseTypewriterOptions` / `UseTypewriterReturn` 与调用方一致；`feed` 仍经 `extractAssistantCotAndMain` + `parseOptionBox` 处理可见正文（上传稿中的 `parseMarkdown` 已改为项目内 `optionBoxParser` / `cotExtract`）。
