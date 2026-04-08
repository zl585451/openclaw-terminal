let audioContext: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// 计数器：控制触发频率（不是每个字符都响）
let charCounter = 0;

/** 打字机：清脆的机械键盘声，每 3 个字触发一次 */
function playTypewriter(volume = 1) {
  charCounter++;
  if (charCounter % 3 !== 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  // 随机化频率，模拟不同按键
  osc.frequency.value = 600 + Math.random() * 400;
  osc.type = 'square';
  filter.type = 'highpass';
  filter.frequency.value = 1700;
  gain.gain.setValueAtTime(0.18 * volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.003, ctx.currentTime + 0.04);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.04);
}

/** 柔和：轻柔的气泡提示音，每 5 个字触发一次 */
function playSoft(volume = 1) {
  charCounter++;
  if (charCounter % 5 !== 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1200 + Math.random() * 200;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.12 * volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.07);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.07);
}

/** 水泡：低频水滴声，每 8 个字触发一次 */
function playBubble(volume = 1) {
  charCounter++;
  if (charCounter % 8 !== 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const baseFreq = 300 + Math.random() * 150;
  osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, ctx.currentTime + 0.08);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.16 * volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.1);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

export type TypingSoundMode = 'off' | 'typewriter' | 'soft' | 'bubble';

export function playClickSound(mode: TypingSoundMode = 'typewriter', volume = 1) {
  try {
    switch (mode) {
      case 'typewriter': playTypewriter(volume); break;
      case 'soft': playSoft(volume); break;
      case 'bubble': playBubble(volume); break;
      default: break;
    }
  } catch {}
}

export function resetSoundCounter() {
  charCounter = 0;
}
