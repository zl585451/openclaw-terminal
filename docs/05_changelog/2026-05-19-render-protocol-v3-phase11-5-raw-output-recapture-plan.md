# Render Protocol v3 Phase 11.5：Raw Output Recapture Plan

日期：2026-05-19

## 变更摘要

- Phase 11 发现 8 条 run 全部为 `not_found`，不存在本地 raw model output。
- Phase 12 被阻塞：无法在缺少真实 raw output 的情况下复制原始响应到 corpus 文件。
- 新增重新采集流程文档 `docs/04_dev_guides/2026-05-19-render-protocol-v3-phase11-5-raw-output-recapture-plan.md`，定义：
  - 为什么 Phase 12 暂不能执行。
  - 如何切换 Provider（Google Gemini / DeepSeek）。
  - 如何在新鲜会话中重新发送 4 条 stability_test_prompts。
  - 三种 raw output 采集方法的优先级顺序（WebSocket 帧 > DevTools Network > Gateway 日志 > 自动化 trace 脚本）。
  - 禁止从截图转录或伪造 raw output。
  - raw output 隐私/密钥检查流程。
  - raw 文件命名结构和 metadata header 格式。
  - Phase 12 启动前置条件检查清单。

## 约束

- 未调用 Gemini、DeepSeek 或任何外部 API。
- 未修改 `docs/test-results/render-v3-real-model/raw/*.txt`。
- 未修改 `corpus.json`。
- 未提交、未推送、未合并。

## 验证

- `git diff --check`
- `git status --short --branch`
