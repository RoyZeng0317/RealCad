// 示波器螢幕繪製：格線、CH1/CH2 波形、接地與觸發標記、檔位與兩個通道的自動量測
import { type Measurements, formatSI, H_DIVS, V_DIVS } from './waveform.js';
import type { ScopeSettings } from './waveStore.js';
import { FONT, MONO } from './panelTexture.js';

export type ScopeStatus = 'Trig\'d' | 'Auto' | 'Stop';

export interface ChannelFrame {
  samples: number[];
  voltDiv: number;
  position: number;
  meas: Measurements;
}

export interface ScopeFrame {
  ch1: ChannelFrame;
  ch2: ChannelFrame | null; // null = CH2 關閉
  timeDiv: number;
  scope: ScopeSettings;
  status: ScopeStatus;
}

const TOP = 48, BOTTOM = 84;
export const CH1_COLOR = '#ffd21f';
export const CH2_COLOR = '#2fd4ff';

/** 一個通道的全部量測參數（螢幕 MEASURE 頁與下方面板共用） */
export function measItems(m: Measurements): [string, string][] {
  const t = (v: number | null) => (v === null ? '--' : formatSI(v, 's', 4));
  return [
    ['頻率 Freq', m.freq ? formatSI(m.freq, 'Hz', 5) : '--'], ['週期 Period', t(m.period)],
    ['峰對峰 Vpp', formatSI(m.vpp, 'V', 4)], ['最大 Vmax', formatSI(m.vmax, 'V', 4)], ['最小 Vmin', formatSI(m.vmin, 'V', 4)],
    ['平均 Vavg', formatSI(m.vavg, 'V', 4)], ['有效值 Vrms', formatSI(m.vrms, 'V', 4)],
    ['工作週期 Duty', m.duty === null ? '--' : `${(m.duty * 100).toFixed(2)} %`], ['正脈寬 +Width', t(m.pwidth)],
    ['上升時間 Rise', t(m.rise)], ['下降時間 Fall', t(m.fall)],
  ];
}

export function drawScope(ctx: CanvasRenderingContext2D, W: number, H: number, f: ScopeFrame) {
  ctx.fillStyle = '#04070a';
  ctx.fillRect(0, 0, W, H);

  const gx = 8, gy = TOP, gw = W - 16, gh = H - TOP - BOTTOM;
  const dx = gw / H_DIVS, dy = gh / V_DIVS;
  const cx = gx + gw / 2, cy = gy + gh / 2;

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
  ctx.beginPath();
  for (let i = 0; i <= H_DIVS * 5; i++) { const x = gx + (i * dx) / 5; ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4); }
  for (let j = 0; j <= V_DIVS * 5; j++) { const y = gy + (j * dy) / 5; ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y); }
  ctx.stroke();

  const vToY = (ch: ChannelFrame, v: number) => cy - (v / ch.voltDiv + ch.position) * dy;
  const clampY = (y: number) => Math.max(gy + 9, Math.min(gy + gh - 9, y));

  const trace = (ch: ChannelFrame, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, gy, gw, gh);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = ch.samples.length;
    ch.samples.forEach((v, i) => {
      const x = gx + (i / (n - 1)) * gw;
      const y = Math.max(gy - 4, Math.min(gy + gh + 4, vToY(ch, v)));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

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

  if (f.ch2) trace(f.ch2, CH2_COLOR);
  trace(f.ch1, CH1_COLOR);
  marker(gx, clampY(vToY(f.ch1, 0)), 1, CH1_COLOR, '1');
  if (f.ch2) marker(gx, clampY(vToY(f.ch2, 0)), 1, CH2_COLOR, '2');
  const trigCh = f.scope.trigSource === 'CH2' && f.ch2 ? f.ch2 : f.ch1;
  marker(gx + gw, clampY(vToY(trigCh, f.scope.trigLevel)), -1, '#ff8a1f', 'T');
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.moveTo(cx - 8, gy); ctx.lineTo(cx + 8, gy); ctx.lineTo(cx, gy + 12);
  ctx.fill();

  // 上方狀態列：狀態、CH1/CH2 檔位、時基、觸發
  ctx.textBaseline = 'middle';
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = f.status === 'Stop' ? '#ff4a4a' : f.status === 'Auto' ? '#ffb020' : '#39ff6a';
  ctx.fillText(f.status === 'Stop' ? 'STOP' : f.status, 12, TOP / 2);
  ctx.font = `800 19px ${MONO}`;
  let x = 104;
  const chip = (text: string, color: string) => {
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = color;
    ctx.fillRect(x, 11, w, 26);
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 7, TOP / 2);
    x += w + 8;
  };
  chip(`1 ${formatSI(f.ch1.voltDiv, 'V')}${f.scope.coupling === 'AC' ? ' AC' : ''}`, CH1_COLOR);
  if (f.ch2) chip(`2 ${formatSI(f.ch2.voltDiv, 'V')}`, CH2_COLOR);
  ctx.fillStyle = '#e8eef5';
  ctx.fillText(`H ${formatSI(f.timeDiv, 's')}`, x + 4, TOP / 2);
  ctx.fillStyle = '#ff8a1f';
  ctx.textAlign = 'right';
  ctx.fillText(`T${f.scope.trigSource === 'CH2' ? 2 : 1}↑${formatSI(f.scope.trigLevel, 'V')}`, W - 10, TOP / 2);

  // 下方兩列自動量測
  const row = (y: number, name: string, color: string, items: [string, string][]) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(name, 14, y);
    const cw = (W - 70) / items.length;
    items.forEach(([k, v], i) => {
      const ix = 62 + i * cw;
      ctx.fillStyle = '#7f93a8';
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(k, ix, y);
      ctx.fillStyle = color;
      ctx.font = `700 17px ${MONO}`;
      ctx.fillText(v, ix + ctx.measureText(k).width + 26, y);
    });
  };
  // MEASURE 頁：右上角半透明框列出一個通道的全部參數
  const page = f.scope.measPage === 1 ? f.ch1 : f.scope.measPage === 2 ? f.ch2 : null;
  if (page) {
    const color = f.scope.measPage === 1 ? CH1_COLOR : CH2_COLOR;
    const items = measItems(page.meas);
    const bw = 300, lh = 26, bh = 40 + items.length * lh, bx = gx + gw - bw - 6, by = gy + 6;
    ctx.fillStyle = 'rgba(6,10,16,0.82)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText(`MEASURE  CH${f.scope.measPage}`, bx + 12, by + 20);
    items.forEach(([k, v], i) => {
      const y = by + 46 + i * lh;
      ctx.fillStyle = '#9fb3c8';
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(k, bx + 12, y);
      ctx.fillStyle = color;
      ctx.font = `700 17px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(v, bx + bw - 12, y);
    });
  }

  const m1 = f.ch1.meas;
  row(H - BOTTOM + 24, 'CH1', CH1_COLOR, [
    ['Freq', m1.freq ? formatSI(m1.freq, 'Hz', 4) : '--'],
    ['Vpp', formatSI(m1.vpp, 'V')],
    ['Vrms', formatSI(m1.vrms, 'V')],
  ]);
  if (f.ch2) {
    const m2 = f.ch2.meas;
    row(H - BOTTOM + 60, 'CH2', CH2_COLOR, [
      ['Vavg', formatSI(m2.vavg, 'V')],
      ['Vmax', formatSI(m2.vmax, 'V')],
      ['Vmin', formatSI(m2.vmin, 'V')],
    ]);
  }
}
