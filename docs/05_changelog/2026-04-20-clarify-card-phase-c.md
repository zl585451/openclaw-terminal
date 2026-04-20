# 2026-04-20 · ClarifyCard Phase C (v1.1 + patch) — 协议统一 + 能力底栏 + 边界响应

## 新增

- `src/components/capabilityBar/CapabilityBar.tsx`：输入框上方能力胶囊底栏
- `src/components/capabilityBar/CapabilityBoundarySheet.tsx`：能做/不能做说明面板
- `src/components/capabilityBar/CapabilityBar.css`

## 修改（协议与系统提示）

- `resources/system_prompts/OCT_PROTOCOL.md`
  - 统一“自动检测单一格式”与“成对标签多段混排”口径
  - 2.0 总览表新增第 6 类：`[clarify_card]`（InlineInquiry）
  - 1.2 快速参考补充“多维度收集/越界确认”两条
  - 澄清询问器示例改为无 `inspirations`
- `docs/03_specs/RENDER_PROTOCOL.md`
  - 顶部增加模式区分说明
  - 新增 2.6 节 `[clarify_card]...[/clarify_card]`（InlineInquiry）
  - 前端实现映射表补充 clarify_card
- `resources/system_prompts/SOUL.md`
  - 新增越界请求响应模板（承认 → 猜意图 → 给替代路径）
- 镜像同步：
  - `docs/01_system_prompts/OCT_PROTOCOL.md`
  - `docs/01_system_prompts/SOUL.md`

## 修改（代码）

- `src/ui/chat/ChatTab.v2.tsx`
  - 接入 `<CapabilityBar />`
  - 新增独立 `capBarSetupTarget` + `<CapabilitySetupDrawer />`（与 WelcomeHero 解耦）
  - 能力胶囊点击后：
    - `send_prompt`：填入输入框（不自动发送）
    - `open_panel/open_tab`：复用现有打开工作台/切换 tab 逻辑
  - 询问器活跃时隐藏能力底栏（`!inquiry.hasActive`）
- `src/core/clarifyCard/types.ts`
  - 删除 `inspirations` 字段
- `src/core/clarifyCard/parser.ts`
  - 删除 `inspirations` 解析
- `src/components/inlineInquiry/InlineInquiry.tsx`
  - 删除 inspirations 交互区与点击填入逻辑
- `src/components/inlineInquiry/InlineInquiry.css`
  - 删除 inspirations 样式

## 说明

- 术语统一为“内联询问器 / InlineInquiry”，不再使用“浮层 Overlay”说法。
- `title` 维持可选；每页标题由 `field.label` 驱动。
- DEV 测试按钮保留用于持续调试，未在本阶段移除。
