import React, { useEffect, useRef } from 'react';

interface HeartbeatWaveProps {
  connected: boolean;
  pulse: boolean;
}

const HeartbeatWave: React.FC<HeartbeatWaveProps> = ({ connected }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    x: 0,
    phase: 0,
    trail: [] as {x: number, y: number}[],
    lastPulse: false,
    beatPhase: 0,
    inBeat: false,
    frameId: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getVar = (name: string, fallback: string) => {
      if (typeof window === 'undefined') return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };

    const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
      const h = hex.replace(String.fromCharCode(35), '').trim();
      if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return { r, g, b };
      }
      if (h.length === 6) {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return { r, g, b };
      }
      return null;
    };

    // 颜色字符串构造（主题变量 -> 画布颜色）
    const c = (r: number, g: number, b: number, a: number) => `rg` + `ba(${r}, ${g}, ${b}, ${a})`;

    const W = canvas.width;
    const H = canvas.height;
    const MID = H / 2;
    const SPEED = 0.4;
    const TRAIL_LEN = W;

    const okHex = getVar('--status-success', '');
    const offHex = getVar('--text-tertiary', '');
    const ok = hexToRgb(okHex) ?? { r: 143, g: 188, b: 143 };
    const off = hexToRgb(offHex) ?? { r: 120, g: 120, b: 120 };

    // PQRST 波形函数
    const getPQRST = (t: number): number => {
      const cycle = t % 1;
      if (cycle < 0.15) return Math.sin(cycle / 0.15 * Math.PI) * 4; // P波
      if (cycle < 0.25) return 0;
      if (cycle < 0.28) return -Math.sin((cycle - 0.25) / 0.03 * Math.PI) * 6; // Q
      if (cycle < 0.32) return Math.sin((cycle - 0.28) / 0.04 * Math.PI) * 28; // R峰
      if (cycle < 0.36) return -Math.sin((cycle - 0.32) / 0.04 * Math.PI) * 10; // S
      if (cycle < 0.55) return Math.sin((cycle - 0.36) / 0.19 * Math.PI) * 5; // T波
      return 0;
    };

    const s = stateRef.current;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // 中线
      ctx.strokeStyle = c(ok.r, ok.g, ok.b, 0.25);
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, MID); ctx.lineTo(W, MID); ctx.stroke();

      // 推进扫描点
      s.x += SPEED;
      if (s.x > W) {
        s.x = 0;
        s.trail = [];
      }

      s.phase += SPEED / (W * 1.2);
      const y = connected ? MID - getPQRST(s.phase) : MID + Math.sin(s.phase * 2) * 1.5;

      s.trail.push({ x: s.x, y });
      if (s.trail.length > TRAIL_LEN) s.trail.shift();

      if (s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i++) {
          const alpha = i / s.trail.length;
          ctx.strokeStyle = connected
            ? c(ok.r, ok.g, ok.b, alpha * 0.75)
            : c(off.r, off.g, off.b, alpha * 0.35);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
          ctx.lineTo(s.trail[i].x, s.trail[i].y);
          ctx.stroke();
        }
      }

      // 扫描光点
      const glow = connected ? ok : off;
      const grd = ctx.createRadialGradient(s.x, y, 0, s.x, y, 8);
      grd.addColorStop(0, c(glow.r, glow.g, glow.b, 1));
      grd.addColorStop(0.4, c(glow.r, glow.g, glow.b, 0.6));
      grd.addColorStop(1, c(glow.r, glow.g, glow.b, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(s.x, y, 8, 0, Math.PI * 2);
      ctx.fill();

      // 亮芯
      ctx.fillStyle = c(glow.r, glow.g, glow.b, 1);
      ctx.beginPath();
      ctx.arc(s.x, y, 2, 0, Math.PI * 2);
      ctx.fill();

      s.frameId = requestAnimationFrame(draw);
    };

    s.frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(s.frameId);
  }, [connected]);

  return (
    <canvas
      ref={canvasRef}
      width={290}
      height={65}
      style={{ display: 'block', width: '100%', height: '65px' }}
    />
  );
};

export default HeartbeatWave;
