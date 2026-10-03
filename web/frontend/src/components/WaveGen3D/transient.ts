// 暫態模擬（有電容 / 電感時用）：產生器是週期訊號，電路最後會進入「週期穩態」。
//   1. 先用產生器的平均電壓求直流解，當電容電壓 / 電感電流的起始值（大電容這樣起步幾乎就在穩態附近）
//   2. 每個週期切 M 步，用後向尤拉法一步一步解（circuit.ts 的 opts.dt）
//   3. 每個週期結束時記下電容電壓 / 電感電流。大時間常數（例如 1 kΩ × 100 µF = 0.1 s 配 1 kHz 訊號）每個週期只前進一點點，
//      所以用連續三個週期估計收斂比例 ρ，直接外插到穩態（Aitken 加速），再繼續跑到估計誤差夠小（或時間預算用完）
//      最後留下最後一個週期的 M 個解
// 示波器 / 三用電表 / 頻譜分析儀再依時間（相位）查這 M 個解
import { solveCircuit, type Element, type Solution } from './circuit.js';
import { sampleWave, waveMean, type GenSettings } from './waveform.js';
import type { BoardPart } from './boardParts.js';

export const STEPS_PER_PERIOD = 256;
const MAX_PERIODS = 80;
const BUDGET_MS = 300;

export interface Periodic {
  period: number;
  sols: Solution[]; // sols[j] = 相位 j / M 時的解
  periods: number; // 實際模擬了幾個週期
  settled: boolean; // 是否已經收斂到週期穩態
}

/** 有沒有需要暫態模擬的零件（電容、電感；燒毀的當開路不算） */
export const hasReactive = (parts: BoardPart[]) => parts.some((p) => !p.burnt && (p.kind === 'cap' || p.kind === 'ind' || p.kind === 'xfmr'));

/** 有電流狀態的元件：電感（id）、變壓器兩個繞組（id:p、id:s） */
const currentIds = (e: Element) => (e.kind === 'ind' ? [e.id] : e.kind === 'xfmr' ? [`${e.id}:p`, `${e.id}:s`] : []);

/** els 裡 id = 'fg' 的訊號源會被逐步改成產生器當下的電壓 */
export function simulatePeriodic(els: Element[], ground: string, gen: GenSettings, M = STEPS_PER_PERIOD): Periodic {
  const list = els.map((e) => ({ ...e })) as Element[];
  const fg = list.find((e) => e.id === 'fg' && e.kind === 'src') as Extract<Element, { kind: 'src' }> | undefined;
  const period = 1 / gen.frequency, dt = period / M;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 1. 直流起點
  if (fg) fg.v = waveMean(gen);
  let prev = solveCircuit(list, ground);
  const vc: Record<string, number> = {}, il: Record<string, number> = {};
  for (const e of list) {
    if (e.kind === 'cap') vc[e.id] = prev.el[e.id]?.v ?? 0;
    for (const k of currentIds(e)) il[k] = prev.el[k]?.i ?? 0;
  }

  // 2. 一個週期一個週期跑
  const sols: Solution[] = new Array(M);
  const capIds = list.filter((e) => e.kind === 'cap').map((e) => e.id);
  const curIds = list.flatMap(currentIds);
  const state = () => [...capIds.map((id) => vc[id]), ...curIds.map((id) => il[id])];
  const setState = (x: number[]) => { capIds.forEach((id, k) => { vc[id] = x[k]; }); curIds.forEach((id, k) => { il[id] = x[capIds.length + k]; }); };
  let hist: number[][] = [state()];
  let settled = false, periods = 0;
  while (periods < MAX_PERIODS) {
    for (let i = 0; i < M; i++) {
      if (fg) fg.v = sampleWave(gen, (i + 1) * dt);
      const sol = solveCircuit(list, ground, { dt, vc, il, guess: prev });
      for (const e of list) {
        if (e.kind === 'cap') vc[e.id] = sol.el[e.id].v;
        for (const k of currentIds(e)) il[k] = sol.el[k].i;
      }
      sols[(i + 1) % M] = sol;
      prev = sol;
    }
    periods++;
    // 3. 估計離穩態還有多遠；收斂太慢就外插
    hist = [...hist.slice(-2), state()];
    if (hist.length === 3) {
      const [s0, s1, s2] = hist;
      const d1 = s1.map((v, k) => v - s0[k]), d2 = s2.map((v, k) => v - s1[k]);
      const dot = (a: number[], b: number[]) => a.reduce((acc, v, k) => acc + v * b[k], 0);
      const n1 = dot(d1, d1);
      const rho = n1 > 0 ? dot(d2, d1) / n1 : 0;
      const step = Math.max(0, ...d2.map(Math.abs));
      const mag = Math.max(1e-3, ...s2.map(Math.abs));
      const remain = step * (rho > 0 && rho < 1 ? 1 / (1 - rho) : 1);
      if (remain < 1e-5 * mag || step < 1e-12) { settled = true; break; }
      if (rho > 0.2 && rho < 0.99999) {
        setState(s2.map((v, k) => v + (d2[k] * rho) / (1 - rho)));
        hist = [state()];
      }
    }
    if (now() - t0 > BUDGET_MS && periods >= 3) break;
  }
  return { period, sols, periods, settled };
}
