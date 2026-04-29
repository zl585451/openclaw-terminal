#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import shutil

src = r'E:\AI.library\audio_knowledge_base.py'
dst = r'E:\AI.library\audio_knowledge_base_backup.py'

# 备份
print("Backing up...")
shutil.copy(src, dst)
print("Backup done:", dst)

# 读取
with open(src, 'rb') as f:
    raw = f.read()

# 移除 BOM
if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]
    print("BOM removed")

# 尝试解码
content = None
for enc in ['utf-8', 'latin-1', 'cp1252']:
    try:
        content = raw.decode(enc)
        print(f"OK: {enc}")
        break
    except Exception as e:
        print(f"Fail: {enc}")

if not content:
    print("All failed!")
    exit(1)

# 检查关键内容
print("Checking methods...")
for m in ['def search', 'class KnowledgeBaseAPI', 'class Config']:
    if m in content:
        print(f"  Found: {m}")
    else:
        print(f"  Missing: {m}")

# 保存
with open(src, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed!")

# 验证
print("Verifying...")
with open(src, 'r', encoding='utf-8') as f:
    code = f.read()
compile(code, src, 'exec')
print("Syntax OK!")
