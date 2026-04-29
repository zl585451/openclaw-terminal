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

text3 = (
    "目录\n"
    "第一章 开端\n"
    "第二章 夜\n"
    "第三章 回响\n\n"
    "第一章 开端\n"
    "这里是第一章正文，至少有一整段像样内容，不应该把前面的目录当正文切进去。\n\n"
    "第二章 夜\n"
    "这里是第二章正文。\n"
)
result3 = split_into_chapters(text3, "test-book")
assert len(result3) == 2, result3
assert result3[0]["title"] == "第一章 开端", result3[0]
assert int(result3[0]["start_char"]) > 0, result3[0]

text4 = (
    "第1章 第1章 风起\n"
    "这是第一章的正文。\n\n"
    "第2章 只有标题\n\n------\n\n"
    "第3章 落点\n"
    "这是第三章的正文。\n"
)
result4 = split_into_chapters(text4, "test-book")
assert len(result4) == 2, result4
assert result4[0]["title"] == "第1章 风起", result4[0]
assert result4[1]["title"] == "第3章 落点", result4[1]

print("PASS")
