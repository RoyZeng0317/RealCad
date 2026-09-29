// 麵包板直流電路求解器（MNA + 牛頓法）：電源供應器 CV/CC、電阻、1N400x 二極體、LT1117-3.3 穩壓 IC
// 純函式，不依賴 React/three；每次麵包板或電源設定改變時重算一次

export type LdoMode = 'reg' | 'drop' | 'ilim' | 'off';

export type Element =
  | { kind: 'psu'; id: string; p: string; n: string; vSet: number; iSet: number; on: boolean }
  | { kind: 'res'; id: string; a: string; b: string; r: number }
  | { kind: 'diode'; id: string; a: string; k: string; bv: number }
  | { kind: 'ldo'; id: string; vin: string; vout: string; gnd: string; enabled: boolean };

export interface ElementResult {
  i: number; // 元件電流（電阻 a→b、二極體 陽極→陰極、LDO 輸出電流、電源輸出電流）
  v: number; // 元件兩端電壓（LDO 為 Vout−GND）
  p: number; // 消耗功率 W
  mode?: string;
  vin?: number; // LDO 輸入電壓（對 GND 腳）
}

export interface Solution {
  nodeV: Record<string, number>;
  el: Record<string, ElementResult>;
  converged: boolean;
}

// 1N400x：Shockley 模型，約 0.68 V @ 10 mA、0.9 V @ 1 A；反向超過 PIV 就崩潰導通
const D_IS = 1e-8, D_NVT = 1.9 * 0.025852;
const BV_IS = 1e-3, BV_NVT = 0.05;
// LT1117-3.3：輸出 3.3 V、壓降 1.1 V、限流 1 A、靜態電流以 1.2 kΩ 近似（6 V 時約 5 mA）
export const LDO_VOUT = 3.3, LDO_DROPOUT = 1.1, LDO_ILIM = 1.0, LDO_RQ = 1200;
const GMIN = 1e-9;

/** 超過 40 的指數線性外插，避免牛頓法溢位（SPICE 的 limexp） */
const limexp = (x: number) => (x < 40 ? Math.exp(x) : Math.exp(40) * (1 + x - 40));
const dlimexp = (x: number) => (x < 40 ? Math.exp(x) : Math.exp(40));

export function diodeI(vd: number, bv: number): { i: number; g: number } {
  const f = limexp(vd / D_NVT);
  let i = D_IS * (f - 1);
  let g = (D_IS * dlimexp(vd / D_NVT)) / D_NVT;
  const x = (-vd - bv) / BV_NVT;
  if (x > -60) {
    i -= BV_IS * limexp(x);
    g += (BV_IS * dlimexp(x)) / BV_NVT;
  }
  return { i, g: g + GMIN };
}

/** 高斯消去（部分主元） */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-18) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * @param ground 參考節點（0 V），通常是電源供應器「−」＝ 麵包板 GND 接線柱
 */
export function solveCircuit(elements: Element[], ground: string): Solution {
  const nets = new Set<string>();
  for (const e of elements) {
    if (e.kind === 'psu') { nets.add(e.p); nets.add(e.n); }
    else if (e.kind === 'res') { nets.add(e.a); nets.add(e.b); }
    else if (e.kind === 'diode') { nets.add(e.a); nets.add(e.k); }
    else { nets.add(e.vin); nets.add(e.vout); nets.add(e.gnd); }
  }
  nets.delete(ground);
  const nodeList = [...nets];
  const idx = new Map(nodeList.map((n, i) => [n, i]));
  const N = nodeList.length;
  const ni = (n: string) => (n === ground ? -1 : idx.get(n)!);

  // 非線性狀態：電源 CV/CC、LDO 模式、二極體電壓
  const psuMode = new Map<string, 'CV' | 'CC'>();
  const ldoMode = new Map<string, LdoMode>();
  const vd = new Map<string, number>();
  for (const e of elements) {
    if (e.kind === 'psu') psuMode.set(e.id, 'CV');
    if (e.kind === 'ldo') ldoMode.set(e.id, e.enabled ? 'reg' : 'off');
    if (e.kind === 'diode') vd.set(e.id, 0.6);
  }

  let x: number[] = new Array(N).fill(0);
  let branchOf = new Map<string, number>();
  let converged = false;
  const V = (sol: number[], n: string) => (n === ground ? 0 : sol[idx.get(n)!]);

  for (let pass = 0; pass < 16; pass++) {
    // 這一輪需要電流變數的元件：CV 的電源、reg/drop 的 LDO
    branchOf = new Map();
    let M = N;
    for (const e of elements) {
      if (e.kind === 'psu' && e.on && psuMode.get(e.id) === 'CV') branchOf.set(e.id, M++);
      if (e.kind === 'ldo') { const m = ldoMode.get(e.id); if (m === 'reg' || m === 'drop') branchOf.set(e.id, M++); }
    }
    x = [...x.slice(0, N), ...new Array(M - N).fill(0)];

    // 牛頓法
    converged = false;
    for (let it = 0; it < 150; it++) {
      const A = Array.from({ length: M }, () => new Array(M).fill(0));
      const b = new Array(M).fill(0);
      const G = (p: string, q: string, g: number) => {
        const i = ni(p), j = ni(q);
        if (i >= 0) A[i][i] += g;
        if (j >= 0) A[j][j] += g;
        if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
      };
      /** 電流 I 從 p 流出、經元件流入 q */
      const I = (p: string, q: string, cur: number) => {
        const i = ni(p), j = ni(q);
        if (i >= 0) b[i] -= cur;
        if (j >= 0) b[j] += cur;
      };
      for (let k = 0; k < N; k++) A[k][k] += GMIN;

      for (const e of elements) {
        if (e.kind === 'res') G(e.a, e.b, 1 / e.r);
        else if (e.kind === 'diode') {
          const v = vd.get(e.id)!;
          const { i, g } = diodeI(v, e.bv);
          G(e.a, e.k, g);
          I(e.a, e.k, i - g * v);
        } else if (e.kind === 'psu') {
          if (!e.on) continue;
          if (psuMode.get(e.id) === 'CC') { I(e.n, e.p, e.iSet); continue; }
          const m = branchOf.get(e.id)!, p = ni(e.p), n = ni(e.n);
          // 分支電流 = 流出「+」端子供給電路的電流
          if (p >= 0) { A[p][m] -= 1; A[m][p] += 1; }
          if (n >= 0) { A[n][m] += 1; A[m][n] -= 1; }
          b[m] = e.vSet;
        } else {
          G(e.vin, e.gnd, 1 / LDO_RQ);
          const mode = ldoMode.get(e.id)!;
          if (mode === 'off') continue;
          if (mode === 'ilim') { I(e.vin, e.vout, LDO_ILIM); continue; }
          // 輸出電流 j 從 VIN 腳取、從 VOUT 腳送出
          const m = branchOf.get(e.id)!, vi = ni(e.vin), vo = ni(e.vout), g = ni(e.gnd);
          if (vi >= 0) A[vi][m] += 1;
          if (vo >= 0) A[vo][m] -= 1;
          if (mode === 'reg') {
            if (vo >= 0) A[m][vo] += 1;
            if (g >= 0) A[m][g] -= 1;
            b[m] = LDO_VOUT;
          } else {
            if (vi >= 0) A[m][vi] += 1;
            if (vo >= 0) A[m][vo] -= 1;
            b[m] = LDO_DROPOUT;
          }
        }
      }
      const sol = solveLinear(A, b);
      if (!sol) break;
      // 二極體電壓更新（限制每步變化量，幫助收斂）
      let maxDv = 0;
      for (const e of elements) {
        if (e.kind !== 'diode') continue;
        const old = vd.get(e.id)!;
        let nv = V(sol, e.a) - V(sol, e.k);
        const step = nv - old;
        if (Math.abs(step) > 0.3) nv = old + Math.sign(step) * (0.3 + Math.log1p(Math.abs(step) - 0.3) * 0.1);
        maxDv = Math.max(maxDv, Math.abs(nv - old));
        vd.set(e.id, nv);
      }
      x = sol;
      if (maxDv < 1e-7) { converged = true; break; }
    }

    // 檢查電源與 LDO 的工作模式是否跟解一致，不一致就換模式重解
    let changed = false;
    for (const e of elements) {
      if (e.kind === 'psu' && e.on) {
        const mode = psuMode.get(e.id)!;
        const vOut = V(x, e.p) - V(x, e.n);
        if (mode === 'CV' && x[branchOf.get(e.id)!] > e.iSet * 1.000001) { psuMode.set(e.id, 'CC'); changed = true; }
        else if (mode === 'CC' && vOut > e.vSet * 1.000001) { psuMode.set(e.id, 'CV'); changed = true; }
      }
      if (e.kind === 'ldo' && e.enabled) {
        const mode = ldoMode.get(e.id)!;
        const vin = V(x, e.vin), vout = V(x, e.vout), vg = V(x, e.gnd);
        const j = branchOf.has(e.id) ? x[branchOf.get(e.id)!] : mode === 'ilim' ? LDO_ILIM : 0;
        let next: LdoMode = mode;
        if (mode === 'reg') {
          if (j < -1e-6) next = 'off';
          else if (j > LDO_ILIM) next = 'ilim';
          else if (vin - vout < LDO_DROPOUT - 1e-9) next = 'drop';
        } else if (mode === 'drop') {
          if (j < -1e-6) next = 'off';
          else if (j > LDO_ILIM) next = 'ilim';
          else if (vout - vg > LDO_VOUT + 1e-9) next = 'reg';
        } else if (mode === 'ilim') {
          if (vout - vg > LDO_VOUT + 1e-9) next = 'reg';
          else if (vin - vout < LDO_DROPOUT - 1e-9) next = 'drop';
        } else if (vin - vout > LDO_DROPOUT + 1e-6 && vout - vg < LDO_VOUT - 1e-6) next = 'reg';
        if (next !== mode) { ldoMode.set(e.id, next); changed = true; }
      }
    }
    if (!changed) break;
  }

  const nodeV: Record<string, number> = { [ground]: 0 };
  nodeList.forEach((n, i) => { nodeV[n] = x[i] ?? 0; });
  const el: Record<string, ElementResult> = {};
  for (const e of elements) {
    if (e.kind === 'res') {
      const v = nodeV[e.a] - nodeV[e.b];
      el[e.id] = { v, i: v / e.r, p: (v * v) / e.r };
    } else if (e.kind === 'diode') {
      const v = nodeV[e.a] - nodeV[e.k];
      const { i } = diodeI(v, e.bv);
      el[e.id] = { v, i, p: v * i };
    } else if (e.kind === 'psu') {
      const v = e.on ? nodeV[e.p] - nodeV[e.n] : 0;
      const mode = e.on ? psuMode.get(e.id)! : 'OFF';
      const i = !e.on ? 0 : mode === 'CC' ? e.iSet : x[branchOf.get(e.id)!];
      el[e.id] = { v, i, p: v * i, mode };
    } else {
      const mode = e.enabled ? ldoMode.get(e.id)! : 'off';
      const vin = nodeV[e.vin] - nodeV[e.gnd], vout = nodeV[e.vout] - nodeV[e.gnd];
      const j = mode === 'reg' || mode === 'drop' ? x[branchOf.get(e.id)!] : mode === 'ilim' ? LDO_ILIM : 0;
      el[e.id] = {
        v: vout, vin, i: j, mode,
        p: (nodeV[e.vin] - nodeV[e.vout]) * j + (vin * vin) / LDO_RQ,
      };
    }
  }
  return { nodeV, el, converged };
}
