# 聊天输入框默认高度修复（2026-04-13）

## 现象

空内容时输入框视觉上接近两行高，占位符贴顶、下方留白偏大。

## 原因

`textarea` 在内容为空时，用 `scrollHeight` 同步内联 `height` 会在部分浏览器上得到偏大的值；`useEffect` 与 `onChange` 都会在空串时执行该逻辑，从而把框撑高。

## 修改

- `src/ui/chat/ChatInput.tsx`：当 `inputValue` 为空（或 `onChange` 得到空串）时移除内联 `height`，并恢复 `overflowY: hidden`，改由样式表中的 `min-height` 控制单行默认高度；有内容时仍按 `scrollHeight` 自动增高（上限不变）。
