# 2026-05-16 内容创作工作台：质检短语误杀与悬疑拟声词修正

- 收窄 `dialogue_duplicated_in_narration` 硬拦截：只检查带 `quoteId` 的对白段是否仍残留在旁白里，避免同章状态短语或 OS 短语复现时被误判为 P0。
- 扩展 SFX 拟声词白名单，允许 `沙沙`、`咯咯` 及带省略号的重复形式，适配悬疑/广播剧常见环境声。
- 增加 QC 回归测试，覆盖第 2 章出现的“证据不足”短语误杀和 `沙沙……沙沙……` / `咯咯` 音效。

验证命令：

```bash
npx vitest run oct-gateway/test/basicQCChecker.test.js
```
