# OCT 项目 - [pills] 标签不渲染问题

## 问题描述
[pills] 标签显示为原始文本，没有被解析成胶囊按钮
- 代码块默认展开已修复 ✅
- 表格渲染正常 ✅
- 只有交互标签不工作 ❌

## 背景
- 项目：OCT (Electron + React + Node.js)
- 项目路径：E:\windows-window\OpenClaw-Terminal
- 之前正常，安装自适应澄清系统后出问题
- 已尝试修复多次，越修越乱

## 需要分析
1. Gateway 的标签解析逻辑（oct-gateway/ai.js）
2. 前端解析器是否正确检测 [pills] 标签（src/utils/optionBoxParser.ts）
3. 前端渲染组件是否正确处理（src/components/ChatTab.tsx）
4. 是否有 stream 输出时机问题（标签被分批发送导致解析失败）

## 提供的文件
1. ai.js - Gateway 主逻辑
2. optionBoxParser.ts - 选项框解析器
3. ChatTab.tsx - 消息渲染组件
4. CodeBlock.tsx - 代码块组件
5. package.json - 项目配置
6. OCT_PROTOCOL.md - 标签格式定义
7. CLARIFICATION_PROTOCOL.md - 追问规则

## 期望
找出 [pills] 标签不解析的根本原因，给出一键修复方案
