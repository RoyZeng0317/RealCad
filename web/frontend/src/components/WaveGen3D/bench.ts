// 整張實驗桌的直流電路：電源供應器（+ = 麵包板 Va、− = GND）＋ 負載電阻 ＋ 麵包板上的零件
// 依輸入物件參照做快取，React 元件與 useFrame 都可以呼叫 getBench() 而不重複求解
import { useBoard } from './boardStore.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { useWaveLab } from './waveStore.js';
import { waveMean } from './waveform.js';
import { netOf, postKey, type HoleKey } from './boardModel.js';
import { solveCircuit, type Element, type Solution } from './circuit.js';
import {
  DIODE_PIV, LDO_VIN_MAX, ledModel, POT_END_R, CAP_MODELS, CAP_REVERSE_MAX, BJT_MODELS, indDcr, xfmrParams, ctxParams, MAINS_VRMS, MAINS_F, ldrOhm, BATT_MODELS, type BoardPart,
} from './boardParts.js';
import type { PsuReading, PsuSettings } from './psu.js';
import { useDev, type Issue } from './devboards/devStore.js';
import { devElements, devIssues, type DevState, type Damage } from './devboards/devCircuit.js';
import { DEV_KINDS, type DevKind } from './devboards/boardDefs.js';
import { useChips, type ChipRt } from './chips/chipStore.js';
import { chipElements } from './chips/chipCircuit.js';
import { useDm, dmSpec, type MeterSpec } from './dmStore.js';

export interface Bench {
  sol: Solution;
  psu: PsuReading;
  loadP: number;
  netOfHole: (k: HoleKey) => string;
  holeV: (k: HoleKey) => number | null; // 沒接到任何元件的孔回傳 null
  overVoltage: string[]; // 要標成損壞的零件：輸入超過 15 V 的 LT1117、過壓或反接的電解電容
  devIssues: Record<DevKind, Issue[]>;
  devDamage: Damage[];
}

/** 跳線把兩組孔接在一起：用 union-find 合併網路 */
function mergeNets(parts: BoardPart[]) {
  const parent = new Map<string, string>();
  const find = (n: string): string => {
    const p = parent.get(n);
    if (!p || p === n) return n;
    const r = find(p);
    parent.set(n, r);
    return r;
  };
  for (const w of parts) {
    if (w.kind !== 'wire') continue;
    const a = find(netOf(w.pins[0])), b = find(netOf(w.pins[1]));
    // 讓 GND 永遠當代表，參考節點名稱才固定
    if (a !== b) { if (b === 'P:GND') parent.set(a, b); else parent.set(b, a); }
  }
  return { hole: (k: HoleKey) => find(netOf(k)), net: find };
}

let cache: { key: unknown[]; bench: Bench } | null = null;

/** 函數產生器接到麵包板時的訊號源：p = 紅 +、n = 黑 −，v = 這一瞬間的輸出電壓 */
export interface FgSource { p: HoleKey; n: HoleKey; v: number }
export const FG_ROUT = 50; // 產生器輸出內阻 Ω

/**
 * 儀器的地（大地）：函數產生器 BNC 外殼（黑線 −）與示波器、頻譜分析儀黑棒，在真實實驗室裡都經過儀器外殼、電源線接到同一個大地。
 * 所以產生器 − 與示波器 − 夾在不同地方時，電流可以經由大地流回產生器（這也是「接地夾夾錯地方會短路」的原因）。
 * 電源供應器輸出是浮接的，只經過漏電跟大地相連。
 */
export function earthHoles(): HoleKey[] {
  const { leads } = useBoard.getState();
  return [leads.fg?.[1], leads.ch1?.[1], leads.ch2?.[1], leads.sa?.[1]].filter((h): h is HoleKey => !!h);
}
const EARTH = 'EARTH';

/** 整張實驗桌的電路元件（直流解與暫態模擬共用）；net = 孔 → 網路名稱 */
export function benchElements(psu: PsuSettings, loadR: number, parts: BoardPart[], tsd: Record<string, boolean>, dev: DevState, chips: Record<string, ChipRt> = {}, fg: FgSource | null = null, earth: HoleKey[] = [], meter: MeterSpec | null = null) {
  const merged = mergeNets(parts);
  const net = merged.hole;
  const VA = net(postKey('Va')), GND = net(postKey('GND'));
  const els: Element[] = [
    { kind: 'psu', id: 'psu', p: VA, n: GND, vSet: psu.vSet, iSet: psu.iSet, on: psu.power && psu.output },
  ];
  if (isFinite(loadR)) els.push({ kind: 'res', id: 'load', a: VA, b: GND, r: loadR });
  for (const p of parts) {
    if (p.kind === 'resistor' && !p.burnt) els.push({ kind: 'res', id: p.id, a: net(p.pins[0]), b: net(p.pins[1]), r: p.value! });
    // 1N400x 燒毀時通常是短路
    if (p.kind === 'diode') {
      els.push(p.burnt
        ? { kind: 'res', id: p.id, a: net(p.pins[0]), b: net(p.pins[1]), r: 0.05 }
        : { kind: 'diode', id: p.id, a: net(p.pins[0]), k: net(p.pins[1]), bv: DIODE_PIV[p.model!] });
    }
    // LED 燒毀是開路
    if (p.kind === 'led' && !p.burnt) {
      els.push({ kind: 'diode', id: p.id, a: net(p.pins[0]), k: net(p.pins[1]), ...ledModel(p.ledColor ?? 'red') });
    }
    if (p.kind === 'ldo') {
      els.push({
        kind: 'ldo', id: p.id, gnd: net(p.pins[0]), vout: net(p.pins[1]), vin: net(p.pins[2]),
        enabled: !p.burnt && !tsd[p.id],
      });
    }
    // 類比零件（燒毀 / 損壞都當開路）
    if (p.burnt) continue;
    const [a, b, c] = p.pins.map(net);
    if (p.kind === 'pot') {
      // 可變電阻 = 兩顆串聯電阻：腳 1–W 是 R·pos、W–腳 3 是 R·(1 − pos)
      const r = p.value!, k = p.pos ?? 0.5;
      els.push({ kind: 'res', id: `${p.id}:1`, a, b, r: Math.max(POT_END_R, r * k) });
      els.push({ kind: 'res', id: `${p.id}:2`, a: b, b: c, r: Math.max(POT_END_R, r * (1 - k)) });
    }
    if (p.kind === 'cap') els.push({ kind: 'cap', id: p.id, a, b, c: CAP_MODELS[p.capModel ?? '100u50'].c });
    if (p.kind === 'ind') els.push({ kind: 'ind', id: p.id, a, b, l: p.value!, r: indDcr(p.value!) });
    if (p.kind === 'bjt') {
      const m = BJT_MODELS[p.bjtModel ?? '2N3904'];
      els.push({ kind: 'bjt', id: p.id, e: a, b, c, pol: m.pol, is: m.is, bf: m.bf, br: m.br });
    }
    // 變壓器：耦合電感（一次側 P1→P2、二次側 S1→S2）
    if (p.kind === 'xfmr') {
      const { l1, l2, k, r1, r2 } = xfmrParams(p.xfmrModel ?? '2:1');
      els.push({ kind: 'xfmr', id: p.id, p1: a, n1: b, p2: c, n2: net(p.pins[3]), l1, l2, k, r1, r2 });
    }
    // 光敏電阻 = 依照度變化的電阻；電池 = 電壓源 + 內阻（+ 腳在 pins[0]）
    if (p.kind === 'ldr') els.push({ kind: 'res', id: p.id, a, b, r: ldrOhm(p.ldrModel ?? 'GL5528', p.lux ?? 100) });
    if (p.kind === 'batt') { const m = BATT_MODELS[p.battModel ?? '9V']; els.push({ kind: 'src', id: p.id, p: a, n: b, v: m.v, r: m.r }); }
    // 中心抽頭變壓器：一次側接在零件自己的市電插頭上（內部節點，不在麵包板上）；二次側兩個半繞組 A→COM、COM→B
    if (p.kind === 'ctx') {
      const q = ctxParams(p.ctxModel ?? '12');
      const L = `${p.id}:L`, N = `${p.id}:N`;
      if (p.plugged !== false) els.push({ kind: 'src', id: `${p.id}:ac`, p: L, n: N, v: 0, r: 0.5, ac: { vpk: MAINS_VRMS * Math.SQRT2, f: MAINS_F } });
      els.push({ kind: 'mxfmr', id: p.id, k: q.k, w: [
        { p: L, n: N, l: q.l1, r: q.r1 }, { p: a, n: b, l: q.lh, r: q.rh }, { p: b, n: c, l: q.lh, r: q.rh },
      ] });
    }
  }
  els.push(...devElements(dev, merged.net, GND));
  els.push(...chipElements(parts, chips, net));
  if (fg) {
    els.push({ kind: 'src', id: 'fg', p: net(fg.p), n: net(fg.n), v: fg.v, r: FG_ROUT });
  }
  if (earth.length) {
    // 產生器 − 與示波器接地夾都接大地；大地經漏電跟電源供應器的 GND 相連（浮接電源）
    earth.forEach((h, i) => els.push({ kind: 'res', id: `earth:${i}`, a: net(h), b: EARTH, r: 0.05 }));
    els.push({ kind: 'res', id: 'earth:leak', a: EARTH, b: GND, r: 1e6 });
  }
  // 桌上型萬用電表（浮接，不接大地）：電流檔串入分流電阻、電阻 / 二極體檔送出測試電流
  if (meter) {
    const [a, b] = meter.pins.map(net);
    if (meter.kind === 'shunt') els.push({ kind: 'res', id: 'dm:shunt', a, b, r: meter.r });
    else els.push({ kind: 'src', id: 'dm:test', p: a, n: b, v: meter.v, r: meter.r });
  }
  return { els, merged, net, GND };
}

/** 可變電阻拆成兩顆電阻求解，結果合併回零件 id（給檢視器、熱模型用） */
export function mergePotResults(parts: BoardPart[], sol: Solution) {
  for (const p of parts) {
    if (p.kind !== 'pot') continue;
    const r1 = sol.el[`${p.id}:1`], r2 = sol.el[`${p.id}:2`];
    if (!r1 || !r2) continue;
    sol.el[p.id] = { v: r1.v + r2.v, i: r1.i, p: r1.p + r2.p }; // v = 腳 1 對腳 3、i = 從腳 1 流進
  }
}

export function computeBench(psu: PsuSettings, loadR: number, parts: BoardPart[], tsd: Record<string, boolean>, dev: DevState, chips: Record<string, ChipRt> = {}, fg: FgSource | null = null, earth: HoleKey[] = [], meter: MeterSpec | null = null): Bench {
  const { els, merged, net, GND } = benchElements(psu, loadR, parts, tsd, dev, chips, fg, earth, meter);
  const sol = solveCircuit(els, GND);
  mergePotResults(parts, sol);
  const di = devIssues(dev, sol, merged.net);
  const r = sol.el.psu;
  const mode = r.mode === 'CC' ? 'CC' : r.mode === 'CV' ? 'CV' : 'OFF';
  const overVoltage = parts
    .filter((p) => !p.burnt && (
      (p.kind === 'ldo' && (sol.el[p.id]?.vin ?? 0) > LDO_VIN_MAX)
      || (p.kind === 'cap' && capDamaged(p, sol.el[p.id]?.v ?? 0))))
    .map((p) => p.id);
  return {
    sol,
    psu: { v: r.v, i: r.i, p: r.p, mode },
    loadP: isFinite(loadR) ? (r.v * r.v) / loadR : 0,
    netOfHole: net,
    holeV: (k) => {
      const n = net(k);
      return n in sol.nodeV ? sol.nodeV[n] : null;
    },
    overVoltage,
    devIssues: di.issues,
    devDamage: di.damage,
  };
}

/** 電解電容：超過額定電壓、或反接超過 1 V 就損壞（真實電容會鼓起、漏液） */
export const capDamaged = (p: BoardPart, v: number) => v > CAP_MODELS[p.capModel ?? '100u50'].v || v < -CAP_REVERSE_MAX;

/** 三用電表讀值 = 紅棒電壓 − 黑棒電壓；任一支探棒沒插、或插的點沒有接到電路就回傳 null */
export function meterV(b: Bench, red: HoleKey | null, black: HoleKey | null): number | null {
  if (!red || !black) return null;
  const r = b.holeV(red), k = b.holeV(black);
  return r === null || k === null ? null : r - k;
}

/** 產生器接到麵包板時，直流電路（三用電表、零件工作點）用輸出的平均值 */
export function fgDc(): FgSource | null {
  const lead = useBoard.getState().leads.fg;
  if (!lead) return null;
  return { p: lead[0], n: lead[1], v: waveMean(useWaveLab.getState().gen) };
}

export function getBench(): Bench {
  const ps = usePsuLab.getState();
  const wl = useWaveLab.getState();
  const bs = useBoard.getState();
  const ds = useDev.getState();
  // 只有會影響電路的開發板狀態才放進快取 key（序列埠輸出改變不用重算電路）
  const cs = useChips.getState();
  const key = [ps.psu, ps.loadIdx, ps.burnt, bs.parts, bs.tsd, ds.conf, cs.elec, bs.leads, bs.leads.fg ? wl.gen : null, useDm.getState().dm,
    ...DEV_KINDS.flatMap((k) => [ds.rt[k].pins, ds.rt[k].dead, ds.rt[k].tripped])];
  if (cache && cache.key.every((v, i) => v === key[i])) return cache.bench;
  const bench = computeBench(ps.psu, loadResistance(ps), bs.parts, bs.tsd, ds, cs.rt, fgDc(), earthHoles(), dmSpec());
  cache = { key, bench };
  return bench;
}

/** React 用：訂閱會影響電路的狀態，改變時重新取得解 */
export function useBench(): Bench {
  usePsuLab((s) => s.psu);
  usePsuLab((s) => s.loadIdx);
  usePsuLab((s) => s.burnt);
  useBoard((s) => s.parts);
  useBoard((s) => s.tsd);
  useDev((s) => s.conf);
  useDev((s) => s.rt);
  useChips((s) => s.elec);
  useBoard((s) => s.leads);
  useWaveLab((s) => s.gen);
  useDm((s) => s.dm);
  return getBench();
}
