let audioContext: AudioContext | null = null;

export function playClickSound() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch {}
}
