'use strict';

// ═══════════════════════════════════════════════════════════════
// MiniMax <redacted_thinking> 标签流式解析器
// ───────────────────────────────────────────────────────────────
// 适配 MiniMax M2.7 的"交织式思考"：模型在一次回复里多次交替输出
// <redacted_thinking>思考</redacted_thinking>正文<redacted_thinking>继续思考</redacted_thinking>继续正文
//
// 策略：
//   1. 第一个 <redacted_thinking> 出现时开启 [cot]，保持 CoT 块持续开放
//   2. 多个 <redacted_thinking> 块的内容都流入同一个 CoT，用分隔线隔开
//   3. 思考块之间的正文内容暂存到 contentBuffer，不立即输出
//   4. 流结束时（flush）：发出 [/cot] → 释放 contentBuffer 给前端渲染
//
// 结果：用户看到思考流式展开 → 思考折叠 → 干净的答案出现
// 其他模型（thinkingFormat 不是 'think_tags'）完全不受影响
//
// 本解析器从 ai.js 的 streamChatRaw 中抽离，行为与原内联实现完全一致。
// 解析器不持有 fullText / assistantResponseContent，而是通过回调写回调用方：
//   - emit(text)        : 等价于原 `fullText += text; onDelta(text)`
//   - onRawContent(text): 等价于原 `assistantResponseContent += text`
// ═══════════════════════════════════════════════════════════════

// 支持两种标签格式：MiniMax 可能输出 <redacted_thinking> 或标准格式 <think>
const OPEN_REDACTED = '<redacted_thinking>';
const CLOSE_REDACTED = '</redacted_thinking>';
const OPEN_COT = '<think>';
const CLOSE_COT = '</think>';
const OPEN_THINK = OPEN_REDACTED;
const CLOSE_THINK = CLOSE_REDACTED;

/**
 * 规范化标签：将标准 <think> 转换为内部标签格式
 * @param {string} s - 输入字符串
 * @returns {{ normalized: string, hadCotOpen: boolean, hadCotClose: boolean }}
 */
function normalizeThinkTags(s) {
  let hadCotOpen = false;
  let hadCotClose = false;
  let normalized = s;

  // 先检查标准 <think> 标签
  if (normalized.includes(OPEN_COT)) hadCotOpen = true;
  if (normalized.includes(CLOSE_COT)) hadCotClose = true;

  // 将标准 <think> 标签转换为 <redacted_thinking> 格式
  // 避免重复替换（如果已经有 <redacted_thinking> 就不替换）
  if (hadCotOpen && !normalized.includes(OPEN_REDACTED)) {
    normalized = normalized.split(OPEN_COT).join(OPEN_REDACTED);
  }
  if (hadCotClose && !normalized.includes(CLOSE_REDACTED)) {
    normalized = normalized.split(CLOSE_COT).join(CLOSE_REDACTED);
  }

  return { normalized, hadCotOpen, hadCotClose };
}

/** 返回 s 末尾与 tag 前缀重叠的最长子串（处理跨 chunk 的残缺标签） */
function findPartialTag(s, tag) {
  for (let len = Math.min(s.length, tag.length - 1); len > 0; len--) {
    if (tag.startsWith(s.slice(-len))) return s.slice(-len);
  }
  return '';
}

/** 过滤掉 AI 误输出到 content 中的工具调用标记 */
function stripToolCallMarkers(s) {
  return s.replace(/\[TOOL_CALLS?\]/gi, '');
}

/**
 * 创建一个思考标签流式解析器。
 *
 * @param {object} opts
 * @param {boolean} opts.thinkTagMode  初始是否启用标签解析（caps.thinkingFormat === 'think_tags'）
 * @param {(text: string) => void} opts.emit          输出可见内容（原 fullText += / onDelta）
 * @param {(text: string) => void} opts.onRawContent  记录原始 content（原 assistantResponseContent +=）
 * @param {{ warn: Function }} [opts.logger]
 */
function createThinkTagStreamParser({ thinkTagMode = false, emit, onRawContent, logger } = {}) {
  if (typeof emit !== 'function') throw new TypeError('createThinkTagStreamParser: emit is required');
  const onRaw = typeof onRawContent === 'function' ? onRawContent : () => {};
  const warn = logger && typeof logger.warn === 'function' ? (...a) => logger.warn(...a) : () => {};

  let _thinkTagMode = !!thinkTagMode;
  const _thinkState = {
    inThink: false,
    cotOpen: false,
    contentBuffer: '',
    pendingTag: '',
    thinkCount: 0,
  };

  /** 处理一个 content chunk，区分思考内容和正文内容 */
  function processChunk(raw) {
    // 先过滤掉 [TOOL_CALL] / [TOOL_CALLS] 等误输出的标记
    const cleaned = stripToolCallMarkers(raw);
    if (!cleaned) return;
    onRaw(cleaned);

    // 标准化思考标签：将标准 <think> 转换为 <redacted_thinking> 格式
    const { normalized, hadCotOpen, hadCotClose } = normalizeThinkTags(cleaned);

    // 如果检测到标准 <think> 标签但 _thinkTagMode 未启用，
    // 说明模型配置缺少 thinkingFormat，强制启用标签处理
    if (!_thinkTagMode && (hadCotOpen || hadCotClose)) {
      warn('检测到 <think> 标签但 thinkingFormat 未配置，强制启用标签处理');
      _thinkTagMode = true;
    }

    if (!_thinkTagMode) {
      emit(cleaned);
      return;
    }

    let s = _thinkState.pendingTag + normalized;
    _thinkState.pendingTag = '';

    while (s.length > 0) {
      if (!_thinkState.inThink) {
        const idx = s.indexOf(OPEN_THINK);
        if (idx === -1) {
          const tail = findPartialTag(s, OPEN_THINK);
          const out = s.slice(0, s.length - tail.length);
          if (out) {
            if (_thinkState.cotOpen) {
              _thinkState.contentBuffer += out;
            } else {
              emit(out);
            }
          }
          _thinkState.pendingTag = tail;
          s = '';
        } else {
          const before = s.slice(0, idx);
          if (before) {
            if (_thinkState.cotOpen) {
              _thinkState.contentBuffer += before;
            } else {
              emit(before);
            }
          }

          if (!_thinkState.cotOpen) {
            emit('[cot]');
            _thinkState.cotOpen = true;
          } else {
            // 已经在 CoT 块中：先发送分隔符，再继续新的 thinking 内容
            emit('\n\n---\n\n');
          }

          _thinkState.thinkCount++;
          _thinkState.inThink = true;
          s = s.slice(idx + OPEN_THINK.length);
        }
      } else {
        const idx = s.indexOf(CLOSE_THINK);
        if (idx === -1) {
          const tail = findPartialTag(s, CLOSE_THINK);
          const out = s.slice(0, s.length - tail.length);
          if (out) emit(out);
          _thinkState.pendingTag = tail;
          s = '';
        } else {
          const thinkContent = s.slice(0, idx);
          if (thinkContent) emit(thinkContent);
          _thinkState.inThink = false;
          s = s.slice(idx + CLOSE_THINK.length);
        }
      }
    }
  }

  /**
   * 流结束时调用：关闭 CoT 块，释放暂存的正文内容。
   * 必须在 onDone() 之前调用。
   */
  function flush() {
    if (_thinkState.pendingTag) {
      if (_thinkState.cotOpen) {
        _thinkState.contentBuffer += _thinkState.pendingTag;
      } else {
        emit(_thinkState.pendingTag);
      }
      _thinkState.pendingTag = '';
    }

    if (_thinkState.cotOpen) {
      emit('[/cot]');
      // 重置所有状态，避免重复发送 [/cot]
      _thinkState.cotOpen = false;
      _thinkState.inThink = false;

      if (_thinkState.contentBuffer) {
        emit(_thinkState.contentBuffer);
        _thinkState.contentBuffer = '';
      }
    }
  }

  function isThinkTagMode() {
    return _thinkTagMode;
  }

  return { processChunk, flush, isThinkTagMode };
}

module.exports = {
  createThinkTagStreamParser,
  // 导出纯函数便于单测
  normalizeThinkTags,
  findPartialTag,
  stripToolCallMarkers,
};
