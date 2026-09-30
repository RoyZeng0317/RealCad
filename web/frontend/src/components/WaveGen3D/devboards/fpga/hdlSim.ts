// FPGA 電路模擬器：執行 verilogElab 產生的程式（只含索引與數字），週期式模擬
//   每次輸入改變 → 組合邏輯依序算一遍 → 偵測時脈邊緣 → 觸發的 always 區塊一起算 → 非阻隔指定一次更新 → 再算組合邏輯（衍生時脈也會觸發）
import { HdlError } from './verilogLang.js';
import type { Design } from './verilogElab.js';

const M = (x: number, w: number) => (w >= 32 ? x >>> 0 : x & (2 ** w - 1));
const H = {
  bit: (v: number, off: number, w: number) => (off < 0 || off >= w ? 0 : Math.floor(v / 2 ** off) % 2),
  part: (v: number, off: number, w: number) => (off < 0 ? M(v * 2 ** -off, w) : M(Math.floor(v / 2 ** off), w)),
  mr: (a: Float64Array, i: number) => (i >= 0 && i < a.length ? a[i] : 0),
  mw: (a: Float64Array, i: number, v: number) => { if (i >= 0 && i < a.length) a[i] = v; },
  rep: (v: number, w: number, n: number) => { let r = 0; for (let k = 0; k < n; k++) r = r * 2 ** w + v; return r; },
  par: (x: number) => { let p = 0; while (x) { p ^= x & 1; x = Math.floor(x / 2); } return p; },
  shl: (a: number, b: number, w: number) => (b >= w ? 0 : M(a * 2 ** b, w)),
  shr: (a: number, b: number) => (b >= 32 ? 0 : Math.floor(a / 2 ** b)),
  div: (a: number, b: number) => (b === 0 ? 0 : Math.floor(a / b)),
  mod: (a: number, b: number) => (b === 0 ? 0 : a % b),
  /** 把 val（width 位元）寫進 old 的第 off 位開始 */
  ins: (old: number, val: number, off: number, width: number) => {
    if (off < 0 || off + width > 32) return old;
    const lo = 2 ** off;
    const cur = Math.floor(old / lo) % 2 ** width;
    return old - cur * lo + (val % 2 ** width) * lo;
  },
  loop: (line: number) => { throw new HdlError('for 迴圈超過 65536 次（是不是條件寫錯？）', line); },
};

export interface WatchStat { n: number; first: number; lastAt: number; cyc: number }

type Fn = (v: Float64Array, m: Float64Array[], nb: number[], Mf: typeof M, Hf: typeof H) => void;
const compileFn = (code: string): Fn => new Function('v', 'm', 'nb', 'M', 'H', `"use strict";${code}`) as Fn;

export class HdlSim {
  v: Float64Array;
  m: Float64Array[];
  private nb: number[] = [];
  private settleFn: Fn;
  private blocks: { edges: { sig: number; edge: 'pos' | 'neg' }[]; fn: Fn }[];
  private edgeSigs: number[];
  private prev: Float64Array;
  cycles = 0;
  /** 監看一個位元（喇叭）：每個時脈週期檢查一次，依時脈分別記下切換次數與第一次／最後一次切換在第幾個週期 */
  watch: { sig: number; div: number; last: number; stats: Map<number, WatchStat> } | null = null;

  constructor(public d: Design) {
    this.v = new Float64Array(d.sigs.length);
    d.sigs.forEach((s, i) => { this.v[i] = s.init; });
    this.m = d.mems.map((mm) => new Float64Array(mm.depth));
    this.settleFn = compileFn(d.settleCode);
    this.blocks = d.blocks.map((b) => ({ edges: b.edges, fn: compileFn(b.code) }));
    this.edgeSigs = [...new Set(d.blocks.flatMap((b) => b.edges.map((e) => e.sig)))];
    if (d.initCode) compileFn(d.initCode)(this.v, this.m, this.nb, M, H);
    this.settleFn(this.v, this.m, this.nb, M, H);
    this.prev = new Float64Array(d.sigs.length);
    this.edgeSigs.forEach((s) => { this.prev[s] = this.v[s] % 2; });
  }

  set(sig: number, val: number) { this.v[sig] = M(val, this.d.sigs[sig].width); }

  /** 輸入改變後把電路穩定下來 */
  propagate() {
    const { v, m, nb } = this;
    this.settleFn(v, m, nb, M, H);
    for (let iter = 0; iter < 64; iter++) {
      let fired: typeof this.blocks | null = null;
      for (const b of this.blocks) {
        for (const e of b.edges) {
          const p = this.prev[e.sig], c = v[e.sig] % 2;
          if (e.edge === 'pos' ? p === 0 && c === 1 : p === 1 && c === 0) { (fired ??= []).push(b); break; }
        }
      }
      for (const s of this.edgeSigs) this.prev[s] = v[s] % 2;
      if (!fired) return;
      nb.length = 0;
      for (const b of fired) b.fn(v, m, nb, M, H);
      for (let k = 0; k < nb.length; k += 4) {
        const i = nb[k];
        if (i >= 0) v[i] = H.ins(v[i], nb[k + 3], nb[k + 1], nb[k + 2]);
        else H.mw(m[-1 - i], nb[k + 1], nb[k + 3]);
      }
      this.settleFn(v, m, nb, M, H);
    }
    throw new HdlError('時脈回授在同一個時間點觸發超過 64 次，電路無法穩定（衍生時脈互相觸發？）', 0);
  }

  /** 讓某個時脈跑 n 個週期（上升 + 下降） */
  clock(sig: number, n: number) {
    const w = this.watch;
    let st: WatchStat | undefined;
    if (w) { st = w.stats.get(sig); if (!st) w.stats.set(sig, (st = { n: 0, first: 0, lastAt: 0, cyc: 0 })); }
    for (let k = 0; k < n; k++) {
      this.v[sig] = 1; this.propagate();
      this.v[sig] = 0; this.propagate();
      if (w && st) {
        st.cyc++;
        const b = Math.floor(this.v[w.sig] / w.div) % 2;
        if (b !== w.last) { w.last = b; if (st.n++ === 0) st.first = st.cyc; st.lastAt = st.cyc; }
      }
    }
    this.cycles += n;
  }
}
