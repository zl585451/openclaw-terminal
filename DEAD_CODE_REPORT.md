# OCT Terminal 死代码扫描报告

> 生成时间: 2026-03-25
> 扫描范围: `src/` 和 `electron/` 目录下的 TypeScript/TSX 文件
> 说明: 本报告列出疑似未使用代码，**需人工确认后再删除**

---

## 一、重复/冗余文件 (高风险)

### 1. 主题系统重复
| 文件 | 问题 | 风险等级 |
|------|------|----------|
| `src/styles/themes.ts` | 与 `src/themes/themes.ts` 和 `src/themes/ThemeProvider.tsx` 功能完全重复，且未被任何文件导入 | **高** |

**判断依据**:
- `src/styles/themes.ts` 导出 `THEMES`、`ThemeKey`、`applyTheme`、`loadSavedTheme`、`getCurrentTheme`
- 实际使用的是 `src/themes/themes.ts` (被 `ThemeProvider.tsx` 和 `SettingsPanel.tsx` 导入)
- `src/styles/themes.ts` 未被任何文件引用

**建议**: 删除 `src/styles/themes.ts`，保留 `src/themes/` 目录下的主题系统

---

## 二、废弃/遗留代码 (高风险)

### 2. 旧版主题兼容层
| 文件 | 位置 | 问题 | 风险等级 |
|------|------|------|----------|
| `src/themes/ThemeProvider.tsx` | 19-84行 | 旧主题映射和兼容层代码，注释明确说明"迁移后可删" | **中** |

**具体代码**:
```typescript
// 19-55行: LEGACY_KEYS, LEGACY_THEME_MAP, resolveLegacyTheme 函数
// 60-84行: LEGACY_VAR_MAP, injectLegacyVars 函数
```

**判断依据**:
- 代码注释明确标注 "迁移后可删" 和 "迁移后删这行"
- 用于兼容旧版 localStorage key 和 CSS 变量名
- 如果确认所有用户已迁移到新主题系统，可删除

**建议**: 确认无旧版本用户后删除兼容层

---

## 三、疑似未使用导出 (中风险)

### 3. optionBoxParser.fix.ts (已确认未使用)
| 文件 | 位置 | 问题 | 风险等级 |
|------|------|------|----------|
| `src/utils/optionBoxParser.fix.ts` | 整个文件 | 未被任何文件导入，主文件已包含相同逻辑 | **高** |

**判断依据**:
- 搜索结果显示没有任何文件导入 `optionBoxParser.fix.ts`
- 主文件 `optionBoxParser.ts` 第424行已包含 `parseTaggedContent` 函数
- 该文件是历史遗留的修复补丁，现已合并到主文件

**建议**: 可直接删除

### 4. search.ts 中的导出 (已确认被使用)
| 文件 | 位置 | 问题 | 风险等级 |
|------|------|------|----------|
| `src/gateway/search.ts` | 第61行 | `getSearchConfigFromEnv` 函数被导出并在第441行使用 | **无** |

**判断依据**:
- 搜索结果显示该函数在文件内被导出并在第441行使用
- 此代码是**活跃代码**，不应删除

---

## 四、docs/for_claude 目录 (低风险)

### 5. 文档示例代码
| 文件 | 问题 | 风险等级 |
|------|------|----------|
| `docs/for_claude/optionBoxParser.ts` | 与源码重复，可能是示例/备份 | **低** |
| `docs/for_claude/CodeBlock.tsx` | 与源码重复，可能是示例/备份 | **低** |
| `docs/for_claude/ChatTab.tsx` | 与源码重复，可能是示例/备份 | **低** |

**判断依据**:
- 这些文件是源码的副本
- 位于 `docs/` 目录下，可能是给 Claude 的参考示例
- 不影响主程序运行

**建议**: 如果不再需要作为文档保留，可删除

---

## 五、electron/main.ts 中的潜在死代码

由于 `electron/main.ts` 文件较大（3000+ 行），以下是可能需要检查的部分：

### 6. IPC 处理函数 (已确认被使用)

| IPC 通道 | 位置 | 状态 | 风险等级 |
|----------|------|------|----------|
| `tasks-read` | `electron/main.ts:3275`, `src/components/TaskBoard.tsx:107` | **活跃使用** | **无** |
| `tasks-write` | `electron/main.ts:3300`, `src/components/TaskBoard.tsx:101` | **活跃使用** | **无** |
| `task-board-update` | `electron/main.ts:760,3132`, `src/components/TaskBoard.tsx:153,156` | **活跃使用** | **无** |

**判断依据**:
- `tasks-read` 和 `tasks-write` 在 `TaskBoard.tsx` 中被调用
- `task-board-update` 事件在多处被发送和监听
- 这些都是**活跃代码**，不应删除

---

## 六、未使用的组件导入

### 7. ChatTab.tsx 导入检查 (部分已确认)

在 `src/components/ChatTab.tsx` 中：

| 组件 | 状态 | 说明 |
|------|------|------|
| `ResponseTray` | **可能未使用** | 只导入 CSS 文件，组件本身未导入 |
| `QuestionCards` | 需确认 | 代码中第9行导入 |
| `SetupGuide` | 需确认 | 代码中第17行导入 |

**ResponseTray 详情**:
- 第6行: `import './ResponseTray.css'` - 只导入样式
- 未找到 `import ResponseTray from './ResponseTray'`
- 但第685行注释提到 "已在 ResponseTray 显示"，说明可能曾使用

**建议**: 检查 `ChatTab.tsx` 中是否实际渲染了这些组件

---

## 七、总结与建议

### 高优先级删除（确认后）
1. `src/styles/themes.ts` - 完全重复的主题配置，无任何文件导入
2. `src/utils/optionBoxParser.fix.ts` - 未被任何文件导入，主文件已包含相同逻辑

### 中优先级处理
3. `src/themes/ThemeProvider.tsx` 中的旧兼容层代码（确认无旧用户后删除）
4. `docs/for_claude/` 目录下的示例文件（如不再需要）

### 低优先级检查
5. `src/components/ChatTab.tsx` 中的 `ResponseTray` 组件导入 - 只导入 CSS 未导入组件

### 建议操作步骤
1. **备份项目**（已建议）
2. **删除 `src/styles/themes.ts`** - 无任何导入，风险最低
3. **删除 `src/utils/optionBoxParser.fix.ts`** - 已确认无任何文件导入
4. **检查 ChatTab.tsx** - 确认 `ResponseTray` 组件是否实际使用
5. **测试验证** - 每次删除后运行 `npm run build` 确认无错误

### 预计清理效果
- 删除2个文件，约减少 **200+ 行** 代码
- 减少维护负担和混淆

---

## 附录：快速检查命令

```bash
# 检查文件是否被导入
grep -r "from.*styles/themes" src/
grep -r "from.*optionBoxParser.fix" src/
grep -r "getSearchConfigFromEnv" src/

# 检查 IPC 通道使用
grep -r "tasks-read" src/
grep -r "task-board-update" src/
```

---

*报告结束 - 请人工确认后再执行删除操作*
