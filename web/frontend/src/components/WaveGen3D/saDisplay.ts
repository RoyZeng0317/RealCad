// 頻譜分析儀螢幕：10×10 格線、頻譜軌跡、標記（菱形 + 讀值）、參考準位 / 中心頻率 / Span / RBW / THD
import { DIVS, DB_DIV, startFreq, stopFreq, effectiveRbw, fmtHz, type SaSettings } from './spectrum.js';
import { FONT, MONO } from './panelTexture.js';

export const SA_TRACE = '#ffd21f';

export interface SaFrame {
  trace: Float32Array;
  s: SaSettings;
  marker: { f: number; db: number } | null;
  thd: number | null;
  source: string;
}

const TOP = 46, BOTTOM = 64;

export function drawSa(ctx: CanvasRenderingContext2D, W: number, H: number, f: SaFrame) {
  const { s } = f;
  ctx.fillStyle = '#05080b';
  ctx.fillRect(0, 0, W, H);
  const gx = 10, gy = TOP, gw = W - 20, gh = H - TOP - BOTTOM;

  ctx.strokeStyle = 'rgba(120,150,170,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (let i = 1; i < 10; i++) { ctx.moveTo(gx + (i * gw) / 10, gy); ctx.lineTo(gx + (i * gw) / 10, gy + gh); }
  for (let j = 1; j < DIVS; j++) { ctx.moveTo(gx, gy + (j * gh) / DIVS); ctx.lineTo(gx + gw, gy + (j * gh) / DIVS); }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(150,180,200,0.55)';
  ctx.strokeRect(gx, gy, gw, gh);

  const bottomDb = s.ref - DIVS * DB_DIV;
  const yOf = (db: number) => gy + ((s.ref - db) / (s.ref - bottomDb)) * gh;
  const f0 = startFreq(s), f1 = stopFreq(s);
  const xOf = (fr: number) => gx + ((fr - f0) / (f1 - f0 || 1)) * gw;

  // 軌跡
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gy, gw, gh);
  ctx.clip();
  ctx.strokeStyle = SA_TRACE;
  ctx.lineWidth = 2;
  ctx.shadowColor = SA_TRACE;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  const n = f.trace.length;
  for (let i = 0; i < n; i++) {
    const x = gx + (i / (n - 1)) * gw, y = Math.min(gy + gh + 2, yOf(f.trace[i]));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // 標記
  if (f.marker && f.marker.f >= f0 && f.marker.f <= f1) {
    const x = xOf(f.marker.f), y = Math.max(gy + 8, Math.min(gy + gh - 2, yOf(f.marker.db)));
    ctx.fillStyle = '#39ff6a';
    ctx.beginPath();
    ctx.moveTo(x, y - 14); ctx.lineTo(x + 7, y - 7); ctx.lineTo(x, y); ctx.lineTo(x - 7, y - 7);
    ctx.fill();
  }

  // 上方：參考準位、刻度、標記讀值
  ctx.textBaseline = 'middle';
  ctx.font = `700 17px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8eef5';
  ctx.fillText(`Ref ${s.ref.toFixed(1)} ${s.unit}   ${DB_DIV} dB/div`, 12, TOP / 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = s.running ? '#39ff6a' : '#ff4a4a';
  ctx.font = `800 17px ${FONT}`;
  if (f.marker) {
    ctx.fillStyle = '#39ff6a';
    ctx.font = `700 17px ${MONO}`;
    ctx.fillText(`Mkr1 ${fmtHz(f.marker.f)}  ${f.marker.db.toFixed(2)} ${s.unit}`, W - 12, TOP / 2);
  } else {
    ctx.fillText(s.running ? 'RUN' : 'HOLD', W - 12, TOP / 2);
  }

  // 下方：中心 / Span / RBW / THD / 輸入
  ctx.font = `600 15px ${MONO}`;
  ctx.fillStyle = '#9fb3c8';
  ctx.textAlign = 'left';
  ctx.fillText(`Center ${fmtHz(s.center)}`, 12, H - BOTTOM + 20);
  ctx.textAlign = 'center';
  ctx.fillText(`RBW ${fmtHz(effectiveRbw(s))}`, W / 2, H - BOTTOM + 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Span ${fmtHz(f1 - f0)}`, W - 12, H - BOTTOM + 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7f93a8';
  ctx.fillText(f.source, 12, H - BOTTOM + 46);
  if (f.thd !== null) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c48bff';
    ctx.fillText(`THD ${(f.thd * 100).toFixed(2)} %`, W - 12, H - BOTTOM + 46);
  }
}
