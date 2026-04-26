#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DeepSeek API Key 测试脚本
"""

import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

api_key = os.getenv("DEEPSEEK_API_KEY")

print("=" * 50)
print("DeepSeek API Key 测试")
print("=" * 50)
print(f"\n从 .env 读取的 API Key: {api_key[:15]}...{api_key[-5:] if len(api_key) > 20 else '太短'}")
print(f"API Key 长度：{len(api_key)}")
print(f"API Key 前后是否有空格：{api_key != api_key.strip()}")

# 清理空格
api_key = api_key.strip()

if not api_key or not api_key.startswith("sk-"):
    print("\n❌ API Key 格式错误！应该是 sk- 开头")
    exit(1)

print("\n正在测试 API 调用...")

try:
    from openai import OpenAI
    
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com/v1"
    )
    
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "user", "content": "hi"}
        ],
        max_tokens=10
    )
    
    print("\n✅ API 调用成功！")
    print(f"返回内容：{response.choices[0].message.content}")
    
except Exception as e:
    print(f"\n❌ API 调用失败：{e}")
    print("\n可能的原因：")
    print("1. API Key 无效或过期 → 去 DeepSeek 平台重新生成")
    print("2. 账户余额不足 → 检查账户余额")
    print("3. 网络问题 → 检查网络连接")
