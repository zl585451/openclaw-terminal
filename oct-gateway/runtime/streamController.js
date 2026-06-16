class StreamController {
  constructor({ emitter, smootherFactory, pacingMs = 4 }) {
    this.emitter = emitter;
    this.smootherFactory = smootherFactory;
    this.pacingMs = pacingMs;
    this.cancelled = false;
    this.fullReply = '';
    this.smoother = null;
  }

  createSmoother() {
    this.smoother = this.smootherFactory((chunk) => {
      if (this.cancelled) return;
      this.fullReply += chunk;
      this.emitter.onDelta(chunk);
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
