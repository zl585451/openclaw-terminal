# 2026-04-11 main 同步与 0.2.1 Windows 测试包

## 本次目标

- 将 `main` 正式追平 `feature/minimax-music-studio`
- 在主线上生成 `0.2.1` 的 Windows 测试安装包
- 先完成 Windows 端安装验证，再决定是否继续打包其他平台

## 关键结果

- `main` 已合并最新整合分支，包含拆分后的 `oct-gateway`、Canvas artifact 工作流、Mermaid/ECharts/React Flow 渲染链路、MiniMax Music Studio、voice/TTS、memory governor 与 review queue 等能力
- 应用版本从 `0.2.0` 提升为 `0.2.1`
- 计划优先产出 Windows 测试包，供本地安装回归

## 涉及文件

- `package.json`
- `package-lock.json`
- `docs/05_changelog/CHANGELOG.md`

## 备注

- 本次版本提升主要用于主线同步后的验证发包，功能主体来自此前已完成的 `feature/minimax-music-studio`
- 其他平台安装包等待 Windows 安装测试通过后再继续生成
