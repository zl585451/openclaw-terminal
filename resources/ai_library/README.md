# 音频专业知识库系统

完整的音频知识库解决方案，支持文档处理、向量化、QA生成和智能OCR识别。

## 核心特性

### 1. 智能OCR流水线 🎯

**免费优先，API保底**的分层OCR处理架构：

| 模式 | 说明 | 费用 |
|------|------|------|
| `paddle_only` | 仅使用PaddleOCR（完全免费） | ¥0 |
| `deepseek_only` | 仅使用DeepSeek API（高准确率） | 按量计费 |
| `smart`（推荐） | PaddleOCR为主，质量低时自动切换API | 极低费用 |

#### 质量评估维度

```python
def assess_recognition_quality(text, image_shape):
    # 1. 文字密度检查（<10字符 → 0.3分）
    # 2. 中文字符占比（<10% → 0.8分）
    # 3. 乱码检测（>20% → 0.2分）
    # 4. 文本密度（<0.5/10000px → 0.8分）
    return quality_score  # 0.0-1.0
```

#### 图像预处理流程

```
原始图像
    ↓
灰度转换
    ↓
CLAHE对比度增强（让淡字变清晰）
    ↓
自适应二值化（文字更黑，背景更白）
    ↓
降噪（去掉扫描斑点）
    ↓
锐化（笔画边缘更清晰）
    ↓
增强后图像 → OCR识别
```

### 2. 文档处理

- **支持格式**: Markdown, PDF
- **智能分块**: 500字符/块，80字符重叠
- **增量更新**: 基于文件哈希，只处理新增/修改的文件
- **自动OCR**: 检测扫描件（文本<100字符时自动启用OCR）

### 3. 向量化存储

- **向量数据库**: ChromaDB
- **Embedding**: 本地模型（paraphrase-multilingual-MiniLM-L12-v2）
- **分离存储**: 文档块和QA对分别存储
- **元数据追踪**: 来源文件、处理时间、OCR统计等

### 4. QA对生成

- **自动生成**: 为每个文档块生成3-5个问答对
- **LLM支持**: DeepSeek / OpenAI
- **增量更新**: 只为新文档生成QA对
- **JSON导出**: 便于分析和调试

### 5. Agent接口

为OpenClaw Agent提供的简洁API：

```python
from audio_knowledge_base import KnowledgeBaseAPI

kb = KnowledgeBaseAPI()

# 检索QA对
qa_pairs = kb.retrieve("压缩器应该怎么设置？", top_k=3)

# 生成答案（带来源引用）
answer = kb.generate_answer("什么是混响？")

# 多轮对话
answer = kb.chat("那attack参数怎么设置？")

# 获取结构化上下文（Function Calling）
context = kb.get_context("EQ均衡器如何使用？", top_k=5)
```

## 安装依赖

### 基础依赖

```bash
pip install chromadb langchain pymupdf sentence-transformers openai -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### OCR依赖

```bash
pip install opencv-python numpy pdf2image paddleocr paddlepaddle pytesseract -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Poppler（必需）

pdf2image需要Poppler才能将PDF转换为图像。

**Windows安装：**
1. 下载：https://github.com/oschwartz10612/poppler-windows/releases
2. 解压到 `C:\poppler\`
3. 添加到PATH：`C:\poppler\Library\bin`

**快速安装（Chocolatey）：**
```powershell
choco install poppler
```

详细说明见 [OCR_INSTALL_GUIDE.md](OCR_INSTALL_GUIDE.md)

## 使用方法

### 命令行使用

```bash
# 基础文档处理
python audio_knowledge_base.py --docs-dir "./documents"

# 强制OCR处理（用于扫描件）
python audio_knowledge_base.py --docs-dir "./documents" --force-ocr

# 智能OCR模式（推荐）
python audio_knowledge_base.py --docs-dir "./documents" --force-ocr --ocr-mode smart --save-ocr-stats

# 全免费模式
python audio_knowledge_base.py --docs-dir "./documents" --force-ocr --ocr-mode paddle_only

# 全API模式
python audio_knowledge_base.py --docs-dir "./documents" --force-ocr --ocr-mode deepseek_only

# 自定义质量阈值
python audio_knowledge_base.py --docs-dir "./documents" --force-ocr --ocr-quality-threshold 0.9

# 搜索文档块
python audio_knowledge_base.py --search "广播剧的声音特点"

# 智能问答
python audio_knowledge_base.py --ask "什么是压缩器？"

# 多轮对话
python audio_knowledge_base.py --chat

# 生成QA对
python audio_knowledge_base.py --generate-qa

# 完整流水线
python audio_knowledge_base.py --full-pipeline
```

### Python API使用

```python
from audio_knowledge_base import AudioKnowledgeBase, Config

# 初始化
config = Config()
config.DOCUMENTS_DIR = "./documents"
config.OCR_MODE = "smart"
config.OCR_QUALITY_THRESHOLD = 0.85

kb = AudioKnowledgeBase(config)

# 处理文档
kb.process_documents(force=True, force_ocr=True)

# 生成QA对
kb.generate_qa_pairs(force=True)

# 搜索
results = kb.search("混音技巧", n_results=5)

# 生成答案
answer = kb.generate_answer("如何设置压缩器的attack参数？")
print(answer.text)
print(answer.sources)
print(answer.confidence)
```

## 输出示例

### OCR处理输出

```
处理中: documents\test\扫描件.pdf
    OCR处理: 第 1/50 页...
    OCR处理: 第 2/50 页...
    ...
    OCR处理完成: 50 页                    
完成: 247 个文本块

OCR统计报告:
  总页数: 50
  PaddleOCR成功: 45 (90.0%)
  API保底: 3 (6.0%)
  低质量结果: 2 (4.0%)
  预估API费用: ¥0.03
```

### 问答输出

```
回答: 压缩器是一种动态处理工具，用于控制音频信号的动态范围。主要参数包括：
1. Threshold（阈值）- 触发压缩的电平
2. Ratio（比率）- 压缩强度
3. Attack（启动时间）- 压缩器开始工作的速度
4. Release（释放时间）- 压缩器停止工作的速度

📚 来源: 混音-EQ入门完全手册（中文版）.pdf-第15段, 混响大法.pdf-第8段
📊 置信度: 92.5%
```

## 配置参数

### OCR配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `OCR_ENABLED` | `True` | 是否启用OCR |
| `OCR_MODE` | `smart` | OCR模式：`paddle_only` / `deepseek_only` / `smart` |
| `OCR_QUALITY_THRESHOLD` | `0.85` | 质量阈值，低于此值触发API保底 |
| `OCR_API_FALLBACK` | `True` | 是否启用API保底 |
| `OCR_SAVE_STATS` | `True` | 是否保存OCR统计 |
| `PDF_DPI` | `200` | PDF转图像的DPI |

### 文档处理配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `CHUNK_SIZE` | `500` | 文本块大小（字符） |
| `CHUNK_OVERLAP` | `80` | 文本块重叠（字符） |
| `DOCUMENTS_DIR` | `"./documents"` | 文档目录 |

### LLM配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `LLM_TYPE` | `deepseek` | LLM类型：`deepseek` / `openai` |
| `LLM_MODEL` | `deepseek-chat` | LLM模型名称 |
| `DEEPSEEK_API_KEY` | 环境变量 | DeepSeek API密钥 |
| `OPENAI_API_KEY` | 环境变量 | OpenAI API密钥 |

## 文件结构

```
E:\AI.library\
├── audio_knowledge_base.py    # 主程序
├── requirements.txt              # 依赖列表
├── agent_example.py            # Agent调用示例
├── OCR_INSTALL_GUIDE.md        # OCR安装指南
├── README.md                  # 本文档
├── documents/                 # 文档目录
│   └── test/
└── data/                     # 数据目录
    ├── file_records.db         # 文件处理记录
    ├── qa_records.db          # QA对记录
    ├── chroma_db/            # 文档向量库
    ├── qa_chroma_db/         # QA向量库
    ├── qa_pairs.json         # QA对JSON导出
    └── ocr_stats.json       # OCR统计记录
```

## Agent集成示例

### OpenAI Function Calling

```python
import json
from audio_knowledge_base import KnowledgeBaseAPI

def knowledge_base_search(query: str, top_k: int = 5) -> str:
    """知识库搜索工具函数"""
    kb = KnowledgeBaseAPI()
    context = kb.get_context(query, top_k)
    return json.dumps(context, ensure_ascii=False, indent=2)

tool_schema = {
    "type": "function",
    "function": {
        "name": "knowledge_base_search",
        "description": "搜索音频专业知识库，获取相关问答对和文档片段",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "用户的查询问题"},
                "top_k": {"type": "integer", "description": "返回结果数量", "default": 5}
            },
            "required": ["query"]
        }
    }
}
```

### LangChain集成

```python
from langchain.tools import Tool
from audio_knowledge_base import KnowledgeBaseAPI

kb = KnowledgeBaseAPI()

def search_knowledge(query: str) -> str:
    answer = kb.generate_answer(query)
    return f"{answer.text}\n\n来源: {', '.join(answer.sources)}"

kb_tool = Tool(
    name="AudioKnowledgeBase",
    func=search_knowledge,
    description="搜索音频专业知识库，获取专业问题的答案"
)
```

## 性能优化

### 1. OCR性能

- **PaddleOCR**: 本地运行，速度约1-2秒/页
- **DeepSeek API**: 网络调用，速度约3-5秒/页
- **智能模式**: 90%以上页面使用PaddleOCR，仅少数页面触发API

### 2. 向量化性能

- **本地模型**: 首次加载约10秒，后续约0.1秒/块
- **批量处理**: 支持批量向量化，提升处理速度

### 3. 检索性能

- **ChromaDB**: 毫秒级检索
- **HNSW索引**: 支持大规模向量检索

## 常见问题

### Q1: OCR识别率低怎么办？

A: 尝试以下方法：
1. 降低质量阈值：`--ocr-quality-threshold 0.7`
2. 使用全API模式：`--ocr-mode deepseek_only`
3. 提高PDF DPI：修改配置中的`PDF_DPI = 300`

### Q2: API费用高怎么办？

A: 使用`smart`模式，大部分页面使用免费的PaddleOCR，仅质量低的页面才调用API。

### Q3: 如何查看哪些文档需要API保底？

A: 使用`--save-ocr-stats`参数，然后查看`./data/ocr_stats.json`。

### Q4: 支持哪些语言？

A: PaddleOCR支持中英文，DeepSeek API支持多语言。

### Q5: 如何处理纯扫描件？

A: 使用`--force-ocr`参数，强制对所有PDF进行OCR处理。

## 更新日志

### v2.0 - 智能OCR流水线
- ✅ 新增SmartOCR智能OCR处理器
- ✅ 实现免费优先、API保底的分层架构
- ✅ 新增图像增强预处理（CLAHE、二值化、降噪、锐化）
- ✅ 新增识别质量评估（文字密度、中文占比、乱码检测）
- ✅ 新增OCR统计报告和费用估算
- ✅ 支持三种OCR模式（paddle_only、deepseek_only、smart）
- ✅ 新增OCR统计JSON导出

### v1.0 - 基础功能
- ✅ 文档处理（Markdown/PDF）
- ✅ 智能分块（500字符，80字符重叠）
- ✅ 向量化存储（ChromaDB）
- ✅ 增量更新（文件哈希追踪）
- ✅ QA对生成（3-5个/块）
- ✅ Agent接口（KnowledgeBaseAPI）
- ✅ 多轮对话支持

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

如有问题，请提交Issue或联系维护者。
