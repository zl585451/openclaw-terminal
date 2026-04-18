# 剧本 Canvas P1-1（按角色筛选视图）执行方案（现有代码适配版）

## 前置条件
- 已完成并合入 P1-5（角色颜色自定义）代码基线：
  - `src/utils/scriptParser.ts` 已导出 `DEFAULT_SCRIPT_COLORS` 与 `mergeCharacterColors`
  - `src/workbench/plugins/scriptPlugin.tsx` 已存在 `customColors` / `editingCharacter` / `effectiveColors`
- 当前插件仍为“内联样式实现”，本方案不新增 CSS 文件。
- 本方案只实现 **P1-1 角色筛选**，不包含导出、AI 润色、章节改写。

## 改动清单

### Step 1: `src/workbench/plugins/scriptPlugin.tsx` — 修改（新增筛选状态与过滤函数）

**目的**：在 `ScriptViewer` 内建立角色筛选状态机，支持“空集合=显示全部、非空集合=显示选中角色台词”。

**具体改动**：

#### 1.1 在 `ScriptViewer` 内新增状态

定位：`function ScriptViewer({ document }: { document: WorkbenchDocument })` 内，`activeIdx/customColors/editingCharacter` 状态附近。

追加：

```ts
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
```

#### 1.2 新增筛选控制函数

定位：`ScriptViewer` 函数内，`chapter` 变量定义之前或之后均可，建议放在状态定义下方。

追加完整函数：

```ts
  const toggleCharacterFilter = (name: string) => {
    setSelectedCharacters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const clearCharacterFilter = () => {
    setSelectedCharacters(new Set());
  };
```

#### 1.3 文档切换时重置筛选状态

定位：P1-5 已有的 reset effect：

```ts
  useEffect(() => {
    setCustomColors({});
    setEditingCharacter(null);
  }, [document.id, document.content]);
```

替换为：

```ts
  useEffect(() => {
    setCustomColors({});
    setEditingCharacter(null);
    setSelectedCharacters(new Set());
  }, [document.id, document.content]);
```

#### 1.4 新增可见行过滤函数

定位：`ScriptViewer` 内，`const chapter = parsed.chapters[activeIdx];` 附近。

追加完整函数：

```ts
  const isLineVisible = (line: ScriptLine): boolean => {
    if (selectedCharacters.size === 0) return true;

    // 仅对“角色台词”做筛选；其余内容保留作为上下文
    if (line.type === 'dialogue') {
      return !!line.character && selectedCharacters.has(line.character);
    }

    return true;
  };

  const visibleLines = chapter
    ? chapter.lines.filter((line) => isLineVisible(line))
    : [];
```

---

### Step 2: `src/workbench/plugins/scriptPlugin.tsx` — 修改（色标条交互改为：左键筛选 / 右键改色）

**目的**：解决 P1-5“左键开选色”和 P1-1“左键筛选”的冲突，统一交互：
- 左键：筛选角色
- 右键：打开颜色面板（保留 P1-5 能力）

**具体改动**：

#### 2.1 更新 `styles.characterChipInteractive` 签名与样式

定位：`styles` 对象内，P1-5 新增的 `characterChipInteractive`。

把原函数替换为：

```ts
  characterChipInteractive: (
    color: string,
    opts: { selected: boolean; dimmed: boolean; editing: boolean },
  ): React.CSSProperties => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    border: `1px solid ${color}`,
    color,
    background: opts.selected ? `${color}2e` : `${color}18`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none' as const,
    position: 'relative' as const,
    opacity: opts.dimmed ? 0.35 : 1,
    boxShadow: opts.editing ? `0 0 0 1px ${color}` : 'none',
    transition: 'opacity 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
  }),
```

#### 2.2 新增“全部”筛选按钮样式

定位：`styles` 对象内，追加：

```ts
  filterAllChip: (active: boolean): React.CSSProperties => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    border: `1px solid ${active ? 'var(--accent-primary, #7EC8E3)' : 'var(--border-subtle)'}`,
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-primary-muted, rgba(126,200,227,0.15))' : 'transparent',
    cursor: 'pointer',
    userSelect: 'none' as const,
  }),
```

#### 2.3 替换色标条渲染逻辑

定位：角色色标条 `parsed.characters.map(...)` 片段（P1-5 已改为可弹选色）。

将整段替换为以下完整实现：

```tsx
            <span
              style={styles.filterAllChip(selectedCharacters.size === 0)}
              onClick={(e) => {
                e.stopPropagation();
                clearCharacterFilter();
              }}
              title="清除筛选，显示全部角色"
            >
              全部
            </span>

            {parsed.characters.map((name) => {
              const chipColor = effectiveColors[name] || 'var(--text-secondary)';
              const isEditing = editingCharacter === name;
              const isSelected = selectedCharacters.has(name);
              const isDimmed = selectedCharacters.size > 0 && !isSelected;

              return (
                <span
                  key={name}
                  style={styles.characterChipInteractive(chipColor, {
                    selected: isSelected,
                    dimmed: isDimmed,
                    editing: isEditing,
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCharacterFilter(name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingCharacter((prev) => (prev === name ? null : name));
                  }}
                  title="左键：筛选角色；右键：修改颜色"
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

> 说明：右键菜单在 Electron/Web 环境都可用；如后续要兼容触控端，再补“长按改色”手势。

---

### Step 3: `src/workbench/plugins/scriptPlugin.tsx` — 修改（正文渲染改为 `visibleLines`）

**目的**：将章节正文从“无条件渲染 chapter.lines”切换为“按筛选后的 visibleLines 渲染”。

**具体改动**：

定位：当前正文渲染处：

```tsx
{chapter.lines.map((line, i) => (
  <ScriptLineView
    key={i}
    line={line}
    colorMap={effectiveColors}
  />
))}
```

替换为：

```tsx
{visibleLines.map((line, i) => (
  <ScriptLineView
    key={`${activeIdx}-${i}-${line.raw}`}
    line={line}
    colorMap={effectiveColors}
  />
))}
```

> 说明：key 改为包含章节索引与原始行文本，减少筛选切换时的复用错位。

---

### Step 4: `docs/05_changelog/2026-04-18-script-canvas-feature.md` — 修改（执行完成后）

**目的**：回填 P1-1 的实现状态与交互定义，避免文档与代码脱节。

**具体改动**：

1. 在 P1 状态区标记 `P1-1 已完成`。
2. 新增小节“P1-1 按角色筛选视图”记录：
   - 左键筛选 / 右键改色
   - 支持多选
   - `全部` 一键清除筛选
   - 正文渲染从 `chapter.lines` 改为 `visibleLines`
3. 在待开发表中移除或标注 P1-1 已完成（保留 P1-2/P1-3/P1-4）。

## 执行顺序
1. 先做 Step 1（建立状态与过滤函数）。
2. 再做 Step 2（调整色标交互与样式，解决与 P1-5 点击冲突）。
3. 再做 Step 3（正文渲染切到 `visibleLines`）。
4. 最后做 Step 4（文档回填）。

## 验证方法
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` 成功
- [ ] 打开任意剧本文档，初始状态显示全部台词
- [ ] 左键点击某个角色名后：
  - [ ] 只保留该角色 `dialogue` 行
  - [ ] 其余角色 `dialogue` 行隐藏
  - [ ] 非 `dialogue` 行（场景/备注/正文/空行）仍保留
- [ ] 再左键点击第二个角色，可多选显示两人台词
- [ ] 再次点击已选角色，可取消该角色筛选
- [ ] 点击“全部”后恢复完整视图
- [ ] 右键角色名仍可打开颜色选择面板，改色功能不受影响
- [ ] 筛选与改色同时存在时，正文颜色仍按 `effectiveColors` 正确显示
- [ ] 切换到另一份剧本文档后，筛选状态被重置

## 禁区提醒
- 本任务不得修改以下稳定链路：
  - `useTypewriter` hook
  - `StreamRouter`
  - `TurnFSM`
  - `ChatTab_v2.tsx` 的 block 渲染管线
  - `_processContentChunk` / `_flushThinkState`
  - `.chat-messages-wrap` 的 `display: block`
  - `programmaticScrollRef` 逻辑
- 本任务仅改 `scriptPlugin.tsx`（加一次 changelog 回填），不触碰聊天流式和网关链路。

## 回滚方案
- 若筛选逻辑出现误过滤：
  1. 回滚 `visibleLines/isLineVisible` 改动，恢复 `chapter.lines` 全量渲染
  2. 保留样式和右键改色逻辑，降低影响面
- 若交互冲突（左键/右键）引发误触：
  1. 临时关闭右键改色入口，保留左键筛选
  2. 或回滚至 P1-5 的“点击改色”版本，暂停 P1-1

## 提交建议
```bash
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "feat(script-canvas): add P1-1 character filter view"
```
