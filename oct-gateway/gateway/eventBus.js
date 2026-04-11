const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  emitToolEvent(event) {
    this.emit('tool', event);
  }

  emitPhaseChange(phase, meta = {}) {
    this.emit('phase', { phase, ...meta });
  }

  emitCanvasEvent(action, payload = {}) {
    this.emit('canvas', { action, payload });
  }

  emitChatDelta(delta) {
    this.emit('chat:delta', delta);
  }

  emitChatDone(result) {
    this.emit('chat:done', result);
  }
}

module.exports = EventBus;
