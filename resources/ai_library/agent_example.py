#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenClaw Agent 调用示例
展示如何在Agent中集成音频知识库
"""

from audio_knowledge_base import (
    KnowledgeBaseAPI,
    AudioKnowledgeBase,
    Config,
    Message,
    AnswerResult,
    RetrievedQA
)


def example_basic_usage():
    """基础用法示例"""
    print("=" * 60)
    print("示例1: 基础用法")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    
    answer = kb.generate_answer("压缩器应该怎么设置？")
    
    print(f"\n回答: {answer.text}")
    print(f"来源: {answer.sources}")
    print(f"置信度: {answer.confidence:.2%}")


def example_multi_turn_chat():
    """多轮对话示例"""
    print("\n" + "=" * 60)
    print("示例2: 多轮对话")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    
    answer1 = kb.chat("什么是压缩器？")
    print(f"\nQ1: 什么是压缩器？")
    print(f"A1: {answer1.text[:200]}...")
    
    answer2 = kb.chat("那attack参数怎么设置？")
    print(f"\nQ2: 那attack参数怎么设置？")
    print(f"A2: {answer2.text[:200]}...")
    
    answer3 = kb.chat("release呢？")
    print(f"\nQ3: release呢？")
    print(f"A3: {answer3.text[:200]}...")
    
    kb.clear_history()
    print("\n对话历史已清除")


def example_retrieve_only():
    """仅检索示例（不生成）"""
    print("\n" + "=" * 60)
    print("示例3: 仅检索QA对")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    
    qa_pairs = kb.retrieve("如何消除人声中的齿音？", top_k=3)
    
    for i, qa in enumerate(qa_pairs, 1):
        print(f"\n--- 结果 {i} ---")
        print(f"问题: {qa.question}")
        print(f"答案: {qa.answer[:150]}...")
        print(f"来源: {qa.source}")
        print(f"置信度: {qa.confidence:.2%}")


def example_get_context():
    """获取上下文示例（适合Function Calling）"""
    print("\n" + "=" * 60)
    print("示例4: 获取结构化上下文")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    
    context = kb.get_context("EQ均衡器如何使用？", top_k=3)
    
    print(f"\n查询: {context['query']}")
    print(f"平均置信度: {context['avg_confidence']:.2%}")
    print(f"来源文档: {context['sources']}")
    
    print("\n相关QA对:")
    for qa in context['qa_pairs'][:2]:
        print(f"  - Q: {qa['question']}")
        print(f"    A: {qa['answer'][:100]}...")
    
    print("\n相关文档片段:")
    for doc in context['documents'][:2]:
        print(f"  - 来源: {doc['source']}")
        print(f"    内容: {doc['content'][:100]}...")


def example_with_custom_config():
    """自定义配置示例"""
    print("\n" + "=" * 60)
    print("示例5: 自定义配置")
    print("=" * 60)
    
    config = Config()
    config.DOCUMENTS_DIR = "./documents"
    config.LLM_TYPE = "deepseek"
    config.EMBEDDING_TYPE = "local"
    
    kb = KnowledgeBaseAPI(config)
    
    answer = kb.generate_answer("什么是混响？")
    print(f"\n回答: {answer.text[:200]}...")


def example_with_conversation_history():
    """带外部对话历史示例"""
    print("\n" + "=" * 60)
    print("示例6: 外部对话历史")
    print("=" * 60)
    
    kb = AudioKnowledgeBase()
    
    history = [
        Message(role='user', content='我想了解压缩器'),
        Message(role='assistant', content='压缩器是一种动态处理工具，用于控制音频信号的动态范围。'),
        Message(role='user', content='它有哪些主要参数？'),
        Message(role='assistant', content='主要参数包括：Threshold、Ratio、Attack、Release和Make-up Gain。')
    ]
    
    answer = kb.generate_answer("那threshold应该怎么设置？", conversation_history=history)
    
    print(f"\n回答: {answer.text}")
    print(f"来源: {answer.sources}")


def example_answer_result_methods():
    """AnswerResult方法示例"""
    print("\n" + "=" * 60)
    print("示例7: AnswerResult使用方法")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    answer = kb.generate_answer("什么是侧链压缩？")
    
    print(f"\n字符串表示:\n{answer}")
    
    print(f"\n字典表示:")
    result_dict = answer.to_dict()
    print(f"  text: {result_dict['text'][:100]}...")
    print(f"  sources: {result_dict['sources']}")
    print(f"  confidence: {result_dict['confidence']:.2%}")


def example_full_pipeline():
    """完整流水线示例"""
    print("\n" + "=" * 60)
    print("示例8: 完整流水线")
    print("=" * 60)
    
    kb = KnowledgeBaseAPI()
    
    print("\n1. 处理文档...")
    kb.process_documents()
    
    print("\n2. 生成QA对...")
    kb.generate_qa_pairs()
    
    print("\n3. 查询知识库...")
    answer = kb.generate_answer("什么是限幅器？")
    print(f"\n回答: {answer.text[:200]}...")


def example_for_openai_function_calling():
    """
    OpenAI Function Calling 集成示例
    展示如何将知识库作为工具函数提供给Agent
    """
    print("\n" + "=" * 60)
    print("示例9: OpenAI Function Calling 集成")
    print("=" * 60)
    
    import json
    
    def knowledge_base_search(query: str, top_k: int = 5) -> str:
        """
        知识库搜索工具函数
        可作为OpenAI Function Calling的工具
        """
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
                    "query": {
                        "type": "string",
                        "description": "用户的查询问题"
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
    
    print("\n工具定义 (Tool Schema):")
    print(json.dumps(tool_schema, ensure_ascii=False, indent=2))
    
    print("\n调用示例:")
    result = knowledge_base_search("如何设置压缩器的attack参数？")
    print(result[:500] + "...")


def example_ocr_scanned_documents():
    """扫描件OCR处理示例"""
    print("\n" + "=" * 60)
    print("示例10: 扫描件OCR处理")
    print("=" * 60)
    
    config = Config()
    config.DOCUMENTS_DIR = "./documents/test"
    config.OCR_ENABLED = True
    config.OCR_ENGINE = "paddleocr"
    
    kb = AudioKnowledgeBase(config)
    
    print("\n强制OCR模式处理文档...")
    kb.process_documents(force=True, force_ocr=True)
    
    print("\n搜索测试:")
    results = kb.search("混音", n_results=2)
    for i, r in enumerate(results, 1):
        print(f"\n结果{i}:")
        print(f"  来源: {r['metadata'].get('filename', '未知')}")
        print(f"  OCR处理: {r['metadata'].get('ocr_used', False)}")
        print(f"  内容: {r['content'][:150]}...")


def main():
    """运行所有示例"""
    print("\n" + "=" * 60)
    print("音频知识库 - Agent调用示例")
    print("=" * 60)
    
    examples = [
        ("基础用法", example_basic_usage),
        ("多轮对话", example_multi_turn_chat),
        ("仅检索QA对", example_retrieve_only),
        ("获取结构化上下文", example_get_context),
        ("自定义配置", example_with_custom_config),
        ("外部对话历史", example_with_conversation_history),
        ("AnswerResult方法", example_answer_result_methods),
        ("完整流水线", example_full_pipeline),
        ("OpenAI Function Calling", example_for_openai_function_calling),
        ("扫描件OCR处理", example_ocr_scanned_documents),
    ]
    
    print("\n可用示例:")
    for i, (name, _) in enumerate(examples, 1):
        print(f"  {i}. {name}")
    
    print("\n提示: 运行前请确保:")
    print("  1. 已设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY 环境变量")
    print("  2. documents 目录中有文档文件")
    print("  3. 已运行过文档处理和QA生成")
    
    try:
        choice = input("\n请选择示例编号 (直接回车运行基础示例): ").strip()
        
        if choice == "":
            example_basic_usage()
        elif choice.isdigit() and 1 <= int(choice) <= len(examples):
            examples[int(choice) - 1][1]()
        else:
            print("无效选择，运行基础示例")
            example_basic_usage()
            
    except Exception as e:
        print(f"\n运行出错: {e}")
        print("请确保知识库已初始化（运行过文档处理和QA生成）")


if __name__ == "__main__":
    main()
