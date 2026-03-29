/**
 * StreamBuffer — token 批处理器
 * 将高频 token 事件合并为约 50ms/次的批量更新（~20fps），
 * 减少 React setState 调用频率，避免每 token 触发一次重渲染。
 */
class StreamBuffer {
  private buffer = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onFlush: (content: string) => void;

  constructor(onFlush: (content: string) => void) {
    this.onFlush = onFlush;
  }

  append(token: string) {
    this.buffer += token;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, 50); // ~20fps
    }
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer) {
      this.onFlush(this.buffer);
      this.buffer = '';
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = '';
  }
}

export default StreamBuffer;
