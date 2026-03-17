import httpx
import asyncio

BASE = "http://127.0.0.1:8000"

memories = [
    {
        "domain": "core",
        "path": "agent/work_mode",
        "content": """少爷的工作团队分工：
AMY（行政助理）：日常对话、信息整理、记忆管理、任务分发、提示词优化。处理80%的日常问题。
Cursor（执行总监）：所有代码编写、文件修改、项目实现。AMY生成提示词，少爷交给Cursor执行。
Claude（技术顾问/总策划）：复杂架构决策、技术路线规划、高级问题咨询。费用较高，只在必要时使用。

判断标准：
- 日常问题、信息查询、文档整理 → AMY直接解决
- 代码编写、文件修改 → AMY生成Cursor提示词
- 架构设计、技术选型、复杂bug → 提醒少爷咨询Claude
- 需要咨询Claude时，AMY先帮少爷整理问题、优化提示词、提炼关键信息，减少token消耗""",
        "priority": 0,
        "disclosure": "工作模式 分工 角色 顾问 Claude Cursor"
    },
    {
        "domain": "core",
        "path": "agent/claude_routing",
        "content": """当少爷需要咨询Claude时，AMY的工作流程：
1. 先理解少爷的问题
2. 整理成结构化提示词（背景+问题+已尝试方案+期望结果）
3. 精简掉不必要细节，控制在500字以内
4. 告知少爷：是否需要附图、哪些截图最关键
5. 输出可以直接复制给Claude的提示词

输出格式：
【背景】OCT项目，[简短背景]
【问题】[核心问题一句话]
【已知】[已尝试的方案]
【期望】[想要的结果]
【文件】[如需附上的关键代码片段]""",
        "priority": 1,
        "disclosure": "咨询Claude 问题整理 提示词优化 token节省"
    }
]

async def write_memory(client, domain, path, content, priority, disclosure):
    """
    创建节点：先 POST 创建父节点，再 POST 创建目标节点。
    若目标已存在则 PUT 更新。
    """
    parts = path.split("/")

    # 逐级建父节点（POST 创建，Nocturne 只有 POST 能新建）
    for i in range(1, len(parts)):
        parent = "/".join(parts[:i])
        parent_name = parts[i - 1]
        r = await client.post(
            f"{BASE}/browse/node",
            params={"path": parent, "domain": domain},
            json={
                "content": f"{parent_name} 节点",
                "priority": 2,
                "disclosure": ""
            }
        )
        print(f"  父节点 {domain}://{parent}: HTTP {r.status_code}")
        if r.status_code not in (200, 201) and "already exists" not in r.text.lower():
            print(f"    响应: {r.text[:200]}")

    # 目标节点：先 POST 创建
    resp = await client.post(
        f"{BASE}/browse/node",
        params={"path": path, "domain": domain},
        json={
            "content": content,
            "priority": priority,
            "disclosure": disclosure
        }
    )
    if resp.status_code == 422 and "already exists" in resp.text.lower():
        resp = await client.put(
            f"{BASE}/browse/node",
            params={"path": path, "domain": domain},
            json={
                "content": content,
                "priority": priority,
                "disclosure": disclosure
            }
        )
    print(f"  目标节点 {domain}://{path}: HTTP {resp.status_code}")
    if resp.status_code not in (200, 201):
        print(f"  响应: {resp.text[:200]}")
    return resp.status_code, path

async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        # 检查 Nocturne 是否在线
        try:
            r = await client.get(f"{BASE}/health")
            print(f"Nocturne: {'OK' if r.status_code == 200 else 'bad'}")
        except Exception as e:
            print("[X] Nocturne offline:", e)
            return

        for m in memories:
            code, _ = await write_memory(
                client,
                m["domain"], m["path"],
                m["content"], m["priority"], m["disclosure"]
            )
            status = "[OK]" if code in (200, 201) else f"[FAIL] {code}"
            print(f"{status} core://{m['path']}")

        print("\nDone. Restart OCT to load new memory.")

asyncio.run(main())
