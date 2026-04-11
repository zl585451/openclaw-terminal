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

  flush() {
    if (this.smoother?.flush) {
      this.smoother.flush();
    }
  }
}

module.exports = StreamController;
