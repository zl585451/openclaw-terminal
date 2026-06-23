#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
音频知识库系统 - 完整测试脚本
测试所有核心功能
"""

import os
import sys

os.environ['DEEPSEEK_API_KEY'] = os.getenv('DEEPSEEK_API_KEY', 'test-deepseek-api-key')
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

from audio_knowledge_base import (
    KnowledgeBaseAPI, 
    AudioKnowledgeBase, 
    Config
)

def test_1_init():
    print('\n' + '='*60)
    print('测试1: 知识库初始化')
    print('='*60)
    
    kb = KnowledgeBaseAPI()
    print('✅ 知识库初始化成功')
    print(f'   文档向量库: {kb._kb.vector_store.collection.count()} 个文档块')
    print(f'   QA向量库: {kb._kb.qa_vector_store.collection.count() if hasattr(kb._kb, "qa_vector_store") else 0} 个QA对')
    return kb

def test_2_search(kb):
    print('\n' + '='*60)
    print('测试2: 文档搜索')
    print('='*60)
    
    results = kb.retrieve('广播剧的声音特点', top_k=3)
    print(f'✅ 搜索成功，找到 {len(results)} 个结果')
    
    for i, r in enumerate(results, 1):
        print(f'\n   结果{i}:')
        print(f'   问题: {r.question[:50]}...')
        print(f'   答案: {r.answer[:80]}...')
        print(f'   来源: {r.source}')
        print(f'   置信度: {r.confidence:.2%}')

def test_3_qa(kb):
    print('\n' + '='*60)
    print('测试3: 智能问答')
    print('='*60)
    
    questions = [
        '什么是混响？',
        '广播剧有哪些声音元素？',
        'EQ均衡器怎么使用？'
    ]
    
    for q in questions:
        answer = kb.generate_answer(q)
        print(f'\n   问题: {q}')
        print(f'   回答: {answer.text[:150]}...')
        print(f'   来源: {answer.sources[:2]}')
        print(f'   置信度: {answer.confidence:.2%}')

def test_4_chat(kb):
    print('\n' + '='*60)
    print('测试4: 多轮对话')
    print('='*60)
    
    kb.clear_history()
    
    answer1 = kb.chat('什么是混响？')
    print(f'\n   Q1: 什么是混响？')
    print(f'   A1: {answer1.text[:100]}...')
    
    answer2 = kb.chat('那预延迟参数怎么设置？')
    print(f'\n   Q2: 那预延迟参数怎么设置？')
    print(f'   A2: {answer2.text[:100]}...')
    
    answer3 = kb.chat('混响时间呢？')
    print(f'\n   Q3: 混响时间呢？')
    print(f'   A3: {answer3.text[:100]}...')
    
    print(f'\n   ✅ 对话历史: {len(kb._conversation_history)} 条消息')

def test_5_context(kb):
    print('\n' + '='*60)
    print('测试5: 获取结构化上下文')
    print('='*60)
    
    context = kb.get_context('广播剧创作', top_k=3)
    print(f'✅ 获取上下文成功')
    print(f'   查询: {context["query"]}')
    print(f'   平均置信度: {context["avg_confidence"]:.2%}')
    print(f'   来源文档: {context["sources"]}')

def test_6_stats():
    print('\n' + '='*60)
    print('测试6: 系统状态检查')
    print('='*60)
    
    config = Config()
    print(f'   文档目录: {config.DOCUMENTS_DIR}')
    print(f'   向量数据库: {config.CHROMA_DB_PATH}')
    print(f'   分块大小: {config.CHUNK_SIZE} 字符')
    print(f'   重叠大小: {config.CHUNK_OVERLAP} 字符')
    print(f'   OCR模式: {config.OCR_MODE}')
    print(f'   OCR质量阈值: {config.OCR_QUALITY_THRESHOLD:.0%}')
    print(f'   LLM类型: {config.LLM_TYPE}')
    print(f'   Embedding类型: {config.EMBEDDING_TYPE}')

def main():
    print('\n' + '='*60)
    print('音频知识库系统 - 完整功能测试')
    print('='*60)
    
    try:
        kb = test_1_init()
        test_2_search(kb)
        test_3_qa(kb)
        test_4_chat(kb)
        test_5_context(kb)
        test_6_stats()
        
        print('\n' + '='*60)
        print('✅ 所有测试通过！')
        print('='*60)
        
        print('\n📋 测试总结:')
        print('   ✅ 知识库初始化')
        print('   ✅ 文档搜索')
        print('   ✅ 智能问答')
        print('   ✅ 多轮对话')
        print('   ✅ 结构化上下文')
        print('   ✅ 系统状态检查')
        
        print('\n💡 提示:')
        print('   - QA对数为0，可以运行以下命令生成:')
        print('     python audio_knowledge_base.py --generate-qa')
        print('   - OCR功能需要安装Poppler:')
        print('     参考 OCR_INSTALL_GUIDE.md')
        
    except Exception as e:
        print(f'\n❌ 测试失败: {e}')
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
