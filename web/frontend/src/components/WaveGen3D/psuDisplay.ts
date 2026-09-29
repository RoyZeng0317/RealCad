// 電源供應器 LCD：左邊電壓、右邊電流（七段顯示器風格），上方 CV/CC/OUT 狀態
import type { PsuSettings, PsuReading } from './psu.js';
import { FONT, MONO } from './panelTexture.js';

function sevenSeg(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string,
) {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  // 背景淡淡的「8.8.8.8」，模仿沒點亮的七段顯示器筆畫
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillText(text.replace(/\d/g, '8'), x, y);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.25;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

export function drawPsuLcd(
  ctx: CanvasRenderingContext2D, W: number, H: number, s: PsuSettings, r: PsuReading,
) {
  ctx.fillStyle = '#050607';
  ctx.fillRect(0, 0, W, H);
  if (!s.power) return;

  // 輸出關閉時跟真實電源一樣顯示「設定值」；開啟時顯示實際量測值
  const showV = s.output ? r.v : s.vSet;
  const showI = s.output ? r.i : s.iSet;
  const half = W / 2;
  const digit = H * 0.56;

  sevenSeg(ctx, showV.toFixed(2).padStart(5, ' '), half - 70, H * 0.8, digit, '#ff4d3a');
  sevenSeg(ctx, showI.toFixed(3), W - 70, H * 0.8, digit, '#3cff7a');
  ctx.font = `700 ${H * 0.2}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff4d3a';
  ctx.fillText('V', half - 60, H * 0.8);
  ctx.fillStyle = '#3cff7a';
  ctx.fillText('A', W - 60, H * 0.8);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(half, H * 0.12);
  ctx.lineTo(half, H * 0.88);
  ctx.stroke();

  const tag = (text: string, x: number, on: boolean, color: string) => {
    ctx.font = `800 ${H * 0.13}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.12)';
    ctx.fillText(text, x, H * 0.14);
  };
  tag(s.output ? 'OUT' : 'SET', 16, true, s.output ? '#ffd21f' : '#8fb4d0');
  tag('CV', 90, r.mode === 'CV', '#3cff7a');
  tag('CC', 146, r.mode === 'CC', '#ff4d3a');
  if (s.output) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fb4d0';
    ctx.font = `700 ${H * 0.13}px ${MONO}`;
    ctx.fillText(`${r.p.toFixed(2)} W`, W - 16, H * 0.14);
  }
}
