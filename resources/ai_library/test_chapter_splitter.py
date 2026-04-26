#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""章节切分离线自测：python test_chapter_splitter.py"""
from chapter_splitter import split_into_chapters

text1 = "第一章 樟木箱\n内容一\n\n第二章 夜\n内容二"
result1 = split_into_chapters(text1, "test-book")
assert len(result1) == 2, result1
assert str(result1[0]["title"]).startswith("第一章"), result1[0]

text2 = "全是普通文字,没有章节标记"
result2 = split_into_chapters(text2, "test-book")
assert len(result2) == 1, result2
assert result2[0]["title"] == "全文", result2[0]

print("PASS")
