# OpenClaw 音频知识库技能

## 技能概述

这个技能让OpenClaw能够调用音频专业知识库，回答混音、声音设计、广播剧制作等专业问题。

## 知识库内容

- 50本音频专业书籍
- 5202个知识块
- 涵盖：混音、声音设计、录音技术、广播剧制作、影视声音等

## 使用场景

当用户询问以下类型问题时，应调用此技能：

1. **混音相关问题**
   - "混响怎么设置？"
   - "压缩器参数怎么调？"
   - "如何做自动化？"

2. **声音设计问题**
   - "梦境应该用什么混响？"
   - "转场效果怎么做？"
   - "远景声音怎么处理？"

3. **录音技术问题**
   - "如何录制人声？"
   - "话筒摆放有什么技巧？"

4. **广播剧/影视声音**
   - "广播剧的声音元素有哪些？"
   - "如何设计电影音效？"

## 不要使用的场景

以下问题不适合使用此技能：

1. **非音频问题**
   - 编程问题
   - 生活常识
   - 其他领域专业问题

2. **知识库没有的内容**
   - 特定软件的高级操作（如REAPER的特定脚本）
   - 最新发布的插件
   - 知识库书籍未涵盖的主题

## 工具函数

### audio_knowledge_search

搜索音频知识库，获取专业答案。

**参数：**
- `query` (string): 用户的问题
- `top_k` (integer, optional): 返回结果数量，默认5

**返回：**
```json
{
  "answer": "答案文本",
  "sources": ["来源1.pdf", "来源2.pdf"],
  "confidence": 0.85
}
```

### audio_knowledge_retrieve

仅检索相关文档片段，不生成答案。

**参数：**
- `query` (string): 搜索关键词
- `top_k` (integer, optional): 返回结果数量，默认5

**返回：**
```json
[
  {
    "question": "相关问题",
    "answer": "文档片段内容",
    "source": "来源文档",
    "confidence": 0.90
  }
]
```

## 使用示例

### 示例1：简单问答

用户: "什么是混响？"

OpenClaw思考: 这是音频专业问题，调用知识库。

```python
result = audio_knowledge_search("什么是混响？")
```

返回:
```
混响是指声音在空间中反射形成的声学效果...
来源: 混响大法.pdf
```

### 示例2：多轮对话

用户: "压缩器怎么用？"
OpenClaw: [调用知识库回答]

用户: "那attack参数怎么设置？"
OpenClaw: [基于上下文继续回答]

### 示例3：知识库没有的内容

用户: "REAPER怎么安装SWS扩展？"

OpenClaw思考: 这可能不在知识库中，但可以尝试搜索。

```python
result = audio_knowledge_search("REAPER SWS扩展")
```

返回: 知识库中没有相关内容...

OpenClaw: 知识库中没有找到REAPER SWS扩展的相关内容，但我可以告诉你一般安装方法...

## 错误处理

### 1. 知识库未初始化

**错误信息:** "知识库未初始化"

**处理方法:**
```python
# 检查知识库状态
if not knowledge_base_ready():
    return "知识库正在初始化，请稍后再试"
```

### 2. API密钥无效

**错误信息:** "API密钥无效或过期"

**处理方法:**
```
告诉用户:
1. 检查DEEPSEEK_API_KEY环境变量是否设置
2. 确认API密钥是否有效
3. 检查API余额是否充足
```

### 3. 网络连接失败

**错误信息:** "无法连接到DeepSeek API"

**处理方法:**
```
告诉用户:
1. 检查网络连接
2. 如果在中国，可能需要代理
3. 稍后重试
```

### 4. 向量数据库损坏

**错误信息:** "向量数据库读取失败"

**处理方法:**
```
告诉用户:
1. 可能需要重新处理文档
2. 运行: python audio_knowledge_base.py --docs-dir "./documents/audio" --force
```

### 5. 查询超时

**错误信息:** "查询超时"

**处理方法:**
```
告诉用户:
1. 问题可能太复杂，尝试简化
2. 分成多个小问题询问
3. 稍后重试
```

## 配置要求

### 环境变量

```bash
# 必需
DEEPSEEK_API_KEY=sk-xxx

# 可选（加速模型加载）
HF_HUB_OFFLINE=1

# 可选（中国用户）
HF_ENDPOINT=https://hf-mirror.com
```

### 依赖安装

```bash
pip install chromadb langchain pymupdf sentence-transformers openai
```

## 性能说明

| 操作 | 耗时 | 说明 |
|------|------|------|
| 首次初始化 | ~10秒 | 加载模型 |
| 后续查询 | ~2-5秒 | 向量搜索 + API调用 |
| 答案生成 | ~10-30秒 | DeepSeek API生成 |

## 最佳实践

### 1. 问题要具体

❌ 不好: "混音怎么做？"
✅ 好: "人声混音时如何处理齿音？"

### 2. 使用专业术语

❌ 不好: "声音太吵怎么办？"
✅ 好: "如何减少高频刺耳感？"

### 3. 分步骤询问

复杂问题分成多个小问题：
1. "压缩器的工作原理是什么？"
2. "压缩器的attack参数怎么设置？"
3. "压缩器和限制器有什么区别？"

### 4. 结合上下文

OpenClaw会记住对话历史，可以追问：
- "那release呢？"
- "有没有更简单的方法？"
- "在REAPER里怎么操作？"

## 维护说明

### 添加新书籍

1. 将PDF/Markdown文件放入 `documents/audio/` 目录
2. 运行: `python audio_knowledge_base.py --docs-dir "./documents/audio"`
3. 系统会自动增量处理新文件

### 重新处理所有文档

```bash
python audio_knowledge_base.py --docs-dir "./documents/audio" --force
```

### 生成QA对（可选）

```bash
python audio_knowledge_base.py --docs-dir "./documents/audio" --generate-qa
```

## 文件位置

```
E:\AI.library\
├── audio_knowledge_base.py   # 主程序
├── documents/audio/          # 知识库文档
├── data/                     # 数据库
│   ├── chroma_db/           # 向量数据库
│   └── file_records.db      # 处理记录
└── openclaw_skill.md        # 本文件
```

## 联系支持

如有问题，请检查：
1. README.md - 完整使用文档
2. OCR_INSTALL_GUIDE.md - OCR功能安装指南
3. agent_example.py - 代码示例
