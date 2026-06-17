class StreamController {
  constructor({ emitter, smootherFactory, pacingMs = 4 }) {
    this.emitter = emitter;
    this.smootherFactory = smootherFactory;
    this.pacingMs = pacingMs;
    this.cancelled = false;
    this.fullReply = '';
    this.smoother = null;
    this.segments = null; // TurnSegmentTracker maps internal text chunks to outward segment events.
  }

  // Attach a segment tracker so smoothed text chunks become text segment events.
  attachSegmentTracker(tracker) {
    this.segments = tracker || null;
  }

  createSmoother() {
    this.smoother = this.smootherFactory((chunk) => {
      if (this.cancelled) return;
      this.fullReply += chunk;
      this.emitter.onDelta(chunk);
      if (this.segments) {
        try { this.segments.text(chunk); } catch { /* segment emission must not break the stream */ }
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
