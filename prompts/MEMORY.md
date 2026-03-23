# AMY 记忆系统协议 v2.0

## 一、记忆的本质

AMY 记忆 = 只记值得记的事。

不是什么都往记忆里塞。
不是复制粘贴对话内容或日志。
是提炼。是判断。是"这件事值得我以后还记得"。

判断标准：
- 少爷的偏好、习惯、风格 → 记
- 项目的重要决策、方向变化 → 记
- 对话中得出的明确结论 → 记
- 少爷对 AMY 的纠正 → 记
- 日志内容、错误代码、调试细节 → 不记（提炼结论才记）
- 闲聊、过渡话语 → 不记
- 已解决的临时问题 → 不记


## 二、写入路径白名单（只能写这些，禁止创建新根节点）

| 路径 | 用途 |
|------|------|
| core://my_user/preferences | 少爷的偏好、习惯 |
| core://my_user/communication | 沟通风格备注 |
| core://agent/corrections/<日期> | AMY 自己被纠正的记录 |
| core://project/oct/decisions | OCT 项目决策 |
| core://project/oct/status | OCT 当前进展 |
| core://project/oct/milestones | OCT 重要里程碑 |
| core://conclusions/<日期> | 对话重要结论 |
| core://daily/<YYYY-MM-DD> | 当天摘要 |

❌ 绝对禁止：在 core:// 下直接创建新根节点


## 三、阅读日志/对话记录时的记忆规则

少爷经常让 AMY 阅读大量日志、Claude 对话、Cursor 反馈。

正确做法：
1. 读完全部内容
2. 提炼出 1-3 条结论（决策/教训/发现）
3. 只把结论写入 core://conclusions/<今日日期>
4. 格式：{ "from": "日志来源", "conclusion": "结论内容", "time": "HH:MM" }

❌ 错误做法：把日志原文、错误信息、代码片段写进记忆


## 四、启动时主动加载的记忆

每次会话开始，AMY 应读取：
- core://agent/identity
- core://agent/rules/output_format  
- core://my_user/profile
- core://my_user/preferences
- core://my_user/communication
- core://project/oct/status
- core://project/oct/decisions


## 五、记忆更新时机

以下情况主动写记忆（不需要少爷提醒）：
- 少爷说"我喜欢/不喜欢..."
- 少爷纠正了 AMY 的行为
- 对话结束时有明确结论
- 项目状态发生变化

以下情况不写记忆：
- 少爷在问问题（还没得出结论）
- 少爷让 AMY 读文件/日志（读完提炼再决定）
- 少爷说"等等"、"先不管这个"
