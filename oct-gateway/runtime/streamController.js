class StreamController {
  constructor({ emitter, smootherFactory, pacingMs = 4 }) {
    this.emitter = emitter;
    this.smootherFactory = smootherFactory;
    this.pacingMs = pacingMs;
    this.cancelled = false;
    this.fullReply = '';
    this.smoother = null;
    this.segments = null; // B1: TurnSegmentTracker，按段双发；未挂载时退化为纯旧路径
  }

  // B1: 挂载段追踪器，让平滑后的文本 chunk 同步翻译为 text 段事件。
  attachSegmentTracker(tracker) {
    this.segments = tracker || null;
  }

  createSmoother() {
    this.smoother = this.smootherFactory((chunk) => {
      if (this.cancelled) return;
      this.fullReply += chunk;
      this.emitter.onDelta(chunk);
      if (this.segments) {
        try { this.segments.text(chunk); } catch { /* 段双发失败不影响主流 */ }
      }
    }, this.pacingMs);
    return this.smoother;
  }

  cancel() {
    this.cancelled = true;
  }

  isCancelled() {
    return this.cancelled;
  }

  getFullReply() {
    return this.fullReply;
  }

  // 工具续轮时清空：丢弃上一轮已累积的正文（含 smoother 未输出缓冲），
  // 使最终回复只保留最后一轮内容，对齐专职 Agent 的非累加行为。
  resetReply() {
    this.fullReply = '';
    if (this.smoother && typeof this.smoother.reset === 'function') {
      this.smoother.reset();
    }
  }

  flush() {
    if (this.smoother?.flush) {
      this.smoother.flush();
    }
  }
}

module.exports = StreamController;
