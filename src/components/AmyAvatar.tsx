import React, { useEffect, useRef } from 'react';

interface AmyAvatarProps {
  isStreaming?: boolean;
  size?: number;
}

const AmyAvatar: React.FC<AmyAvatarProps> = ({ isStreaming = false, size = 36 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ phase: 0, energy: 0 });

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

    const c = (r: number, g: number, b: number, a: number) => `rg` + `ba(${r}, ${g}, ${b}, ${a})`;

    const W = size;
    const H = size;
    const CX = W / 2;
    const CY = H / 2;
    const R = W / 2 - 2;

    let frameId: number;

    const accentHex = getVar('--accent-primary', '');
    const idleHex = getVar('--text-tertiary', '');
    const bgHex = getVar('--bg-panel', '');
    const accent = hexToRgb(accentHex) ?? { r: 212, g: 118, b: 78 };
    const idle = hexToRgb(idleHex) ?? { r: 140, g: 140, b: 140 };
    const bg = hexToRgb(bgHex) ?? { r: 43, g: 42, b: 39 };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const s = stateRef.current;
      s.phase += isStreaming ? 0.12 : 0.04;
      s.energy += (isStreaming ? 1 : 0.2 - s.energy) * 0.1;

      // 外圆边框
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      const ring = isStreaming ? accent : idle;
      ctx.strokeStyle = c(ring.r, ring.g, ring.b, isStreaming ? (0.6 + Math.sin(s.phase * 2) * 0.3) : 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 外圆发光
      if (isStreaming) {
        ctx.beginPath();
        ctx.arc(CX, CY, R + 2, 0, Math.PI * 2);
        ctx.strokeStyle = c(accent.r, accent.g, accent.b, 0.1 + Math.sin(s.phase) * 0.1);
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 裁剪到圆形内
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R - 1, 0, Math.PI * 2);
      ctx.clip();

      // 背景
      const bgGrd = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
      bgGrd.addColorStop(0, c(bg.r, bg.g, bg.b, 0.9));
      bgGrd.addColorStop(1, c(bg.r, bg.g, bg.b, 1));
      ctx.fillStyle = bgGrd;
      ctx.fillRect(0, 0, W, H);

      // 波形
      const BARS = 12;
      const barW = 2;
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const wave = Math.sin(s.phase * 2 + i * 0.6) * s.energy;
        const innerR = R * 0.25;
        const outerR = R * (0.45 + Math.abs(wave) * 0.45);

        const x1 = CX + Math.cos(angle) * innerR;
        const y1 = CY + Math.sin(angle) * innerR;
        const x2 = CX + Math.cos(angle) * outerR;
        const y2 = CY + Math.sin(angle) * outerR;

        const alpha = 0.4 + Math.abs(wave) * 0.6;
        const waveC = isStreaming ? accent : idle;
        ctx.strokeStyle = c(waveC.r, waveC.g, waveC.b, isStreaming ? alpha : alpha * 0.7);
        ctx.lineWidth = barW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 中心点
      const dotGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 5);
      dotGlow.addColorStop(0, c(accent.r, accent.g, accent.b, isStreaming ? 1 : 0.8));
      dotGlow.addColorStop(1, c(accent.r, accent.g, accent.b, 0));
      ctx.fillStyle = dotGlow;
      ctx.beginPath();
      ctx.arc(CX, CY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [isStreaming, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: 'block', borderRadius: '50%' }}
    />
  );
};

export default AmyAvatar;
