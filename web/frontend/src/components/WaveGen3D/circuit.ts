// 麵包板直流電路求解器（MNA + 牛頓法）：電源供應器 CV/CC、電阻、1N400x 二極體、LT1117-3.3 穩壓 IC
// 純函式，不依賴 React/three；每次麵包板或電源設定改變時重算一次
// 電容、電感、電晶體（Ebers-Moll）：直流時電容開路、電感 = 直流電阻；給 opts.dt 時用後向尤拉法做一個時間步（暫態模擬，見 transient.ts）

export type LdoMode = 'reg' | 'drop' | 'ilim' | 'off';

export type Element =
  | { kind: 'psu'; id: string; p: string; n: string; vSet: number; iSet: number; on: boolean }
  | { kind: 'res'; id: string; a: string; b: string; r: number }
  | { kind: 'diode'; id: string; a: string; k: string; bv: number; is?: number; nvt?: number }
  // 戴維寧電壓源（電壓 v、內阻 r）：開發板 GPIO 輸出、5V/3V3 電源腳；以諾頓等效蓋進矩陣，不需要額外電流變數
  | { kind: 'src'; id: string; p: string; n: string; v: number; r: number }
  | { kind: 'ldo'; id: string; vin: string; vout: string; gnd: string; enabled: boolean }
  | { kind: 'cap'; id: string; a: string; b: string; c: number }
  | { kind: 'ind'; id: string; a: string; b: string; l: number; r: number }
  // 雙極性電晶體：pol = 1 NPN、−1 PNP
  | { kind: 'bjt'; id: string; c: string; b: string; e: string; pol: 1 | -1; is: number; bf: number; br: number }
  // 變壓器 = 耦合電感：一次側 p1→n1（L1、R1）、二次側 p2→n2（L2、R2），互感 M = k·√(L1·L2)
  //   直流時兩個繞組各自只是一顆電阻（直流過不了變壓器）；暫態時用後向尤拉法解耦合的 2×2 方程式
  | { kind: 'xfmr'; id: string; p1: string; n1: string; p2: string; n2: string; l1: number; l2: number; k: number; r1: number; r2: number };

/** 暫態模擬一步：dt 秒；vc = 上一步電容電壓（a−b）、il = 上一步電感電流（a→b） */
export interface SolveOpts {
  dt?: number;
  vc?: Record<string, number>;
  il?: Record<string, number>; // 變壓器兩個繞組用 id:p、id:s
  guess?: Solution; // 上一步的解：當牛頓法的起點，收斂比較快
}

/** 每種元件接到哪些節點 */
function terminals(e: Element): string[] {
  switch (e.kind) {
    case 'psu': case 'src': return [e.p, e.n];
    case 'res': case 'cap': case 'ind': return [e.a, e.b];
    case 'diode': return [e.a, e.k];
    case 'bjt': return [e.c, e.b, e.e];
    case 'xfmr': return [e.p1, e.n1, e.p2, e.n2];
    default: return [e.vin, e.vout, e.gnd];
  }
}

export interface ElementResult {
  i: number; // 元件電流（電阻 a→b、二極體 陽極→陰極、LDO 輸出電流、電源輸出電流）
  v: number; // 元件兩端電壓（LDO 為 Vout−GND）
  p: number; // 消耗功率 W
  mode?: string;
  vin?: number; // LDO 輸入電壓（對 GND 腳）
  ib?: number; // 電晶體基極電流（NPN 流入為正）
  vbe?: number; // 電晶體 VBE（PNP 為 VEB）
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
const VT = 0.025852;

/** 超過 40 的指數線性外插，避免牛頓法溢位（SPICE 的 limexp） */
const limexp = (x: number) => (x < 40 ? Math.exp(x) : Math.exp(40) * (1 + x - 40));
const dlimexp = (x: number) => (x < 40 ? Math.exp(x) : Math.exp(40));

export function diodeI(vd: number, bv: number, is = D_IS, nvt = D_NVT): { i: number; g: number } {
  const f = limexp(vd / nvt);
  let i = is * (f - 1);
  let g = (is * dlimexp(vd / nvt)) / nvt;
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
export function solveCircuit(elements: Element[], ground: string, opts: SolveOpts = {}): Solution {
  const nets = new Set<string>();
  for (const e of elements) for (const n of terminals(e)) nets.add(n);
  const { dt, vc = {}, il = {}, guess } = opts;
  nets.delete(ground);
  const nodeList = [...nets];
  const idx = new Map(nodeList.map((n, i) => [n, i]));
  const N = nodeList.length;
  const ni = (n: string) => (n === ground ? -1 : idx.get(n)!);

  // 非線性狀態：電源 CV/CC、LDO 模式、二極體電壓
  const psuMode = new Map<string, 'CV' | 'CC'>();
  const ldoMode = new Map<string, LdoMode>();
  const vd = new Map<string, number>();
  const gv = (n: string) => (guess && n in guess.nodeV ? guess.nodeV[n] : null);
  // 電晶體兩個接面的電壓（已乘上極性，NPN 正常放大時 vbe > 0、vbc < 0）
  const jbe = new Map<string, number>(), jbc = new Map<string, number>();
  for (const e of elements) {
    if (e.kind === 'psu') psuMode.set(e.id, guess?.el[e.id]?.mode === 'CC' ? 'CC' : 'CV');
    if (e.kind === 'ldo') ldoMode.set(e.id, e.enabled ? ((guess?.el[e.id]?.mode as LdoMode) || 'reg') : 'off');
    if (e.kind === 'diode') {
      const a = gv(e.a), k = gv(e.k);
      vd.set(e.id, a !== null && k !== null ? a - k : 0.6);
    }
    if (e.kind === 'bjt') {
      const b = gv(e.b), c = gv(e.c), em = gv(e.e);
      jbe.set(e.id, b !== null && em !== null ? e.pol * (b - em) : 0.6);
      jbc.set(e.id, b !== null && c !== null ? e.pol * (b - c) : -1);
    }
  }

  let x: number[] = nodeList.map((n) => gv(n) ?? 0);
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
        else if (e.kind === 'cap') {
          // 後向尤拉：i = C/dt·(v − v前)；直流時開路
          if (!dt) continue;
          const g = e.c / dt;
          G(e.a, e.b, g);
          I(e.a, e.b, -g * (vc[e.id] ?? 0));
        } else if (e.kind === 'ind') {
          // v = R·i + L/dt·(i − i前) → i = (v + L/dt·i前) / (R + L/dt)；直流時就是 R
          if (!dt) { G(e.a, e.b, 1 / e.r); continue; }
          const k = e.l / dt, g = 1 / (e.r + k);
          G(e.a, e.b, g);
          I(e.a, e.b, g * k * (il[e.id] ?? 0));
        } else if (e.kind === 'bjt') stampBjt(e, jbe.get(e.id)!, jbc.get(e.id)!, G, I, A, b, ni);
        else if (e.kind === 'xfmr') {
          if (!dt) { G(e.p1, e.n1, 1 / e.r1); G(e.p2, e.n2, 1 / e.r2); continue; }
          // [v1; v2] = Z·[i1; i2] − (L/dt)·i前，Z = R + L/dt → i = Y·v + Y·(L/dt)·i前，Y = Z⁻¹
          const { y, j } = xfmrY(e, dt, il[`${e.id}:p`] ?? 0, il[`${e.id}:s`] ?? 0);
          const vccs = (a: string, bb: string, c: string, d: string, g: number) => {
            // 從 a 經繞組流到 bb 的電流 = g·(V(c) − V(d))
            const ia = ni(a), ib = ni(bb), ic = ni(c), id = ni(d);
            if (ia >= 0) { if (ic >= 0) A[ia][ic] += g; if (id >= 0) A[ia][id] -= g; }
            if (ib >= 0) { if (ic >= 0) A[ib][ic] -= g; if (id >= 0) A[ib][id] += g; }
          };
          vccs(e.p1, e.n1, e.p1, e.n1, y[0][0]); vccs(e.p1, e.n1, e.p2, e.n2, y[0][1]);
          vccs(e.p2, e.n2, e.p1, e.n1, y[1][0]); vccs(e.p2, e.n2, e.p2, e.n2, y[1][1]);
          I(e.p1, e.n1, j[0]);
          I(e.p2, e.n2, j[1]);
        }
        else if (e.kind === 'src') { G(e.p, e.n, 1 / e.r); I(e.n, e.p, e.v / e.r); }
        else if (e.kind === 'diode') {
          const v = vd.get(e.id)!;
          const { i, g } = diodeI(v, e.bv, e.is, e.nvt);
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
      // 二極體 / 電晶體接面電壓更新（限制每步變化量，幫助收斂）
      let maxDv = 0;
      const limit = (old: number, nv: number) => {
        const step = nv - old;
        if (Math.abs(step) > 0.3) nv = old + Math.sign(step) * (0.3 + Math.log1p(Math.abs(step) - 0.3) * 0.1);
        maxDv = Math.max(maxDv, Math.abs(nv - old));
        return nv;
      };
      for (const e of elements) {
        if (e.kind === 'diode') vd.set(e.id, limit(vd.get(e.id)!, V(sol, e.a) - V(sol, e.k)));
        if (e.kind === 'bjt') {
          jbe.set(e.id, limit(jbe.get(e.id)!, e.pol * (V(sol, e.b) - V(sol, e.e))));
          jbc.set(e.id, limit(jbc.get(e.id)!, e.pol * (V(sol, e.b) - V(sol, e.c))));
        }
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
      const { i } = diodeI(v, e.bv, e.is, e.nvt);
      el[e.id] = { v, i, p: v * i };
    } else if (e.kind === 'cap') {
      const v = nodeV[e.a] - nodeV[e.b];
      el[e.id] = { v, i: dt ? (e.c / dt) * (v - (vc[e.id] ?? 0)) : 0, p: 0 };
    } else if (e.kind === 'ind') {
      const v = nodeV[e.a] - nodeV[e.b];
      const i = dt ? (v + (e.l / dt) * (il[e.id] ?? 0)) / (e.r + e.l / dt) : v / e.r;
      el[e.id] = { v, i, p: i * i * e.r };
    } else if (e.kind === 'xfmr') {
      const v1 = nodeV[e.p1] - nodeV[e.n1], v2 = nodeV[e.p2] - nodeV[e.n2];
      let i1 = v1 / e.r1, i2 = v2 / e.r2;
      if (dt) {
        const { y, j } = xfmrY(e, dt, il[`${e.id}:p`] ?? 0, il[`${e.id}:s`] ?? 0);
        i1 = y[0][0] * v1 + y[0][1] * v2 + j[0];
        i2 = y[1][0] * v1 + y[1][1] * v2 + j[1];
      }
      el[`${e.id}:p`] = { v: v1, i: i1, p: i1 * i1 * e.r1 };
      el[`${e.id}:s`] = { v: v2, i: i2, p: i2 * i2 * e.r2 };
      // 給檢視器 / 熱模型：v = 二次側電壓、vin = 一次側電壓、i = 二次側電流、ib = 一次側電流
      el[e.id] = { v: v2, vin: v1, i: i2, ib: i1, p: i1 * i1 * e.r1 + i2 * i2 * e.r2 };
    } else if (e.kind === 'bjt') {
      el[e.id] = bjtResult(e, e.pol * (nodeV[e.b] - nodeV[e.e]), e.pol * (nodeV[e.b] - nodeV[e.c]));
    } else if (e.kind === 'src') {
      // i = 從「+」端流出的電流；p = 內阻上的消耗
      const v = nodeV[e.p] - nodeV[e.n];
      const i = (e.v - v) / e.r;
      el[e.id] = { v, i, p: i * i * e.r };
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

type BjtEl = Extract<Element, { kind: 'bjt' }>;

/**
 * Ebers-Moll（傳輸模型）：B–E、B–C 兩個二極體（飽和電流 Is/βF、Is/βR）＋ C→E 的受控電流 Is·(e^(vbe/Vt) − e^(vbc/Vt))。
 * PNP 把電壓、電流方向全部反過來（pol = −1）。在目前的接面電壓附近線性化後蓋進 MNA 矩陣
 */
function stampBjt(
  e: BjtEl, vbe: number, vbc: number,
  G: (p: string, q: string, g: number) => void, I: (p: string, q: string, cur: number) => void,
  A: number[][], b: number[], ni: (n: string) => number,
) {
  const s = e.pol;
  // 兩個接面二極體：NPN 陽極在基極；PNP 陽極在射極 / 集極
  const junction = (v: number, isj: number, other: string) => {
    const { i, g } = diodeI(v, 1e3, isj, VT);
    const [an, ca] = s > 0 ? [e.b, other] : [other, e.b];
    G(an, ca, g);
    I(an, ca, i - g * v);
  };
  junction(vbe, e.is / e.bf, e.e);
  junction(vbc, e.is / e.br, e.c);
  // C→E 受控電流 Ice = s·Ict(vbe, vbc)，線性化：Ice = K + gf·(Vb − Ve) − gr·(Vb − Vc)
  const ef = limexp(vbe / VT), er = limexp(vbc / VT);
  const ict = e.is * (ef - er);
  const gf = (e.is * dlimexp(vbe / VT)) / VT, gr = (e.is * dlimexp(vbc / VT)) / VT;
  const K = s * (ict - gf * vbe + gr * vbc);
  const c = ni(e.c), bb = ni(e.b), em = ni(e.e);
  const add = (row: number, col: number, v: number) => { if (row >= 0 && col >= 0) A[row][col] += v; };
  for (const [row, sign] of [[c, 1], [em, -1]] as const) {
    add(row, bb, sign * (gf - gr));
    add(row, em, -sign * gf);
    add(row, c, sign * gr);
    if (row >= 0) b[row] -= sign * K;
  }
}

/** 電晶體工作點：i = 集極電流（NPN 流入為正、PNP 流出為正）、v = VCE（PNP 為 VEC）、模式 */
function bjtResult(e: BjtEl, vbe: number, vbc: number): ElementResult {
  const ef = limexp(vbe / VT), er = limexp(vbc / VT);
  const ibe = (e.is / e.bf) * (ef - 1), ibc = (e.is / e.br) * (er - 1);
  const ic = e.is * (ef - er) - ibc, ib = ibe + ibc;
  const vce = vbe - vbc;
  const mode = vbe > 0.5 ? (vbc > 0.4 ? 'sat' : 'active') : vbc > 0.5 ? 'reverse' : 'cutoff';
  return { i: ic, ib, v: vce, vbe, p: Math.max(0, ic * vce + ib * vbe), mode };
}

/** 變壓器（耦合電感）的後向尤拉離散化：i = Y·v + j */
function xfmrY(e: Extract<Element, { kind: 'xfmr' }>, dt: number, ip: number, is: number) {
  const m = e.k * Math.sqrt(e.l1 * e.l2);
  const z11 = e.r1 + e.l1 / dt, z12 = m / dt, z22 = e.r2 + e.l2 / dt;
  const det = z11 * z22 - z12 * z12;
  const y = [[z22 / det, -z12 / det], [-z12 / det, z11 / det]];
  const h1 = (e.l1 * ip + m * is) / dt, h2 = (m * ip + e.l2 * is) / dt; // (L/dt)·i前
  return { y, j: [y[0][0] * h1 + y[0][1] * h2, y[1][0] * h1 + y[1][1] * h2] };
}
