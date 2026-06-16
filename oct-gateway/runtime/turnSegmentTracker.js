'use strict';

/**
 * TurnSegmentTracker —— 把"扁平流的信号"翻译成"带 segId/type 的内容段事件"。
 *
 * 见 docs/refactors/chat-streaming-block-protocol-plan.md（B1）。
 *
 * 设计：不改 ai.js 深处，而是在 chatEngine/StreamController 层观察已有信号
 *   - 文本 chunk      → text 段（连续 chunk 累积到同一 text 段）
 *   - tool_call 事件  → 闭当前段，开 tool_use 段
 *   - tool_result 事件→ 闭 tool_use 段
 *   - onDone          → 闭当前段，发 finish（带显式 stopReason）
 *
 * 段事件通过构造时传入的 emit(seg) 流出（最终由 chatRequestHandler 发到前端）。
 * 每段 segId = `${turnId}:s${index}`，对齐 Claude content_block 的 index 寻址。
 *
 * B1 阶段：与旧的裸 delta 双发；前端先忽略段事件（影子）。跨段永不拼接，
 * 故工具调用前正文段与最终答案段天然分离，结构上消除跨轮重复。
 */
class TurnSegmentTracker {
  constructor({ turnId, emit } = {}) {
    this.turnId = turnId || 'turn';
    this.emit = typeof emit === 'function' ? emit : () => {};
    this.index = -1;
    this.openType = null;
    this.openSegId = null;
  }

  _newSegId() {
    this.index += 1;
    return `${this.turnId}:s${this.index}`;
  }

  _open(type, meta) {
    this.openSegId = this._newSegId();
    this.openType = type;
    this.emit({
      op: 'open',
      segId: this.openSegId,
      index: this.index,
      type,
      ...(meta ? { meta } : {}),
    });
    return this.openSegId;
  }

  /** 闭合当前开着的段（若有）。 */
  closeCurrent() {
    if (this.openSegId) {
      this.emit({ op: 'close', segId: this.openSegId });
      this.openSegId = null;
      this.openType = null;
    }
  }

  /** 文本增量：连续文本累积到同一 text 段；若当前段非 text 则先开新 text 段。 */
  text(chunk) {
    if (!chunk) return;
    if (this.openType !== 'text') {
      this.closeCurrent();
      this._open('text');
    }
    this.emit({ op: 'delta', segId: this.openSegId, text: chunk });
  }

  /** 工具开始：闭当前段，开一个 tool_use 段（工具卡片在前端按段定位）。 */
  toolOpen(tool, callId) {
    this.closeCurrent();
    this._open('tool_use', { tool: tool || null, callId: callId || null });
  }

  /** 工具结束：闭合 tool_use 段（结果细节仍走既有 tool 事件）。 */
  toolResult() {
    if (this.openType === 'tool_use') {
      this.closeCurrent();
    }
  }

  /** 回合终止：闭当前段，发 finish（stopReason 显式枚举）。 */
  finish(stopReason) {
    this.closeCurrent();
    this.emit({ op: 'finish', stopReason: stopReason || 'end_turn' });
  }
}

module.exports = { TurnSegmentTracker };
