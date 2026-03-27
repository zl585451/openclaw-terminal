let audioContext: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioContext;
}

// 计数器：控制触发频率（不是每个字符都响）
let charCounter = 0;

/** 打字机：清脆的机械键盘声，每 3 个字触发一次 */
function playTypewriter() {
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
  filter.frequency.value = 2000;
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.03);
}

/** 柔和：轻柔的气泡提示音，每 5 个字触发一次 */
function playSoft() {
  charCounter++;
  if (charCounter % 5 !== 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1200 + Math.random() * 200;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

/** 水泡：低频水滴声，每 8 个字触发一次 */
function playBubble() {
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
  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

export type TypingSoundMode = 'off' | 'typewriter' | 'soft' | 'bubble';

export function playClickSound(mode: TypingSoundMode = 'typewriter') {
  try {
    switch (mode) {
      case 'typewriter': playTypewriter(); break;
      case 'soft': playSoft(); break;
      case 'bubble': playBubble(); break;
      default: break;
    }
  } catch {}
}

export function resetSoundCounter() {
  charCounter = 0;
}
