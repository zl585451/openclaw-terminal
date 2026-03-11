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

    const W = canvas.width;
    const H = canvas.height;
    const MID = H / 2;
    const SPEED = 0.4;
    const TRAIL_LEN = W;

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

      // 背景网格
      ctx.strokeStyle = 'rgba(0, 80, 30, 0.2)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 20) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 10) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // 中线
      ctx.strokeStyle = 'rgba(0, 150, 60, 0.3)';
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

      // 清除扫描点前方区域（黑色遮罩）
      ctx.fillStyle = 'rgba(10, 18, 12, 1)';
      ctx.fillRect(s.x, 0, 30, H);

      // 画轨迹线，带渐变透明度
      if (s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i++) {
          const alpha = i / s.trail.length;
          ctx.strokeStyle = connected
            ? `rgba(0, 255, 100, ${alpha * 0.85})`
            : `rgba(80, 80, 80, ${alpha * 0.4})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
          ctx.lineTo(s.trail[i].x, s.trail[i].y);
          ctx.stroke();
        }
      }

      // 扫描光点
      const glowColor = connected ? '0, 255, 120' : '100, 100, 100';
      const grd = ctx.createRadialGradient(s.x, y, 0, s.x, y, 8);
      grd.addColorStop(0, `rgba(${glowColor}, 1)`);
      grd.addColorStop(0.4, `rgba(${glowColor}, 0.6)`);
      grd.addColorStop(1, `rgba(${glowColor}, 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(s.x, y, 8, 0, Math.PI * 2);
      ctx.fill();

      // 亮芯
      ctx.fillStyle = `rgba(${glowColor}, 1)`;
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
      height={55}
      style={{ display: 'block', width: '100%', height: '55px' }}
    />
  );
};

export default HeartbeatWave;
