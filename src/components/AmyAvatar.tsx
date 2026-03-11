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

    const W = size;
    const H = size;
    const CX = W / 2;
    const CY = H / 2;
    const R = W / 2 - 2;

    let frameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const s = stateRef.current;
      s.phase += isStreaming ? 0.12 : 0.04;
      s.energy += (isStreaming ? 1 : 0.2 - s.energy) * 0.1;

      // 外圆边框
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.strokeStyle = isStreaming
        ? `rgba(0, 255, 136, ${0.6 + Math.sin(s.phase * 2) * 0.3})`
        : 'rgba(0, 180, 80, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 外圆发光
      if (isStreaming) {
        ctx.beginPath();
        ctx.arc(CX, CY, R + 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 136, ${0.1 + Math.sin(s.phase) * 0.1})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 裁剪到圆形内
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R - 1, 0, Math.PI * 2);
      ctx.clip();

      // 背景
      const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
      bg.addColorStop(0, '#001a08');
      bg.addColorStop(1, '#000a03');
      ctx.fillStyle = bg;
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
        ctx.strokeStyle = isStreaming
          ? `rgba(0, 255, 136, ${alpha})`
          : `rgba(0, 180, 80, ${alpha * 0.7})`;
        ctx.lineWidth = barW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 中心点
      const dotGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 5);
      dotGlow.addColorStop(0, isStreaming ? 'rgba(0,255,136,1)' : 'rgba(0,200,80,0.8)');
      dotGlow.addColorStop(1, 'rgba(0,255,136,0)');
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
