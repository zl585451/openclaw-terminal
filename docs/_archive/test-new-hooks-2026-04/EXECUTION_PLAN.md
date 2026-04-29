# 新 Hook 补测试执行计划

> 归档类型：Cursor 执行包  
> 创建日期：2026-04-29  
> 目标：为四轮重构新建的 hook 补充单元测试，建立安全网  
> 执行者：Cursor  
> 验收者：Claude  
> 打标方式：每个 Task 验收通过后 → git commit 一次，message 带 ✅ 标记  

---

## 背景

两轮重构新建了以下 hook，目前 0 测试覆盖：
- `src/hooks/useOnboarding.ts`
- `src/hooks/useCapabilityActions.ts`
- `src/hooks/useImageStudio.ts`
- `src/hooks/useTtsPlayback.ts`

项目使用 **Vitest**，但无 `@testing-library/react`（现有测试全是纯 TS 类）。  
计划围绕这个约束设计：Task 1 先装库，后续 Task 用 `renderHook` 写测试。  
`useTtsPlayback` 依赖 Electron IPC 和 `speechSynthesis`，mock 复杂度高，**本计划不覆盖，留后续单独处理**。

---

## 开始前（第一步，必须先做）

**新建 git 分支：**

```bash
git checkout -b test/new-hooks-coverage
```

确认分支创建成功后再开始 Task 1。

---

## Task 1 — 安装 @testing-library/react

### 目标

让项目具备 React Hook 测试能力（`renderHook`、`act`）。

### 执行内容

```bash
npm install --save-dev @testing-library/react @testing-library/user-event
```

安装后检查 `package.json` devDependencies 中是否出现这两个包。

查看 `vitest.config.ts`（或 `vite.config.ts` 中的 `test` 配置），确认 `environment` 设置：
- 如果没有设置或是 `node`，改为 `jsdom`
- 如果已经是 `jsdom`，不需要改

```ts
// vitest.config.ts 或 vite.config.ts 中 test 块
test: {
  environment: 'jsdom',
}
```

### 验证

```bash
npx vitest run
```

原有 109 个用例必须全部通过（0 新增失败）。

### ⛔ STOP — Task 1

输出简报：

```
【Task 1 简报】

安装了：@testing-library/react vX.X.X, @testing-library/user-event vX.X.X
vitest environment 配置：[jsdom / 已是 jsdom / 无需改动]
npm test 结果：✅ 109/109 通过，0 失败

当前分支：test/new-hooks-coverage
等待 Claude 验收。验收通过后执行：
git add package.json package-lock.json vitest.config.ts（或相关文件）
git commit -m "test: ✅ Task 1 — 安装 @testing-library/react，配置 jsdom 环境"
```

---

## Task 2 — useOnboarding 测试

> ⚠️ Task 1 验收通过并 commit 后才开始

### 目标

测试 `useOnboarding` 的三个功能：首次加载为 false、dismiss 后为 true、dev 重置回 false。

### 执行内容

新建 `src/hooks/__tests__/useOnboarding.test.ts`：

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboarding } from '../useOnboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始状态：onboardingDismissed 为 false', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.onboardingDismissed).toBe(false);
  });

  it('dismissOnboarding 后 onboardingDismissed 变为 true', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.dismissOnboarding();
    });
    expect(result.current.onboardingDismissed).toBe(true);
  });

  it('dismiss 后 resetOnboardingForDev 重置回 false', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.dismissOnboarding();
    });
    act(() => {
      result.current.resetOnboardingForDev();
    });
    expect(result.current.onboardingDismissed).toBe(false);
  });

  it('localStorage 已有 dismissed 标记时初始为 true', () => {
    localStorage.setItem('oct_onboarding_dismissed', 'true');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.onboardingDismissed).toBe(true);
  });
});
```

> 注意：如果 useOnboarding 中的 localStorage key 不是 `oct_onboarding_dismissed`，
> 请读源码确认实际 key 再调整测试。

### 验证

```bash
npx vitest run
```

全部通过（原 109 + 新 4 用例 = 113）。

### ⛔ STOP — Task 2

输出简报：

```
【Task 2 简报】

新建文件：src/hooks/__tests__/useOnboarding.test.ts
localStorage key 实际值：[填入实际值]
用例数：4 个（全部通过）
npm test 结果：✅ 113/113

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useOnboarding.test.ts
git commit -m "test: ✅ Task 2 — useOnboarding 测试（4 用例）"
```

---

## Task 3 — useCapabilityActions 测试

> ⚠️ Task 2 验收通过并 commit 后才开始

### 目标

测试 `useCapabilityActions` 的核心 handler 行为，用 vi.fn() 替代真实依赖。

### 执行内容

新建 `src/hooks/__tests__/useCapabilityActions.test.ts`：

测试覆盖以下场景：

1. **handleSkipOnboarding** — 调用后 `dismissOnboarding` 被执行一次
2. **handleCapabilityBarSetup** — 调用后 `setCapBarSetupTarget` 被执行，参数正确
3. **handleCapabilityBarClick — send_prompt 类型** — 调用后 `setInjectInputText` 收到 prompt 文本
4. **handleCapabilityBarClick — image_studio 且 available** — 调用后 `openImageStudio` 被执行
5. **handleCapabilityBarClick — image_studio 且 unavailable** — 调用后 `setMessages` 收到引导消息（消息内容含「生图 Key」）
6. **handleWelcomeAction — send_prompt 类型** — 调用后 `dismissOnboarding` 和 `sendMessage` 各被执行一次
7. **insertImageToChat** — 调用后 `setMessages` 被调用，新消息 content 含图片 URL

测试结构示例（请参考，按实际 hook 签名调整）：

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCapabilityActions } from '../useCapabilityActions';

function makeOptions(overrides = {}) {
  return {
    setMessages: vi.fn(),
    getNextMessageId: vi.fn(() => 1),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    quickSend: vi.fn(),
    openImageStudio: vi.fn(),
    markPendingPromptOptimization: vi.fn(),
    dismissOnboarding: vi.fn(),
    onSwitchTab: vi.fn(),
    setInjectInputText: vi.fn(),
    setCapBarSetupTarget: vi.fn(),
    ...overrides,
  };
}

describe('useCapabilityActions', () => {
  it('handleSkipOnboarding 调用 dismissOnboarding', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => { result.current.handleSkipOnboarding(); });
    expect(opts.dismissOnboarding).toHaveBeenCalledTimes(1);
  });

  // ... 其余 6 个用例，按上面场景列表实现
});
```

目标：**至少 7 个用例全部通过**。

### 验证

```bash
npx vitest run
```

### ⛔ STOP — Task 3

输出简报：

```
【Task 3 简报】

新建文件：src/hooks/__tests__/useCapabilityActions.test.ts
用例数：X 个（全部通过）
npm test 结果：✅ XXX/XXX

有无 hook 签名与计划不符的地方：[如有请说明]

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useCapabilityActions.test.ts
git commit -m "test: ✅ Task 3 — useCapabilityActions 测试（X 用例）"
```

---

## Task 4 — useImageStudio 测试

> ⚠️ Task 3 验收通过并 commit 后才开始

### 目标

测试 `useImageStudio` 的侧栏开关与 prompt 注入逻辑。

### 执行内容

新建 `src/hooks/__tests__/useImageStudio.test.ts`：

测试覆盖以下场景：

1. **初始状态** — `imageStudioOpen` 为 false，`imageStudioInitialPrompt` 为空
2. **openImageStudio** — 调用后 `imageStudioOpen` 为 true
3. **openImageStudio(prefill)** — 调用后 `imageStudioInitialPrompt` 等于传入的 prefill
4. **closeImageStudio** — open 后调用 close，`imageStudioOpen` 回到 false
5. **toggleImageStudio** — 关闭状态下调用变 true，再次调用变 false
6. **markPendingPromptOptimization + 最后一条 assistant 消息成文** — prompt 注入器被调用（此项如果依赖复杂 useEffect 可以跳过，改为验证 `registerPromptInjector` 可以接受函数参数不报错）

> 注意：useImageStudio 接收 messages 参数。测试时传入空数组 `[]` 或包含 assistant 消息的数组。

目标：**至少 5 个用例通过**（第 6 项视实现复杂度可选）。

### 验证

```bash
npx vitest run
```

### ⛔ STOP — Task 4（最终）

输出简报：

```
【Task 4 简报 — 本计划全部完成】

新建文件：src/hooks/__tests__/useImageStudio.test.ts
用例数：X 个（全部通过）
npm test 最终结果：✅ XXX/XXX

本次新增文件汇总：
- src/hooks/__tests__/useOnboarding.test.ts
- src/hooks/__tests__/useCapabilityActions.test.ts
- src/hooks/__tests__/useImageStudio.test.ts

跳过（留后续）：useTtsPlayback（依赖 Electron IPC / speechSynthesis）

等待 Claude 最终验收。验收通过后执行：
git add src/hooks/__tests__/useImageStudio.test.ts
git commit -m "test: ✅ Task 4 — useImageStudio 测试（X 用例）"

最终 commit（汇总）：
git commit --allow-empty -m "test: ✅ 全部完成 — 新 hook 测试覆盖（useOnboarding / useCapabilityActions / useImageStudio）"
```

完成后在 `docs/05_changelog/` 补一条：
`docs/05_changelog/2026-04-29-new-hook-tests.md`

---

## 打标规则（验收方 Claude 执行）

| 情况 | 动作 |
|------|------|
| 验收通过 | 回复「✅ Task X 验收通过」+ 给出下一步 Cursor 提示词 |
| 验收不通过 | 回复「❌ Task X 不通过」+ 具体修改建议，**不给 commit 指令** |
| 修改后重新验收通过 | 回复「✅ Task X 修改后通过」+ 给出 commit 指令 + 下一步提示词 |

---

## 注意事项

- `useTtsPlayback` 不在本计划内，不要写它的测试
- 每个 Task 只做一件事，不要提前写下一个 Task 的内容
- 如果 `@testing-library/react` 的 renderHook 用法与预期不符，先停下来说明，不要自行换方案

---

*本文件是执行包，完成后保留在 docs/_archive/test-new-hooks-2026-04/。*
