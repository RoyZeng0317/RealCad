// NE555 計時 IC（DIP-8）：電氣模型 + 自己振盪的時域模擬
//   腳位：1 GND、2 TRIG、3 OUT、4 RESET、5 CTRL、6 THR、7 DIS、8 VCC（第 1 腳在 e 欄，逆時針）
//   內部：VCC–CTRL–GND 三顆 5 kΩ 分壓 → 上比較器門檻 = V(CTRL)（約 2/3 VCC）、下比較器門檻 = V(CTRL)/2（約 1/3 VCC）
//     TRIG < 下門檻 → 正反器 Q = 1（OUT 高、放電電晶體關）；THR > 上門檻 → Q = 0（OUT 低、DIS 對地導通）；RESET < 0.7 V → Q = 0
//     OUT 高電位 ≈ VCC − 1.6 V（雙極性輸出級）、低電位 ≈ 0.1 V，可推 / 吸 200 mA
//   555 會自己振盪（無穩態），週期由外部 R、C 決定，不是函數產生器給的：
//     simulate555() 從上電（電容 0 V）開始用可變時間步一步步模擬，等振盪穩定後量出週期，再用固定時間步錄一個週期
//     → 跟 transient.ts 的 Periodic 同一種格式，示波器 / 電表 / LED 都直接用
import { solveCircuit, type Element, type Solution } from './circuit.js';
import type { BoardPart } from './boardParts.js';
import { STEPS_PER_PERIOD, type Periodic } from './transient.js';

export const NE = { GND: 0, TRIG: 1, OUT: 2, RESET: 3, CTRL: 4, THR: 5, DIS: 6, VCC: 7 };
export const NE555_PINS: [string, string][] = [
  ['GND', '接地'], ['TRIG', '觸發：低於 1/3 VCC → 輸出變高'], ['OUT', '輸出（高 ≈ VCC − 1.6 V，可推 200 mA）'], ['RESET', '重置：低電位有效，不用時接 VCC'],
  ['CTRL', '控制電壓（內部 2/3 VCC），不用時接 0.01 µF 到地'], ['THR', '臨界：高於 2/3 VCC → 輸出變低'], ['DIS', '放電：輸出低時對地導通'], ['VCC', '電源 4.5–16 V'],
];
export const NE555_VMIN = 4.5, NE555_VMAX = 16;

/** 每顆 555 目前的正反器狀態（電路求解用；模擬時另外帶自己的狀態） */
export const ne555Q = new Map<string, boolean>();

const pinNet = (p: BoardPart, net: (h: string) => string) => (i: number) => net(p.pins[i]);

/** 不隨狀態改變的部分：耗電、CTRL 分壓 */
export function ne555Static(parts: BoardPart[], net: (h: string) => string): Element[] {
  const els: Element[] = [];
  for (const p of parts) {
    if (p.kind !== 'ne555' || p.burnt) continue;
    const n = pinNet(p, net);
    els.push({ kind: 'res', id: p.id, a: n(NE.VCC), b: n(NE.GND), r: 1700 }); // 靜態電流約 3 mA（5 V）
    els.push({ kind: 'res', id: `${p.id}:r1`, a: n(NE.VCC), b: n(NE.CTRL), r: 5000 });
    els.push({ kind: 'res', id: `${p.id}:r23`, a: n(NE.CTRL), b: n(NE.GND), r: 10000 });
  }
  return els;
}

/** 隨正反器狀態改變的部分：OUT 輸出級、DIS 放電電晶體（id 都帶 ':dyn-'） */
export function ne555Dynamic(parts: BoardPart[], net: (h: string) => string, q: (id: string) => boolean): Element[] {
  const els: Element[] = [];
  for (const p of parts) {
    if (p.kind !== 'ne555' || p.burnt) continue;
    const n = pinNet(p, net);
    if (q(p.id)) els.push({ kind: 'src', id: `${p.id}:dyn-out`, p: n(NE.OUT), n: n(NE.VCC), v: -1.6, r: 8 });
    else {
      els.push({ kind: 'src', id: `${p.id}:dyn-out`, p: n(NE.OUT), n: n(NE.GND), v: 0.1, r: 8 });
      els.push({ kind: 'res', id: `${p.id}:dyn-dis`, a: n(NE.DIS), b: n(NE.GND), r: 12 });
    }
  }
  return els;
}

/** 依目前電壓更新正反器；回傳新的 Q */
export function ne555Next(p: BoardPart, sol: Solution, net: (h: string) => string, q: boolean): boolean {
  const v = (i: number) => sol.nodeV[net(p.pins[i])] ?? 0;
  const g = v(NE.GND), vcc = v(NE.VCC) - g;
  if (vcc < NE555_VMIN * 0.8) return false; // 電源不夠：輸出低
  const ctrl = v(NE.CTRL) - g;
  if (v(NE.RESET) - g < 0.7) return false;
  if (v(NE.TRIG) - g < ctrl / 2) return true;
  if (v(NE.THR) - g > ctrl) return false;
  return q;
}

export interface Ne555Sim {
  per: Periodic | null; // 有振盪：一個週期的解
  final: Solution; // 沒振盪：最後的穩定狀態
  q: Record<string, boolean>; // 最後的正反器狀態
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const BUDGET_MS = 400;

/**
 * 從上電開始模擬（電容 0 V、電感 0 A）。
 * base = 不含 555 動態部分的元件（產生器 / 市電固定在平均值 0）；dyn(q) = 依狀態產生 555 動態元件
 */
export function simulate555(base: Element[], ground: string, chips: BoardPart[], net: (h: string) => string): Ne555Sim {
  const t0 = now();
  const q: Record<string, boolean> = Object.fromEntries(chips.map((c) => [c.id, true]));
  const capIds = base.filter((e) => e.kind === 'cap').map((e) => e.id);
  const indIds = base.filter((e) => e.kind === 'ind').map((e) => e.id);
  let vc: Record<string, number> = Object.fromEntries(capIds.map((id) => [id, 0]));
  let il: Record<string, number> = Object.fromEntries(indIds.map((id) => [id, 0]));
  const els = () => [...base, ...ne555Dynamic(chips, net, (id) => q[id])];
  const step = (dt: number, guess?: Solution) => {
    const sol = solveCircuit(els(), ground, { dt, vc, il, guess });
    const nvc = { ...vc }, nil = { ...il };
    for (const id of capIds) nvc[id] = sol.el[id].v;
    for (const id of indIds) nil[id] = sol.el[id].i;
    return { sol, nvc, nil };
  };
  const vscale = Math.max(1, ...chips.map((c) => {
    const s = solveCircuit(els(), ground);
    return Math.abs((s.nodeV[net(c.pins[NE.VCC])] ?? 0) - (s.nodeV[net(c.pins[NE.GND])] ?? 0));
  }));

  // 沒有電容：555 只會停在某個狀態（或在一步內來回跳）→ 直接算到穩定
  let dt = 1e-6, t = 0, last: Solution | undefined;
  const flips: number[] = []; // 第一顆 555 的 Q 由 0 → 1 的時間
  const lead = chips[0].id;
  while (now() - t0 < BUDGET_MS && t < 600) {
    const r = step(dt, last);
    const dv = Math.max(0, ...capIds.map((id) => Math.abs(r.nvc[id] - vc[id])));
    // 電容一步變化太大：縮小時間步重來（保持門檻判斷的精度）
    if (dv > 0.003 * vscale && dt > 1e-9) { dt /= 3; continue; }
    vc = r.nvc; il = r.nil; last = r.sol; t += dt;
    let flippedUp = false, flipped = false;
    for (const c of chips) {
      const nq = ne555Next(c, r.sol, net, q[c.id]);
      if (nq !== q[c.id]) { flipped = true; if (c.id === lead && nq) flippedUp = true; q[c.id] = nq; }
    }
    if (flippedUp) {
      flips.push(t);
      const n = flips.length;
      if (n >= 4) {
        const p1 = flips[n - 1] - flips[n - 2], p2 = flips[n - 2] - flips[n - 3];
        if (Math.abs(p1 - p2) < 0.01 * p1) return { per: record(p1), final: r.sol, q: { ...q } };
      }
    }
    if (flipped) dt = Math.max(1e-9, dt / 4); // 剛翻轉：從小步開始
    else if (dv < 0.001 * vscale) dt = Math.min(dt * 1.6, 0.05);
    if (!capIds.length && !flipped && t > 1e-3) break;
  }
  return { per: null, final: last ?? solveCircuit(els(), ground), q: { ...q } };

  /** 從剛翻成 Q = 1 的那一刻開始，用固定時間步錄一個週期 */
  function record(period: number): Periodic {
    const M = STEPS_PER_PERIOD, h = period / M;
    const sols: Solution[] = [];
    let guess: Solution | undefined;
    for (let i = 0; i < M; i++) {
      const r = step(h, guess);
      vc = r.nvc; il = r.nil; guess = r.sol;
      sols.push(r.sol);
      for (const c of chips) q[c.id] = ne555Next(c, r.sol, net, q[c.id]);
    }
    return { period, sols, periods: flips.length, settled: true };
  }
}

/** 一個週期的平均解（振盪太快時 LED / 電表看到的是平均值，就像人眼的視覺暫留） */
export function averageSolution(sols: Solution[]): Solution {
  const nodeV: Record<string, number> = {}, el: Solution['el'] = {};
  const n = sols.length;
  for (const s of sols) {
    for (const [k, v] of Object.entries(s.nodeV)) nodeV[k] = (nodeV[k] ?? 0) + v / n;
    for (const [k, r] of Object.entries(s.el)) {
      const a = el[k] ?? (el[k] = { v: 0, i: 0, p: 0, mode: r.mode });
      a.v += r.v / n; a.i += r.i / n; a.p += r.p / n;
      if (r.vin !== undefined) a.vin = (a.vin ?? 0) + r.vin / n;
    }
  }
  return { nodeV, el, converged: true };
}

/** 從一個週期的解算出 OUT 的頻率與工作週期（給檢視器） */
export function ne555Stats(per: Periodic, p: BoardPart, net: (h: string) => string) {
  const out = per.sols.map((s) => (s.nodeV[net(p.pins[NE.OUT])] ?? 0) - (s.nodeV[net(p.pins[NE.GND])] ?? 0));
  const hi = Math.max(...out), lo = Math.min(...out), mid = (hi + lo) / 2;
  const duty = out.filter((v) => v > mid).length / out.length;
  return { f: 1 / per.period, period: per.period, duty, hi, lo };
}
