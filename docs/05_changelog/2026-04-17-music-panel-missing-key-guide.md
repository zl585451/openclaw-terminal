# 2026-04-17 音乐面板缺 Key 指引补齐

## 问题
- 音乐面板在未配置 `MINIMAX_API_KEY` 时，用户点击 `Create` / `自动写词` 可能只看到后端失败提示，缺少明确下一步。

## 修复
- 在音乐面板前置拦截：
  - `Create` 前检查 `apiKeyConfigured`
  - `自动写词` 前检查 `apiKeyConfigured`
- 当 Key 缺失时，统一输出分步骤指引：
  - `SETTINGS -> 连接`
  - 填写 `MINIMAX_API_KEY`
  - 应用后返回 `音频` 面板重试

## 变更文件
- `src/components/SoundTab.tsx`
