// 儀器面板印刷字樣：用 canvas 畫成貼圖（不用 drei <Text>，避免執行時從 CDN 下載字型）
import * as THREE from 'three';

export const PX_PER_UNIT = 256;

/** 面板座標（單位：世界座標，原點在面板中心、y 向上）→ canvas 像素 */
export interface PanelCtx {
  ctx: CanvasRenderingContext2D;
  x: (u: number) => number;
  y: (u: number) => number;
  s: (u: number) => number;
}

export function createCanvasTexture(
  width: number,
  height: number,
  draw: (p: PanelCtx) => void,
  pxPerUnit = PX_PER_UNIT,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pxPerUnit);
  canvas.height = Math.round(height * pxPerUnit);
  const ctx = canvas.getContext('2d')!;
  const p: PanelCtx = {
    ctx,
    x: (u) => (u + width / 2) * pxPerUnit,
    y: (u) => (height / 2 - u) * pxPerUnit,
    s: (u) => u * pxPerUnit,
  };
  draw(p);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export const FONT = '"Segoe UI", "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif';
export const MONO = '"Consolas", "DejaVu Sans Mono", "Menlo", monospace';

export function label(
  p: PanelCtx, text: string, x: number, y: number,
  size = 0.07, color = '#d8dde3', align: CanvasTextAlign = 'center', weight = 600,
) {
  p.ctx.fillStyle = color;
  p.ctx.font = `${weight} ${p.s(size)}px ${FONT}`;
  p.ctx.textAlign = align;
  p.ctx.textBaseline = 'middle';
  p.ctx.fillText(text, p.x(x), p.y(y));
}

/** 面板上的分區框線 */
export function sectionBox(p: PanelCtx, x: number, y: number, w: number, h: number, title?: string) {
  const { ctx } = p;
  ctx.strokeStyle = 'rgba(200,210,220,0.35)';
  ctx.lineWidth = p.s(0.008);
  ctx.beginPath();
  ctx.roundRect(p.x(x - w / 2), p.y(y + h / 2), p.s(w), p.s(h), p.s(0.03));
  ctx.stroke();
  if (title) {
    ctx.font = `700 ${p.s(0.055)}px ${FONT}`;
    const tw = ctx.measureText(title).width + p.s(0.04);
    ctx.fillStyle = '#3a4048';
    ctx.fillRect(p.x(x) - tw / 2, p.y(y + h / 2) - p.s(0.035), tw, p.s(0.07));
    label(p, title, x, y + h / 2, 0.055, '#9fb3c8', 'center', 700);
  }
}
