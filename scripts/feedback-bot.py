#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCT 用户反馈自动收集机器人
监听飞书群消息，自动收集用户反馈并保存到 GitHub Issues
"""

import requests
import json
import re
from datetime import datetime
from flask import Flask, request

app = Flask(__name__)

# 配置
GITHUB_TOKEN = "ghp_xxx"  # 替换为你的 GitHub Token
GITHUB_REPO = "zl585451/openclaw-terminal"
FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"  # 替换为你的 Webhook

# 反馈关键词
FEEDBACK_KEYWORDS = [
    "bug", "问题", "错误", "报错", "崩溃",
    "建议", "希望", "想要", "功能",
    "好用", "喜欢", "不错", "赞",
    "难用", "不好", "卡顿", "慢"
]

# 正面/负面情感词
POSITIVE_WORDS = ["好用", "喜欢", "不错", "赞", "棒", "优秀", "完美"]
NEGATIVE_WORDS = ["bug", "问题", "错误", "报错", "崩溃", "难用", "不好", "卡顿", "慢"]


def analyze_sentiment(text):
    """分析情感倾向"""
    positive_count = sum(1 for word in POSITIVE_WORDS if word in text)
    negative_count = sum(1 for word in NEGATIVE_WORDS if word in text)
    
    if positive_count > negative_count:
        return "positive"
    elif negative_count > positive_count:
        return "negative"
    else:
        return "neutral"


def create_github_issue(title, content, labels=None):
    """创建 GitHub Issue"""
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    data = {
        "title": title,
        "body": content,
        "labels": labels or ["feedback"]
    }
    
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 201:
        return response.json()["html_url"]
    else:
        print(f"创建 Issue 失败：{response.text}")
        return None


def send_feishu_notification(message):
    """发送飞书通知"""
    headers = {"Content-Type": "application/json"}
    data = {
        "msg_type": "text",
        "content": {
            "text": message
        }
    }
    
    requests.post(FEISHU_WEBHOOK, headers=headers, json=data)


def is_feedback_message(text):
    """判断是否是反馈消息"""
    return any(keyword in text for keyword in FEEDBACK_KEYWORDS)


def extract_user_info(message_data):
    """提取用户信息"""
    return {
        "user_id": message_data.get("sender_id", "unknown"),
        "user_name": message_data.get("sender_name", "匿名用户"),
        "timestamp": message_data.get("timestamp", datetime.now().isoformat())
    }


@app.route('/webhook', methods=['POST'])
def webhook():
    """接收飞书消息"""
    data = request.json
    
    # 解析消息
    message_text = data.get("text", "")
    user_info = extract_user_info(data)
    
    # 判断是否是反馈
    if is_feedback_message(message_text):
        # 分析情感
        sentiment = analyze_sentiment(message_text)
        
        # 创建 Issue
        title = f"[{sentiment.upper()}] 用户反馈：{message_text[:50]}"
        content = f"""
## 反馈内容

{message_text}

## 用户信息

- 用户：{user_info['user_name']}
- 时间：{user_info['timestamp']}
- 情感：{sentiment}

## 自动分类

- 类型：用户反馈
- 优先级：待评估
"""
        
        issue_url = create_github_issue(title, content)
        
        if issue_url:
            # 发送通知
            notification = f"✅ 已收集用户反馈并创建 Issue：{issue_url}"
            send_feishu_notification(notification)
    
    return "OK", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
