#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenClaw 音频知识库工具
提供简洁的API供OpenClaw Agent调用
"""

import os
import sys
from typing import Optional, Dict, List, Any
from dataclasses import dataclass

os.environ['HF_HUB_OFFLINE'] = '1'

from audio_knowledge_base import KnowledgeBaseAPI, Config


_global_kb_instance = None
_global_kb_lock = None


def _get_global_kb_instance(documents_dir: str = "./documents/audio") -> KnowledgeBaseAPI:
    global _global_kb_instance, _global_kb_lock
    if _global_kb_instance is None:
        if _global_kb_lock is None:
            import threading
            _global_kb_lock = threading.Lock()
        with _global_kb_lock:
            if _global_kb_instance is None:
                config = Config()
                config.DOCUMENTS_DIR = documents_dir
                _global_kb_instance = KnowledgeBaseAPI(config)
    return _global_kb_instance


@dataclass
class AudioKnowledgeResult:
    """知识库查询结果"""
    success: bool
    answer: str
    sources: List[str]
    confidence: float
    error: Optional[str] = None


class AudioKnowledgeTool:
    """
    音频知识库工具 - 供OpenClaw Agent调用
    
    使用方法:
        tool = AudioKnowledgeTool()
        result = tool.search("什么是混响？")
        print(result.answer)
        print(result.sources)
    """
    
    def __init__(self, documents_dir: str = "./documents/audio"):
        """
        初始化音频知识库工具
        
        Args:
            documents_dir: 文档目录路径
        """
        self.documents_dir = documents_dir
        self._kb = None
    
    def _ensure_initialized(self) -> bool:
        """确保知识库已初始化"""
        if self._kb is None:
            try:
                self._kb = _get_global_kb_instance(self.documents_dir)
                return True
            except Exception as e:
                print(f"知识库初始化失败: {e}")
                return False
        return True
    
    def search(self, query: str, top_k: int = 5) -> AudioKnowledgeResult:
        """
        搜索音频知识库并生成答案
        
        Args:
            query: 用户问题
            top_k: 返回结果数量
            
        Returns:
            AudioKnowledgeResult: 包含答案、来源、置信度
        """
        if not self._ensure_initialized():
            return AudioKnowledgeResult(
                success=False,
                answer="",
                sources=[],
                confidence=0.0,
                error="知识库初始化失败，请检查配置"
            )
        
        try:
            answer = self._kb.generate_answer(query, top_k=top_k)
            return AudioKnowledgeResult(
                success=True,
                answer=answer.text,
                sources=answer.sources,
                confidence=answer.confidence
            )
        except Exception as e:
            return AudioKnowledgeResult(
                success=False,
                answer="",
                sources=[],
                confidence=0.0,
                error=f"查询失败: {str(e)}"
            )
    
    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        仅检索相关文档片段，不生成答案
        
        Args:
            query: 搜索关键词
            top_k: 返回结果数量
            
        Returns:
            List[Dict]: 文档片段列表
        """
        if not self._ensure_initialized():
            return []
        
        try:
            results = self._kb.retrieve(query, top_k=top_k)
            return [
                {
                    "question": r.question,
                    "answer": r.answer,
                    "source": r.source,
                    "confidence": r.confidence
                }
                for r in results
            ]
        except Exception as e:
            print(f"检索失败: {e}")
            return []
    
    def chat(self, query: str) -> AudioKnowledgeResult:
        """
        多轮对话模式（保留上下文）
        
        Args:
            query: 用户问题
            
        Returns:
            AudioKnowledgeResult: 包含答案、来源、置信度
        """
        if not self._ensure_initialized():
            return AudioKnowledgeResult(
                success=False,
                answer="",
                sources=[],
                confidence=0.0,
                error="知识库初始化失败"
            )
        
        try:
            answer = self._kb.chat(query)
            return AudioKnowledgeResult(
                success=True,
                answer=answer.text,
                sources=answer.sources,
                confidence=answer.confidence
            )
        except Exception as e:
            return AudioKnowledgeResult(
                success=False,
                answer="",
                sources=[],
                confidence=0.0,
                error=f"对话失败: {str(e)}"
            )
    
    def clear_history(self):
        """清除对话历史"""
        if self._kb:
            self._kb.clear_history()
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取知识库统计信息
        
        Returns:
            Dict: 统计信息
        """
        if not self._ensure_initialized():
            return {"error": "知识库未初始化"}
        
        try:
            return {
                "document_count": self._kb._kb.vector_store.collection.count(),
                "qa_count": self._kb._kb.qa_vector_store.collection.count() if hasattr(self._kb._kb, 'qa_vector_store') else 0,
                "documents_dir": self.documents_dir,
                "status": "ready"
            }
        except Exception as e:
            return {"error": str(e)}


def get_tool_schema() -> Dict[str, Any]:
    """
    获取OpenAI Function Calling工具定义
    
    Returns:
        Dict: 工具定义
    """
    return {
        "type": "function",
        "function": {
            "name": "audio_knowledge_search",
            "description": "搜索音频专业知识库，获取混音、声音设计、广播剧制作、录音技术等问题的专业答案。回答会附带来源文档引用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "用户的音频专业问题，如：混响怎么设置、压缩器参数、人声处理、声音设计技巧等"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "返回结果数量，默认5",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    }


def get_retrieve_schema() -> Dict[str, Any]:
    """获取检索工具定义"""
    return {
        "type": "function",
        "function": {
            "name": "audio_knowledge_retrieve",
            "description": "仅检索音频知识库中的相关文档片段，不生成答案。用于获取原始参考资料。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "返回结果数量",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    }


def handle_error(error_type: str) -> str:
    """
    处理常见错误，返回用户友好的提示
    
    Args:
        error_type: 错误类型
        
    Returns:
        str: 错误处理建议
    """
    error_handlers = {
        "api_key_invalid": """
API密钥无效或过期。请检查：
1. DEEPSEEK_API_KEY环境变量是否正确设置
2. API密钥是否有效（登录DeepSeek官网查看）
3. API余额是否充足
""",
        "network_error": """
网络连接失败。请检查：
1. 网络连接是否正常
2. 如果在中国大陆，可能需要配置代理
3. 稍后重试
""",
        "knowledge_base_not_ready": """
知识库未初始化。请运行：
python audio_knowledge_base.py --docs-dir "./documents/audio"
""",
        "query_timeout": """
查询超时。建议：
1. 简化问题，分成多个小问题
2. 稍后重试
""",
        "no_results": """
知识库中没有找到相关内容。可能原因：
1. 问题不在知识库覆盖范围内
2. 尝试使用不同的关键词
3. 知识库主要涵盖：混音、声音设计、录音技术、广播剧制作
"""
    }
    
    return error_handlers.get(error_type, "未知错误，请稍后重试")


if __name__ == "__main__":
    print("="*60)
    print("OpenClaw 音频知识库工具测试")
    print("="*60)
    
    tool = AudioKnowledgeTool()
    
    print("\n1. 获取知识库统计...")
    stats = tool.get_stats()
    print(f"   文档数: {stats.get('document_count', 'N/A')}")
    print(f"   QA对数: {stats.get('qa_count', 'N/A')}")
    
    print("\n2. 测试搜索...")
    result = tool.search("什么是混响？")
    if result.success:
        print(f"   ✅ 搜索成功")
        print(f"   答案: {result.answer[:100]}...")
        print(f"   来源: {result.sources}")
    else:
        print(f"   ❌ 搜索失败: {result.error}")
    
    print("\n3. 测试多轮对话...")
    result1 = tool.chat("压缩器是什么？")
    if result1.success:
        print(f"   Q1: 压缩器是什么？")
        print(f"   A1: {result1.answer[:100]}...")
    
    result2 = tool.chat("那attack参数怎么设置？")
    if result2.success:
        print(f"   Q2: 那attack参数怎么设置？")
        print(f"   A2: {result2.answer[:100]}...")
    
    print("\n" + "="*60)
    print("测试完成")
    print("="*60)
