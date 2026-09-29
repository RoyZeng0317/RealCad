// 函數波產生器 LCD 螢幕的繪製（每次設定改變時重畫一次）
import { type GenSettings, sampleWave, formatSI } from './waveform.js';
import type { GenParam } from './waveStore.js';
import { FONT, MONO } from './panelTexture.js';

const WAVE_NAME: Record<GenSettings['waveform'], string> = {
  sine: 'SINE', square: 'SQUARE', triangle: 'TRIANGLE', ramp: 'RAMP', pulse: 'PULSE', noise: 'NOISE',
};

export function drawGenLcd(ctx: CanvasRenderingContext2D, W: number, H: number, g: GenSettings, sel: GenParam) {
  if (!g.power) {
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d2436');
  bg.addColorStop(1, '#081520');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 標題列：波形名稱、輸出狀態
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(12, 10, 150, 44);
  ctx.fillStyle = '#10161c';
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(WAVE_NAME[g.waveform], 87, 33);
  ctx.textAlign = 'right';
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = g.output ? '#39ff6a' : '#6d7a86';
  ctx.fillText(g.output ? '● OUTPUT ON' : '○ OUTPUT OFF', W - 16, 33);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8fb4d0';
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText('CH1  HighZ', 176, 33);

  // 波形預覽（左側）
  const bx = 12, by = 66, bw = 220, bh = H - 78;
  ctx.strokeStyle = '#27506e';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.beginPath();
  ctx.moveTo(bx, by + bh / 2);
  ctx.lineTo(bx + bw, by + bh / 2);
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  const preview: GenSettings = { ...g, output: true, frequency: 1, amplitude: 1.8, offset: 0 };
  ctx.strokeStyle = '#4fd8ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#4fd8ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i <= bw - 16; i++) {
    const v = sampleWave(preview, (i / (bw - 16)) * 2 + 1e-6);
    const x = bx + 8 + i, y = by + bh / 2 - v * (bh / 2 - 12) / 0.9 / 1;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 參數列表（右側），目前選取的參數反白
  const rows: [GenParam, string, string, boolean][] = [
    ['frequency', 'Freq', formatSI(g.frequency, 'Hz', 5), true],
    ['amplitude', 'Ampl', `${g.amplitude.toFixed(3)} Vpp`, true],
    ['offset', 'Offset', `${g.offset >= 0 ? '+' : ''}${g.offset.toFixed(3)} Vdc`, true],
    ['duty', 'Duty', `${g.duty} %`, g.waveform === 'pulse'],
  ];
  const rx = 248, rw = W - rx - 12, rh = (H - 78) / 4;
  rows.forEach(([key, name, value, enabled], i) => {
    const y = 66 + i * rh;
    const active = key === sel;
    if (active) {
      ctx.fillStyle = '#2f8cff';
      ctx.fillRect(rx, y + 3, rw, rh - 6);
    }
    ctx.globalAlpha = enabled ? 1 : 0.35;
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#ffffff' : '#8fb4d0';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(name, rx + 12, y + rh / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 32px ${MONO}`;
    ctx.fillText(value, rx + rw - 12, y + rh / 2);
    ctx.globalAlpha = 1;
  });
}
