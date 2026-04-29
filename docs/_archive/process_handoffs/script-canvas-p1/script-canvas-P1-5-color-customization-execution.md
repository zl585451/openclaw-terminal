# 剧本 Canvas P1-5（角色颜色自定义）执行方案（现有代码适配版）

## 前置条件
- P0 已完成：`artifactType === 'script'` 的 Workbench 渲染链路可用（上传、解析、按角色染色展示正常）。
- 当前实现基线：
  - 解析器：`src/utils/scriptParser.ts`
  - 渲染插件：`src/workbench/plugins/scriptPlugin.tsx`
- 本方案仅实现 **P1-5 角色颜色自定义**，不包含筛选/导出/AI 润色。

## 改动清单

### Step 1: `src/utils/scriptParser.ts` — 修改

**目的**：把角色默认色盘和颜色合并能力显式导出，供 `scriptPlugin` 在“解析颜色 + 用户自定义颜色”两层数据上合成 `effectiveColors`。

**具体改动**：

1. 在颜色常量区域，把现有 `CHARACTER_COLORS` 改为导出的 `DEFAULT_SCRIPT_COLORS`。
2. 新增导出函数 `mergeCharacterColors(baseColors, customColors)`。
3. 在 `assignColor(name)` 内把 `CHARACTER_COLORS` 引用改为 `DEFAULT_SCRIPT_COLORS`。

请按下方完整代码替换对应片段。

#### 1) 颜色常量（替换 `scriptParser.ts` 现有常量段）

```ts
/** 默认 15 色盘（P0 基线） */
export const DEFAULT_SCRIPT_COLORS: string[] = [
  '#7EC8E3', // 浅蓝
  '#F4A261', // 橙
  '#A8DADC', // 青绿
  '#E9C46A', // 金黄
  '#C77DFF', // 紫
  '#90BE6D', // 草绿
  '#F9844A', // 橙红
  '#43AA8B', // 墨绿
  '#F8961E', // 深橙
  '#4CC9F0', // 天蓝
  '#E76F51', // 砖红
  '#B5E48C', // 嫩绿
  '#FF99C8', // 粉
  '#9BF6FF', // 浅青
  '#CAFFBF', // 薄荷
];

/**
 * 合并用户自定义颜色到角色颜色映射
 * customColors 优先级高于 baseColors
 */
export function mergeCharacterColors(
  baseColors: Record<string, string>,
  customColors: Record<string, string>,
): Record<string, string> {
  return {
    ...baseColors,
    ...customColors,
  };
}
```

#### 2) `assignColor(name)` 函数内部引用替换

定位：`parseScript()` 内部的 `assignColor(name: string)`。

把这行：

```ts
const idx = characterSet.length % CHARACTER_COLORS.length;
characterColors[name] = CHARACTER_COLORS[idx];
```

替换为：

```ts
const idx = characterSet.length % DEFAULT_SCRIPT_COLORS.length;
characterColors[name] = DEFAULT_SCRIPT_COLORS[idx];
```

---

### Step 2: `src/workbench/plugins/scriptPlugin.tsx` — 修改

**目的**：在当前“内联样式 + 纯插件渲染”结构下，增加角色色标点击选色能力，并让正文台词实时使用合并后的 `effectiveColors`。

**具体改动**：

#### 2.1 修改 import 区

定位：文件顶部 import 区。

把：

```ts
import React, { useState, useMemo } from 'react';
import { parseScript, ScriptLine } from '../../utils/scriptParser';
```

替换为：

```ts
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SCRIPT_COLORS,
  mergeCharacterColors,
  parseScript,
  ScriptLine,
} from '../../utils/scriptParser';
```

#### 2.2 在 `styles` 对象新增颜色选择相关样式

定位：`const styles = { ... } as const;` 内。

新增以下键（直接追加到 `styles` 对象中，和现有 `characterChip` 同级）：

```ts
  characterChipInteractive: (color: string, active: boolean): React.CSSProperties => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    border: `1px solid ${color}`,
    color,
    background: active ? `${color}28` : `${color}18`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none' as const,
    position: 'relative' as const,
  }),

  colorPickerPopover: {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 20,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 20px)',
    gap: '6px',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  } as React.CSSProperties,

  colorOptionBtn: (color: string, selected: boolean): React.CSSProperties => ({
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: selected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.25)',
    background: color,
    padding: 0,
    cursor: 'pointer',
  }),
```

#### 2.3 新增状态与派生数据（`ScriptViewer` 函数内）

定位：`function ScriptViewer({ document }: { document: WorkbenchDocument })`。

在现有：

```ts
const parsed = useMemo(() => parseScript(document.content), [document.content]);
const [activeIdx, setActiveIdx] = useState(0);
```

后追加以下完整代码：

```ts
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  const effectiveColors = useMemo(
    () => mergeCharacterColors(parsed.characterColors, customColors),
    [parsed.characterColors, customColors],
  );

  useEffect(() => {
    setCustomColors({});
    setEditingCharacter(null);
  }, [document.id, document.content]);

  useEffect(() => {
    if (!editingCharacter) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pickerContainerRef.current && !pickerContainerRef.current.contains(target)) {
        setEditingCharacter(null);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [editingCharacter]);
```

#### 2.4 色标条渲染替换为“可点击 + 弹层选色”

定位：当前这段：

```tsx
{parsed.characters.map((name) => (
  <span key={name} style={styles.characterChip(parsed.characterColors[name])}>
    {name}
  </span>
))}
```

整段替换为：

```tsx
{parsed.characters.map((name) => {
  const chipColor = effectiveColors[name] || 'var(--text-secondary)';
  const isEditing = editingCharacter === name;

  return (
    <span
      key={name}
      style={styles.characterChipInteractive(chipColor, isEditing)}
      onClick={(e) => {
        e.stopPropagation();
        setEditingCharacter((prev) => (prev === name ? null : name));
      }}
      title="点击修改角色颜色"
    >
      {name}
      {isEditing && (
        <div
          ref={pickerContainerRef}
          style={styles.colorPickerPopover}
          onClick={(e) => e.stopPropagation()}
        >
          {DEFAULT_SCRIPT_COLORS.map((color) => (
            <button
              key={`${name}-${color}`}
              type="button"
              style={styles.colorOptionBtn(color, chipColor === color)}
              onClick={() => {
                setCustomColors((prev) => ({ ...prev, [name]: color }));
                setEditingCharacter(null);
              }}
              aria-label={`将 ${name} 颜色设为 ${color}`}
              title={color}
            />
          ))}
        </div>
      )}
    </span>
  );
})}
```

#### 2.5 正文渲染 colorMap 切换为 `effectiveColors`

定位：`ScriptLineView` 调用处。

把：

```tsx
<ScriptLineView
  key={i}
  line={line}
  colorMap={parsed.characterColors}
/>
```

替换为：

```tsx
<ScriptLineView
  key={i}
  line={line}
  colorMap={effectiveColors}
/>
```

---

### Step 3: `docs/05_changelog/2026-04-18-script-canvas-feature.md` — 修改（执行完成后）

**目的**：记录 P1-5 已落地，避免“文档状态仍显示 P1 全待开发”。

**具体改动**：

1. 在文档头部状态处把“P1 待开发”更新为“P1-5 已完成，其余待开发”。
2. 在“待开发（P1）”表格中，把 `P1-5` 行改为“已完成（日期 + 关联 PR/commit）”。
3. 新增小节“P1-5 角色颜色自定义”描述：
   - `DEFAULT_SCRIPT_COLORS` / `mergeCharacterColors` 已导出
   - `scriptPlugin` 支持点击角色色标弹出选色
   - 正文与色标统一用 `effectiveColors`

> 说明：Step 3 是“开发完成后的文档回填”，不是编码前置步骤。

## 执行顺序
1. 先做 Step 1（导出色盘和合并函数，建立基础 API）。
2. 再做 Step 2（接入 UI 状态与渲染，消费 Step 1 的导出）。
3. 最后做 Step 3（变更记录回填，确保文档状态一致）。

## 验证方法
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` 成功
- [ ] 启动应用后上传一个剧本文件，进入 Script Canvas
- [ ] 点击任一角色色标，会出现颜色选择弹层
- [ ] 点击某个新颜色后：
  - [ ] 色标颜色立即变化
  - [ ] 正文该角色台词颜色同步变化
- [ ] 切换到其他文档/重新上传新剧本后，不会污染新文档的颜色状态（`customColors` 重置）
- [ ] 未自定义颜色的角色仍使用解析器默认配色

## 禁区提醒
- 本任务不得修改以下稳定链路：
  - `useTypewriter` hook
  - `StreamRouter`
  - `TurnFSM`
  - `ChatTab_v2.tsx` 的 block 渲染管线
  - `_processContentChunk` / `_flushThinkState`
  - `.chat-messages-wrap` 的 `display: block`
  - `programmaticScrollRef` 逻辑
- 本任务只改 `scriptParser.ts` 与 `scriptPlugin.tsx`（以及完成后的 changelog 文档），不触碰聊天流式链路。

## 回滚方案
- 若颜色弹层导致交互异常，可先回滚 `scriptPlugin.tsx` 的 Step 2 改动，保留 Step 1 导出函数（不影响现有功能）。
- 若需要完全回滚：
  1. 撤销 `scriptPlugin.tsx` 相关提交
  2. 撤销 `scriptParser.ts` 中 `DEFAULT_SCRIPT_COLORS` / `mergeCharacterColors` 导出与调用替换
  3. 同步回滚 `docs/05_changelog/` 对应记录

## 提交建议
```bash
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "feat(script-canvas): add P1-5 character color customization"
```
