// 示波器螢幕繪製：格線、CH1 波形、觸發標記、檔位與自動量測
import { type Measurements, formatSI, H_DIVS, V_DIVS } from './waveform.js';
import type { ScopeSettings } from './waveStore.js';
import { FONT, MONO } from './panelTexture.js';

export interface ScopeFrame {
  samples: number[]; // 已扣除 AC 耦合的電壓
  timeDiv: number;
  voltDiv: number;
  scope: ScopeSettings;
  status: 'Trig\'d' | 'Auto' | 'Stop';
  meas: Measurements;
  powered: boolean;
}

const TOP = 48, BOTTOM = 60;
const CH1 = '#ffd21f';

export function drawScope(ctx: CanvasRenderingContext2D, W: number, H: number, f: ScopeFrame) {
  ctx.fillStyle = '#04070a';
  ctx.fillRect(0, 0, W, H);
  if (!f.powered) return;

  const gx = 8, gy = TOP, gw = W - 16, gh = H - TOP - BOTTOM;
  const dx = gw / H_DIVS, dy = gh / V_DIVS;

  // 格線（中央十字軸有細刻度，跟真實示波器一樣）
  ctx.strokeStyle = 'rgba(120,140,160,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (let i = 1; i < H_DIVS; i++) { ctx.moveTo(gx + i * dx, gy); ctx.lineTo(gx + i * dx, gy + gh); }
  for (let j = 1; j < V_DIVS; j++) { ctx.moveTo(gx, gy + j * dy); ctx.lineTo(gx + gw, gy + j * dy); }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(150,170,190,0.55)';
  ctx.strokeRect(gx, gy, gw, gh);
  const cx = gx + gw / 2, cy = gy + gh / 2;
  ctx.beginPath();
  for (let i = 0; i <= H_DIVS * 5; i++) { const x = gx + (i * dx) / 5; ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4); }
  for (let j = 0; j <= V_DIVS * 5; j++) { const y = gy + (j * dy) / 5; ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y); }
  ctx.stroke();

  const vToY = (v: number) => cy - (v / f.voltDiv + f.scope.position) * dy;

  // CH1 波形（加上螢光殘影效果）
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gy, gw, gh);
  ctx.clip();
  ctx.strokeStyle = CH1;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = CH1;
  ctx.shadowBlur = 10;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const n = f.samples.length;
  f.samples.forEach((v, i) => {
    const x = gx + (i / (n - 1)) * gw;
    const y = Math.max(gy - 4, Math.min(gy + gh + 4, vToY(v)));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  // 左側 CH1 接地標記、右側觸發準位標記、上方觸發時間點標記
  const marker = (x: number, y: number, dir: 1 | -1, color: string, text: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 9); ctx.lineTo(x + dir * 14, y); ctx.lineTo(x, y + 9);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + dir * 5, y + 1);
  };
  const clampY = (y: number) => Math.max(gy + 9, Math.min(gy + gh - 9, y));
  marker(gx, clampY(vToY(0)), 1, CH1, '1');
  marker(gx + gw, clampY(vToY(f.scope.trigLevel)), -1, '#ff8a1f', 'T');
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.moveTo(cx - 8, gy); ctx.lineTo(cx + 8, gy); ctx.lineTo(cx, gy + 12);
  ctx.fill();

  // 上方狀態列
  ctx.textBaseline = 'middle';
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = 'left';
  const statusColor = f.status === 'Stop' ? '#ff4a4a' : f.status === 'Auto' ? '#ffb020' : '#39ff6a';
  ctx.fillStyle = statusColor;
  ctx.fillText(f.status === 'Stop' ? 'STOP' : f.status, 14, TOP / 2);
  ctx.font = `800 20px ${MONO}`;
  const ch = `CH1 ${formatSI(f.voltDiv, 'V')}/div ${f.scope.coupling}`;
  const chW = ctx.measureText(ch).width + 16;
  ctx.fillStyle = CH1;
  ctx.fillRect(120, 10, chW, 28);
  ctx.fillStyle = '#000';
  ctx.fillText(ch, 128, TOP / 2);
  ctx.fillStyle = '#e8eef5';
  ctx.fillText(`H ${formatSI(f.timeDiv, 's')}/div`, 120 + chW + 18, TOP / 2);
  ctx.fillStyle = '#ff8a1f';
  ctx.textAlign = 'right';
  ctx.fillText(`T ↑ ${formatSI(f.scope.trigLevel, 'V')}`, W - 14, TOP / 2);

  // 下方自動量測
  const m = f.meas;
  const items = [
    ['Freq', m.freq ? formatSI(m.freq, 'Hz', 4) : '--'],
    ['Vpp', formatSI(m.vpp, 'V')],
    ['Vmax', formatSI(m.vmax, 'V')],
    ['Vmin', formatSI(m.vmin, 'V')],
    ['Vrms', formatSI(m.vrms, 'V')],
  ];
  const cw = (W - 16) / items.length;
  items.forEach(([k, v], i) => {
    const x = 8 + i * cw + cw / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7f93a8';
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(k, x, H - BOTTOM + 18);
    ctx.fillStyle = CH1;
    ctx.font = `700 20px ${MONO}`;
    ctx.fillText(v, x, H - BOTTOM + 42);
  });
}
