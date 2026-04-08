/**
 * 按目标打字速度（pacingMs/字符）均匀释放流式内容的 smoother。
 * 使用 grapheme 粒度接近逐字显示，避免按词切块导致的“蹦字感”。
 */
function createStreamSmoother(onChunk, pacingMs = 4) {
  const buffer = [];
  let timer = null;
  let isEnding = false;
  let endCallback = null;

  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

  function getNextUnit() {
    if (buffer.length === 0) return null;
    const bufferStr = buffer.join('');
    const segments = [...segmenter.segment(bufferStr)];
    if (segments.length === 0) return null;

    const first = segments[0];
    if (!first.segment || !first.segment.length) {
      buffer.splice(0, 1);
      return null;
    }

    buffer.splice(0, first.segment.length);
    return first.segment;
  }

  function tick() {
    if (buffer.length === 0) {
      if (isEnding) {
        if (timer) { clearInterval(timer); timer = null; }
        if (endCallback) { const cb = endCallback; endCallback = null; cb(); }
      }
      return;
    }

    const unit = getNextUnit();
    if (unit) onChunk(unit);
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, pacingMs);
  }

  function feed(text) {
    if (!text) return;
    for (const char of text) {
      buffer.push(char);
    }
    start();
  }

  function end(callback) {
    isEnding = true;
    endCallback = callback;
    if (buffer.length === 0) {
      if (timer) { clearInterval(timer); timer = null; }
      if (endCallback) { const cb = endCallback; endCallback = null; cb(); }
    }
  }

  function flush() {
    if (buffer.length > 0) {
      onChunk(buffer.join(''));
      buffer.length = 0;
    }
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { feed, end, flush };
}

/** 流式合并：微批量发送，保持打字机流畅度的同时减少 WebSocket 帧数 */
function createStreamMergeDelta(cfg, onChunk) {
  const maxChars = (cfg?.max_chars ?? 15);
  const idleMs = (cfg?.idle_ms ?? 25);
  let buf = '';
  let idleTimer = null;

  function flush() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (buf.length > 0) { onChunk(buf); buf = ''; }
  }

  return {
    onDelta: (delta) => {
      if (!delta) return;
      buf += delta;
      if (buf.length >= maxChars) { flush(); return; }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, idleMs);
    },
    flush,
  };
}

module.exports = {
  createStreamSmoother,
  createStreamMergeDelta,
};
