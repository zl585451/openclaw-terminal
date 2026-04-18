# 2026-04-18 剧本上传与 Canvas 染色渲染功能

> Status: CURRENT  
> 实现阶段: P0 已完成，P1-5/P1-1/P1-4/P1-2 已完成（P1-3 待开发）

---

## 背景

用户场景：有声书 / 广播剧剧本制作，需要将 `.txt` / `.docx` 格式的剧本上传到 Canvas，按角色自动染色，方便 CV（配音演员）快速识别自己的台词。

---

## 已完成改动（P0）

### 改动文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `electron/main.ts` | 修改 | 新增 `parse-script-file` IPC 通道；顶部 `require('mammoth')` |
| `electron/preload.ts` | 修改 | 暴露 `parseScriptFile()` 方法 |
| `src/utils/scriptParser.ts` | 新建 | 前端剧本解析器 |
| `src/workbench/types.ts` | 修改 | `WorkbenchArtifactType` 新增 `'script'` |
| `src/workbench/plugins/scriptPlugin.tsx` | 新建 | 剧本渲染插件 |
| `src/workbench/plugins/index.ts` | 修改 | 注册 `scriptPlugin`，优先级最高 |
| `src/components/workbench/WorkbenchPanel.tsx` | 修改 | 工具栏新增「📄 剧本」上传按钮 |
| `src/styles/ChatTab.css` | 修改 | Canvas Push 模式布局修复 |

### 依赖

```bash
npm install mammoth --save
```

---

## 技术方案详解

### 1. 文件解析链路（主进程）

**IPC 通道**：`parse-script-file`

```
用户点击「📄 剧本」按钮
  → ipcRenderer.invoke('parse-script-file')
  → Electron 弹出文件选择框（过滤 .txt / .docx）
  → .docx：mammoth.extractRawText() 转纯文本
  → .txt：读取 buffer，检测 UTF-8，乱码则用 GBK 解码
  → 返回 { success, text, fileName }
```

**编码处理**：UTF-8 优先，含 `\uFFFD`（替换符）时自动切换 GBK，兼容 Windows 中文 TXT 文件。

---

### 2. 前端解析器（`src/utils/scriptParser.ts`）

**输入**：纯文本字符串  
**输出**：`ParsedScript` 结构

```typescript
interface ParsedScript {
  title: string;           // 文档标题（第一个非空行）
  chapters: ScriptChapter[];
  characters: string[];    // 出场角色列表（按出现顺序）
  characterColors: Record<string, string>; // 角色 → 颜色
}

interface ScriptChapter {
  title: string;
  lines: ScriptLine[];
}
```

**识别规则（正则，按优先级）**：

| 优先级 | 类型 | 示例 | 正则逻辑 |
|---|---|---|---|
| 1 | 章节标题 | `第一幕：古宅惊魂` / `序幕` / `第1章` | 匹配 `第X幕/章/集/回/节`、`序幕`、`尾声`、`终幕` 等 |
| 2 | 旁白 | `旁白：...` / `【旁白（评书）】...` | 固定角色名，有专属颜色 |
| 3 | 场景指令 | `【场景】` `【配乐】` `【音效】` `【气氛场景】` | 匹配预定义指令标签列表 |
| 4 | 导演备注 | `★★ 百姓议论纷纷` | `★` 开头 |
| 5 | 台词格式2 | `【苏青瓷】（深吸一口气）纵使有鬼魅…` | `【角色名】（情绪）台词` |
| 6 | 台词格式1 | `苏青瓷：参爹，您其实一早便知…` | `角色名：台词`（冒号全/半角） |
| 7 | 正文 | 其他行 | 原样保留 |

**颜色分配**：15 色护眼暗色方案，按角色首次出现顺序自动分配，全文一致。

---

### 3. Canvas 渲染插件（`src/workbench/plugins/scriptPlugin.tsx`）

**触发条件**：`document.artifactType === 'script'`

**UI 结构**：
```
┌──────────────────────────────────────────────────┐
│  工具栏（📄 剧本 / Details / Copy / Export / ✕）   │
├────────────┬─────────────────────────────────────┤
│            │  角色色标条（角色名 + 对应颜色）        │
│  章节目录   ├─────────────────────────────────────┤
│  （左侧）   │                                     │
│            │  当前章节正文                         │
│            │  - 角色台词：名字+台词同色染色           │
│            │  - 情绪说明：灰色小字                  │
│            │  - 场景指令：灰色斜体                  │
│            │                                     │
└────────────┴─────────────────────────────────────┘
```

**性能策略**：按章节切换展示，每次只渲染当前章节 DOM，十几万字不卡。

---

### 4. Canvas Push 模式布局（`src/styles/ChatTab.css`）

Canvas 面板打开时只收缩 `.chat-section`，右边栏留在原位被 Canvas 自然覆盖，不产生空白缝。

```css
.chat-section {
  transition: max-width 0.18s ease;
}
.chat-tab--canvas-open .chat-section {
  max-width: calc(100% - min(62vw, 960px));
}
```

---

## 剧本格式规范（OCT 标准）

上传文件建议符合以下格式，不符合的行原样保留不强行解析：

```
剧本标题（第一行）

第一幕：章节名称

【场景】场景描述文字
【配乐】配乐说明
【音效】音效说明

角色名：台词内容
【角色名】（情绪说明）台词内容
【旁白】旁白内容

★★ 导演备注
```

**支持格式**：`.txt`（UTF-8 / GBK）、`.docx`（Word）  
**不支持**：`.pdf`、`.epub`、`.xlsx`

---

## P1 进度（截至 2026-04-18）

| 优先级 | 功能 | 说明 |
|---|---|---|
| P1-1 | 按角色筛选视图 | 已完成：左键筛选角色，多选；“全部”一键清除；正文按筛选过滤 |
| P1-2 | 选段 AI 润色 | 已完成：选中正文文本后可触发润色并展示结果面板 |
| P1-3 | 章节级 AI 操作 | 改整幕某角色台词风格 |
| P1-4 | 导出回 .txt | 已完成：导出走 Script 专用序列化而非原始 content 直出 |
| P1-5 | 角色颜色自定义 | 已完成：右键角色色标打开调色盘并实时生效 |

---

## P1 已完成项说明

### P1-5 角色颜色自定义

- `src/utils/scriptParser.ts` 新增 `DEFAULT_SCRIPT_COLORS` 和 `mergeCharacterColors()`
- `src/workbench/plugins/scriptPlugin.tsx` 增加 `customColors` 状态
- 角色颜色统一由 `effectiveColors = mergeCharacterColors(parsed.characterColors, customColors)` 驱动
- 角色色标支持右键打开颜色选择弹层，修改后正文与色标同步更新

### P1-1 按角色筛选视图

- `src/workbench/plugins/scriptPlugin.tsx` 增加 `selectedCharacters: Set<string>` 状态
- 色标条支持左键筛选角色（可多选），`全部` 清空筛选
- 正文渲染由 `chapter.lines` 切换为 `visibleLines`，只过滤 `dialogue` 行，保留场景/备注/正文上下文行

### P1-4 导出回 TXT

- 新增 `src/utils/scriptExporter.ts`，提供 `exportScriptToText()` 序列化能力
- `src/workbench/plugins/types.ts` 扩展插件导出接口：`getExportContent()`
- `src/components/workbench/WorkbenchPanel.tsx` 的 `Export` 按钮优先使用插件导出内容
- `src/workbench/plugins/scriptPlugin.tsx` 接入 `getExportContent`，将脚本按解析结构导出为 UTF-8 文本

### P1-2 选段 AI 润色

- `oct-gateway/transport/httpRoutes.js` 新增 `POST /api/polish`
- 后端复用 `streamChat` 执行一次性润色请求（`toolChoice: 'none'`），并清理潜在 `[cot]...[/cot]` 输出
- `src/workbench/plugins/scriptPlugin.tsx` 新增选区检测与润色 UI：
  - 选中正文且长度 >= 1 字即可触发润色
  - 角色条右侧提供常驻“✨ AI 润色”按钮（无选区时置灰），避免浮层触发时序问题
  - 选区上方保留浮动“✨ AI 润色”快捷按钮
  - 新增“右键选中文本直接润色”路径（不再依赖浮动按钮显示）
  - 调用 `http://127.0.0.1:18790/api/polish` 获取结果
  - 右下角结果面板改为可编辑润色框：仅显示润色文本，支持用户手改后再「应用到原文」或复制
  - 润色结果面板支持拖动（标题栏）与缩放（右下角拖拽）
  - 修复面板交互稳定性：小窗改为独立开关控制，避免点击面板时意外消失
  - 收敛关闭链路：仅“关闭”按钮可关窗；面板自身点击/按下事件不再触发外层链路
  - 面板改为 Portal 挂载到 `document.body`，提升层级并规避 Canvas 容器裁切/层叠上下文干扰
  - 修复“应用到原文”定位失败：新增按选区行块优先定位替换，失败再回退文本匹配
  - 优化剧本 UI 可读性：角色标签/操作按钮改为中文无衬线字体栈，增大字号与字重，提升抗糊表现
  - 章节目录可收起/展开，收起后仅保留窄栏切换按钮，减少横向占位
  - 章节目录字体同步优化（字号/字重/间距），提升标签与目录区的一致可读性
  - 新增正文字号调整（A-/A+，13px~24px），实时作用于章节标题与正文阅读区
  - 新增剧本安全编辑链路：导入即在 `userData/script-drafts` 生成缓存副本，后续编辑自动回写缓存，不触碰源文件
  - 增加格式标准化能力：`parseScript` 前新增 `normalizeScriptText()`（换行/BOM/冒号/括号/旁白保守归一化）
  - 新增 `POST /api/script-format` 与前端「🔄 AI 格式化」按钮，支持对当前缓存文本做 AI 规范化并回写当前文档
  - AI 格式化稳态修复：增加 20s 超时、输入瘦身到 10000 字、章节标题保留约束
  - AI 结果应用保护：若解析后章节数量减少则拒绝覆盖，并自动回退到本地规范化结果
  - AI 格式化改为默认“仅当前章节”处理，按钮文案调整为「🔄 AI 格式化当前章」，显著降低耗时与误改范围
  - 新增格式化质量门禁：若输出包含非剧本痕迹（方案/列表/代码块）或改变章节结构/当前章标题，则拒绝覆盖
  - 剧本台词排版优化：台词行改为“角色名 + 缩进正文”两段式，解决长句挤压与换行错位
  - 内联括号渲染优化：`（动作/情绪）` 在台词中自动弱化为灰色小字，台词正文保持角色主色
  - 新增「撤销替换」：可回滚最近一次“应用到原文”操作

---

## 已知限制 / 边缘情况

1. **格式不规范文件**：无明显章节标题的文件，所有内容归入第一个兜底章节
2. **角色名长度**：正则限制角色名 ≤ 10 字（过滤段落标题误识别）
3. **混合编码 TXT**：部分 Windows 软件生成的 TXT 混用 UTF-8/GBK，可能出现局部乱码，建议转存为 UTF-8 再上传
4. **mammoth 限制**：`.docx` 转换会丢失颜色、字体等样式，仅保留纯文本和段落结构（符合预期）
