"""
Mem0 Service — OCT 动态记忆服务 (port 8002)

LLM（事实提取）和 Embedder（向量存储）可以分别配置不同的 API，
例如：DeepSeek V3 做 LLM（支持 json_object，无思维内容），
      MiniMax embo-01 做 Embedding（中文向量效果好）。

端点：
  GET  /health  → 健康检查
  POST /add     → 提取事实并存入 Qdrant
  POST /search  → 语义搜索
  GET  /get_all → 调试，返回所有记忆

环境变量：
  MEM0_LLM_API_KEY    LLM 的 API Key（默认读 DEEPSEEK_API_KEY）
  MEM0_LLM_BASE_URL   LLM 的 base URL（默认 DeepSeek）
  MEM0_LLM_MODEL      LLM 模型名（默认 deepseek-chat）
  MEM0_EMBED_API_KEY  Embedder 的 API Key（默认读 MEM0_API_KEY / MINIMAX_API_KEY）
  MEM0_EMBED_BASE_URL Embedder 的 base URL（默认 MiniMax）
  MEM0_EMBED_MODEL    Embedder 模型名（默认 embo-01）
  MEM0_EMBED_DIMS     向量维度（默认 1536）
  MEM0_DATA_DIR       Qdrant 数据目录
  MEM0_PORT           服务端口（默认 8002）
"""

import os
import sys
import logging
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [Mem0] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("mem0_service")

# ── LLM 配置（事实提取，推荐 DeepSeek V3）────────────────────────────────────
MEM0_LLM_API_KEY  = (os.getenv("MEM0_LLM_API_KEY")
                     or os.getenv("DEEPSEEK_API_KEY", ""))
MEM0_LLM_BASE_URL = os.getenv("MEM0_LLM_BASE_URL",
                               "https://api.deepseek.com/v1")
MEM0_LLM_MODEL    = os.getenv("MEM0_LLM_MODEL", "deepseek-chat")

# ── Embedder 配置（向量存储，推荐 MiniMax embo-01）───────────────────────────
MEM0_EMBED_API_KEY  = (os.getenv("MEM0_EMBED_API_KEY")
                       or os.getenv("MEM0_API_KEY")
                       or os.getenv("MINIMAX_API_KEY", ""))
MEM0_EMBED_BASE_URL = os.getenv("MEM0_EMBED_BASE_URL",
                                 "https://api.minimaxi.com/v1")
MEM0_EMBED_MODEL    = os.getenv("MEM0_EMBED_MODEL", "embo-01")
MEM0_EMBED_DIMS     = int(os.getenv("MEM0_EMBED_DIMS", "1536"))

# ── 通用配置 ──────────────────────────────────────────────────────────────────
MEM0_DATA_DIR   = os.getenv("MEM0_DATA_DIR",
                             os.path.join(os.path.dirname(__file__), "mem0_qdrant"))
MEM0_PORT       = int(os.getenv("MEM0_PORT", "8002"))
DEFAULT_USER_ID = os.getenv("MEM0_DEFAULT_USER_ID", "my_user")

# ── Mem0 初始化 ───────────────────────────────────────────────────────────────
mem0_instance   = None
mem0_ready      = False
mem0_init_error = ""

def _build_mem0_config():
    return {
        "llm": {
            "provider": "openai",
            "config": {
                "model":           MEM0_LLM_MODEL,
                "api_key":         MEM0_LLM_API_KEY,
                "openai_base_url": MEM0_LLM_BASE_URL,
                "temperature":     0.1,
                "max_tokens":      2000,
            },
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "model":           MEM0_EMBED_MODEL,
                "api_key":         MEM0_EMBED_API_KEY,
                "openai_base_url": MEM0_EMBED_BASE_URL,
                "embedding_dims":  MEM0_EMBED_DIMS,
            },
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name":      "oct_mem0",
                "embedding_model_dims": MEM0_EMBED_DIMS,
                "on_disk": True,
                "path":    MEM0_DATA_DIR,
            },
        },
        "version": "v1.1",
    }

def _patch_httpx():
    """在 httpx 层记录 LLM 调用（仅调试日志，不再注入）。"""
    try:
        import httpx

        _orig_sync_send = httpx.Client.send

        def _patched_sync_send(self, request, **kwargs):
            response = _orig_sync_send(self, request, **kwargs)
            if "chat/completions" in str(request.url):
                try:
                    log.info("[httpx] LLM response: %r", response.text[:400])
                except Exception:
                    pass
            return response

        httpx.Client.send = _patched_sync_send
        log.info("httpx debug patch 已安装")
    except Exception as e:
        log.warning("httpx patch 安装失败（可忽略）: %s", e)


# ── 中文自定义事实提取 ─────────────────────────────────────────────────────────
import uuid as _uuid
import json as _json_mod


def _is_noise_fact(fact: str) -> bool:
    """
    判断一条事实是否为无价值噪声，是则返回 True（应丢弃）。
    覆盖场景：图片/截图行为、一次性操作、无主语泛化描述等。
    使用 Unicode 转义避免文件编码问题。
    """
    if not fact or len(fact.strip()) < 3:
        return True

    f = fact.strip()

    # ── 图片 / 截图 / 文件行为 ─────────────────────────────────────────────
    # \u56fe\u7247=图片 \u622a\u56fe=截图 \u6587\u4ef6=文件 \u9644\u4ef6=附件
    # \u53d1\u9001=发送 \u5206\u4eab=分享 \u4e0a\u4f20=上传 \u67e5\u770b=查看
    image_noise = [
        "\u56fe\u7247",   # 图片
        "\u622a\u56fe",   # 截图
        "\u56fe\u50cf",   # 图像
        "\u7167\u7247",   # 照片
    ]
    action_noise = [
        "\u53d1\u9001\u4e86",   # 发送了
        "\u5206\u4eab\u4e86",   # 分享了
        "\u4e0a\u4f20\u4e86",   # 上传了
        "\u67e5\u770b\u4e86",   # 查看了
        "\u53d1\u4e86\u4e00\u5f20",   # 发了一张
        "\u53d1\u4e86\u4e00\u4e2a",   # 发了一个
    ]
    for img in image_noise:
        for act in action_noise:
            if img in f and act in f:
                return True
        # 单独含图片词汇 + 动词组合也过滤
        if img in f and (
            "\u53d1\u9001" in f or   # 发送
            "\u5206\u4eab" in f or   # 分享
            "\u4e0a\u4f20" in f or   # 上传
            "\u767d\u8272" in f      # 白色（描述图片内容而非用户属性）
        ):
            return True

    # ── 一次性操作 / 临时任务（无持久价值）────────────────────────────────
    # \u8bf7\u6c42=请求 \u67e5\u8be2=查询 \u8981\u6c42=要求 \u5e0c\u671b=希望
    one_time_patterns = [
        "\u8bf7\u6c42\u4e86",       # 请求了
        "\u8981\u6c42\u4e86",       # 要求了
        "\u67e5\u8be2\u4e86",       # 查询了
        "\u8f93\u5165\u4e86",       # 输入了
        "\u70b9\u51fb\u4e86",       # 点击了
        "\u4f7f\u7528\u4e86",       # 使用了
    ]
    if any(p in f for p in one_time_patterns):
        return True

    # ── 太短或只有标点 ─────────────────────────────────────────────────────
    import re as _re2
    if len(_re2.sub(r'[\s\W]', '', f)) < 4:
        return True

    return False


def _filter_facts(facts: list) -> list:
    """过滤噪声事实，返回有价值的子集，并记录被丢弃的内容。"""
    kept, dropped = [], []
    for f in facts:
        if _is_noise_fact(f):
            dropped.append(f)
        else:
            kept.append(f)
    if dropped:
        log.info("噪声过滤: 丢弃 %d 条 → %s", len(dropped), dropped)
    return kept


def _rule_extract_facts(user_message: str) -> list:
    """
    规则兜底：把用户消息里的第一人称（我）替换成"用户"，按标点拆成多条事实。
    不调用任何 LLM，仅在 mem0 LLM 提取失败时使用。

    示例：
      "我叫小明，我是程序员" → ["用户叫小明", "用户是程序员"]
      "我喜欢简洁的回复风格" → ["用户喜欢简洁的回复风格"]
      "今天天气真好"          → []（没有"我"，不提取）
    """
    import re as _re
    if not user_message or not user_message.strip():
        return []

    # 替换第一人称（用 Unicode 转义，避免文件编码歧义）
    # 我自己→用户自己  我的→用户的  我→用户
    text = user_message
    text = text.replace("\u6211\u81ea\u5df1", "\u7528\u6237\u81ea\u5df1")
    text = text.replace("\u6211\u7684",       "\u7528\u6237\u7684")
    text = text.replace("\u6211",             "\u7528\u6237")

    # 按中英文标点 + 换行分割（Unicode 转义：，。！？；、…）
    parts = _re.split(r'[\uff0c\u3002\uff01\uff1f\uff1b\u3001\u2026,.!?;\n]+', text)

    facts = []
    for p in parts:
        p = p.strip()
        if "\u7528\u6237" in p and len(p) > 3:   # 含"用户"且不太短
            facts.append(p)

    log.info("规则提取: %d 条 → %s", len(facts), facts)
    return facts


def _store_facts_directly(facts: list, uid: str) -> int:
    """
    绕过 mem0 LLM 提取，将已提取的事实直接写入 Qdrant vector store。
    写入前先做语义去重：若库中已有相似度 > 0.85 的事实则跳过，避免重复堆积。
    返回成功写入的条数。
    """
    if not facts or mem0_instance is None:
        return 0
    stored = 0
    try:
        vs = mem0_instance.vector_store
        em = mem0_instance.embedding_model
    except AttributeError as e:
        log.error("无法访问 mem0 内部组件: %s", e)
        return 0

    for fact in facts:
        try:
            # ── 去重检查：搜索语义相近的已有记忆 ─────────────────────────────
            try:
                existing = mem0_instance.search(fact, user_id=uid, limit=1)
                items = existing.get("results", []) if isinstance(existing, dict) else (existing or [])
                if items and float(items[0].get("score", 0)) > 0.85:
                    log.info("规则去重: 跳过 %r (score=%.2f, 已有: %r)",
                             fact, items[0]["score"], items[0].get("memory", ""))
                    continue
            except Exception as dedup_err:
                log.debug("去重检查异常（继续写入）: %s", dedup_err)

            # ── 写入 ──────────────────────────────────────────────────────────
            embedding = em.embed(fact)
            memory_id = str(_uuid.uuid4())
            vs.insert(
                vectors=[embedding],
                payloads=[{
                    "data":       fact,
                    "user_id":    uid,
                    "hash":       str(abs(hash(fact))),
                    "created_at": None,
                    "updated_at": None,
                }],
                ids=[memory_id],
            )
            log.info("直接写入 id=%s: %r", memory_id, fact)
            stored += 1
        except Exception as e:
            log.error("写入事实 %r 失败: %s", fact, e)
    return stored


def _init_mem0():
    global mem0_instance, mem0_ready, mem0_init_error
    if not MEM0_LLM_API_KEY:
        mem0_init_error = "MEM0_LLM_API_KEY 未设置（需要 DeepSeek 或其他支持 json_object 的 LLM Key）"
        log.warning(mem0_init_error)
        return
    if not MEM0_EMBED_API_KEY:
        mem0_init_error = "MEM0_EMBED_API_KEY 未设置（需要 MiniMax 或其他 Embedding API Key）"
        log.warning(mem0_init_error)
        return
    try:
        os.makedirs(MEM0_DATA_DIR, exist_ok=True)

        # ── 在 mem0 导入之前打 httpx 补丁（能拦截 mem0 内部的 LLM 调用）──
        _patch_httpx()

        from mem0 import Memory
        cfg = _build_mem0_config()
        mem0_instance = Memory.from_config(cfg)
        mem0_ready = True
        log.info("Mem0 初始化成功  LLM=%s@%s  Embed=%s@%s  dims=%d  数据目录=%s",
                 MEM0_LLM_MODEL, MEM0_LLM_BASE_URL,
                 MEM0_EMBED_MODEL, MEM0_EMBED_BASE_URL,
                 MEM0_EMBED_DIMS, MEM0_DATA_DIR)
    except Exception as e:
        mem0_init_error = str(e)
        log.error("Mem0 初始化失败: %s", e)

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="OCT Mem0 Service", version="1.2.0")

@app.on_event("startup")
def on_startup():
    _init_mem0()

class AddRequest(BaseModel):
    user_message:    str
    assistant_reply: str
    user_id:         Optional[str] = None

class SearchRequest(BaseModel):
    query:   str
    user_id: Optional[str] = None
    limit:   Optional[int] = 5

class DeleteRequest(BaseModel):
    memory_id: str
    user_id:   Optional[str] = None

class ClearAllRequest(BaseModel):
    user_id: Optional[str] = None

@app.get("/health")
def health():
    return {
        "ok":          mem0_ready,
        "mem0_ready":  mem0_ready,
        "error":       mem0_init_error if not mem0_ready else None,
        "llm_model":   MEM0_LLM_MODEL,
        "embed_model": MEM0_EMBED_MODEL,
        "embed_dims":  MEM0_EMBED_DIMS,
        "data_dir":    MEM0_DATA_DIR,
    }

@app.post("/add")
def add_memory(req: AddRequest):
    if not mem0_ready or mem0_instance is None:
        return JSONResponse(status_code=503,
                            content={"ok": False, "error": mem0_init_error or "Mem0 未就绪"})
    uid = req.user_id or DEFAULT_USER_ID
    messages = [
        {"role": "user",      "content": req.user_message},
        {"role": "assistant", "content": req.assistant_reply},
    ]
    # ── mem0 官方支持的中文自定义提取 prompt ──────────────────────────────────
    # 注：mem0 的 add(prompt=...) 参数会替换默认的英文 system prompt，
    #     解决 mem0 对中文对话提取 0 事实的已知问题。
    _ZH_MEM0_PROMPT = (
        "你是记忆管理助手。从对话中提取用户的持久性个人事实，仅限：姓名、职业、地点、偏好、习惯、目标、技能、家庭等。"
        "所有事实用中文写，主语统一用「用户」。"
        "返回 JSON：{\"facts\": [\"事实1\", \"事实2\"]}。"
        "\n"
        "【必须忽略，不得提取】\n"
        "- 图片、截图、文件、附件的发送或查看行为（如「用户发送了图片」「用户分享了截图」）\n"
        "- 本次对话中的一次性操作、临时任务、即时问题\n"
        "- AI 的回复内容、AI 的行为\n"
        "- 天气、新闻等与用户个人无关的信息\n"
        "\n"
        "示例（正确）：\n"
        "用户说「我叫小明，我是程序员」→ {\"facts\": [\"用户叫小明\", \"用户是程序员\"]}\n"
        "用户说「我喜欢简洁的回复」→ {\"facts\": [\"用户喜欢简洁的回复风格\"]}\n"
        "\n"
        "示例（错误，不得提取）：\n"
        "用户发了一张截图 → {\"facts\": []}（图片行为，忽略）\n"
        "用户说「今天天气不错」→ {\"facts\": []}（无个人信息，忽略）\n"
        "用户说「帮我查一下这个」→ {\"facts\": []}（临时任务，忽略）\n"
        "\n"
        "如果没有符合条件的个人事实，返回 {\"facts\": []}。"
    )

    try:
        # ── 路径1：mem0 内置 LLM 提取（传入中文 prompt，官方支持）────────────
        try:
            result = mem0_instance.add(messages, user_id=uid, prompt=_ZH_MEM0_PROMPT)
        except TypeError:
            # 旧版 mem0 不支持 prompt 参数，回退默认调用
            result = mem0_instance.add(messages, user_id=uid)

        # ── 路径1 噪声过滤：过滤掉 LLM 提取的无效事实 ──────────────────────
        if isinstance(result, dict) and isinstance(result.get("results"), list):
            clean = []
            for item in result["results"]:
                mem_text = item.get("memory", "") or item.get("data", "") or str(item)
                if not _is_noise_fact(mem_text):
                    clean.append(item)
                else:
                    log.info("路径1噪声过滤: 丢弃 %r", mem_text)
            result["results"] = clean
        added = len(result.get("results", [])) if isinstance(result, dict) else 0

        if added == 0:
            # ── 路径2：规则提取（零费用，替换第一人称）+ 噪声过滤 + 直接写入 ──
            log.info("mem0 LLM 提取 0 有效事实，启动规则提取路径...")
            raw_facts = _rule_extract_facts(req.user_message)
            facts = _filter_facts(raw_facts)   # 过滤噪声
            if facts:
                added = _store_facts_directly(facts, uid)
                log.info("规则提取完成: stored=%d", added)
            else:
                log.info("规则提取为空（无有效个人信息）")

        log.info("mem0.add ok user_id=%s facts=%d", uid, added)
        return {"ok": True, "results": result, "facts_added": added}
    except TypeError as e:
        log.error("mem0.add embedding format error: %s", e)
        return JSONResponse(status_code=500,
                            content={"ok": False,
                                     "error": f"Embedding API 响应格式不兼容: {e}",
                                     "hint": "请换用标准 OpenAI 兼容的 Embedding 服务"})
    except Exception as e:
        log.error("mem0.add error: %s", e)
        return JSONResponse(status_code=500,
                            content={"ok": False, "error": str(e)})

@app.post("/search")
def search_memory(req: SearchRequest):
    if not mem0_ready or mem0_instance is None:
        return JSONResponse(status_code=503,
                            content={"ok": False, "results": [], "error": mem0_init_error or "Mem0 未就绪"})
    uid   = req.user_id or DEFAULT_USER_ID
    limit = max(1, min(req.limit or 5, 20))
    try:
        results = mem0_instance.search(req.query, user_id=uid, limit=limit)
        items = results.get("results", []) if isinstance(results, dict) else (results or [])
        log.info("mem0.search ok user_id=%s query=%r hits=%d", uid, req.query[:40], len(items))
        return {"ok": True, "results": items}
    except Exception as e:
        log.error("mem0.search error: %s", e)
        # 没有记忆时 Qdrant 可能抛出 NoneType，按空结果处理
        return {"ok": True, "results": [], "warn": str(e)}

@app.get("/get_all")
def get_all(user_id: Optional[str] = None):
    if not mem0_ready or mem0_instance is None:
        return JSONResponse(status_code=503,
                            content={"ok": False, "results": [], "error": mem0_init_error or "Mem0 未就绪"})
    uid = user_id or DEFAULT_USER_ID
    try:
        result = mem0_instance.get_all(user_id=uid)
        items = result.get("results", []) if isinstance(result, dict) else (result or [])
        return {"ok": True, "count": len(items), "results": items}
    except Exception as e:
        log.error("mem0.get_all error: %s", e)
        return JSONResponse(status_code=500,
                            content={"ok": False, "results": [], "error": str(e)})


@app.post("/delete")
def delete_memory(req: DeleteRequest):
    """
    删除单条记忆（按 memory_id）。
    双路径兜底：
      路径1：mem0 官方 delete()，适用于 LLM 提取路径写入的记忆
      路径2：直接 Qdrant delete，适用于规则兜底路径写入的记忆
    """
    if not mem0_ready or mem0_instance is None:
        return JSONResponse(status_code=503,
                            content={"ok": False, "error": mem0_init_error or "Mem0 未就绪"})
    mid = req.memory_id
    try:
        # 路径1：mem0 官方 API
        try:
            mem0_instance.delete(memory_id=mid)
            log.info("mem0.delete (official) ok memory_id=%s", mid)
            return {"ok": True, "memory_id": mid}
        except Exception as e1:
            log.warning("mem0.delete official failed (%s)，尝试直接 Qdrant 删除", e1)

        # 路径2：直接操作 Qdrant vector_store（规则兜底路径写入的记忆）
        vs = mem0_instance.vector_store
        vs.delete(vector_id=mid)
        log.info("mem0.delete (qdrant direct) ok memory_id=%s", mid)
        return {"ok": True, "memory_id": mid}

    except Exception as e:
        log.error("mem0.delete error: %s", e)
        return JSONResponse(status_code=500,
                            content={"ok": False, "error": str(e)})


@app.post("/clear_all")
def clear_all_memories(req: ClearAllRequest):
    """
    清空指定用户的全部记忆。
    双路径：先用 mem0 官方 delete_all，再用 Qdrant 按 user_id 过滤删除兜底。
    """
    if not mem0_ready or mem0_instance is None:
        return JSONResponse(status_code=503,
                            content={"ok": False, "error": mem0_init_error or "Mem0 未就绪"})
    uid = req.user_id or DEFAULT_USER_ID
    deleted = 0
    errors = []

    # 路径1：mem0 官方 delete_all
    try:
        mem0_instance.delete_all(user_id=uid)
        log.info("mem0.delete_all (official) ok user_id=%s", uid)
    except Exception as e1:
        log.warning("mem0.delete_all official failed (%s)，尝试直接 Qdrant 清空", e1)
        errors.append(str(e1))

    # 路径2：直接 Qdrant —— 搜出该用户所有向量后批量删除
    try:
        vs = mem0_instance.vector_store
        all_result = mem0_instance.get_all(user_id=uid)
        items = all_result.get("results", []) if isinstance(all_result, dict) else (all_result or [])
        for item in items:
            mid = item.get("id") or item.get("memory_id")
            if mid:
                try:
                    vs.delete(vector_id=mid)
                    deleted += 1
                except Exception:
                    pass
        if deleted:
            log.info("mem0.clear_all (qdrant direct) deleted=%d user_id=%s", deleted, uid)
    except Exception as e2:
        log.warning("mem0.clear_all qdrant fallback error: %s", e2)
        errors.append(str(e2))

    return {"ok": True, "user_id": uid, "deleted": deleted, "warnings": errors or None}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=MEM0_PORT, log_level="info")
