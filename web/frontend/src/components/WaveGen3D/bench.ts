// 整張實驗桌的直流電路：電源供應器（+ = 麵包板 Va、− = GND）＋ 負載電阻 ＋ 麵包板上的零件
// 依輸入物件參照做快取，React 元件與 useFrame 都可以呼叫 getBench() 而不重複求解
import { useBoard } from './boardStore.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { useWaveLab } from './waveStore.js';
import { waveMean } from './waveform.js';
import { netOf, postKey, type HoleKey } from './boardModel.js';
import { solveCircuit, type Element, type Solution } from './circuit.js';
import { DIODE_PIV, LDO_VIN_MAX, ledModel, type BoardPart } from './boardParts.js';
import type { PsuReading, PsuSettings } from './psu.js';
import { useDev, type Issue } from './devboards/devStore.js';
import { devElements, devIssues, type DevState, type Damage } from './devboards/devCircuit.js';
import { DEV_KINDS, type DevKind } from './devboards/boardDefs.js';
import { useChips, type ChipRt } from './chips/chipStore.js';
import { chipElements } from './chips/chipCircuit.js';

export interface Bench {
  sol: Solution;
  psu: PsuReading;
  loadP: number;
  netOfHole: (k: HoleKey) => string;
  holeV: (k: HoleKey) => number | null; // 沒接到任何元件的孔回傳 null
  overVoltage: string[]; // 輸入超過 15 V 的 LT1117（要標成損壞）
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
 * 儀器的地（大地）：函數產生器 BNC 外殼（黑線 −）與示波器、頻譜分析儀探棒接地夾，在真實實驗室裡都經過儀器外殼、電源線接到同一個大地。
 * 所以產生器 − 與示波器 − 夾在不同地方時，電流可以經由大地流回產生器（這也是「接地夾夾錯地方會短路」的原因）。
 * 電源供應器輸出是浮接的，只經過漏電跟大地相連。
 */
export function earthHoles(): HoleKey[] {
  const { leads } = useBoard.getState();
  return [leads.fg?.[1], leads.ch1?.[1], leads.ch2?.[1], leads.sa?.[1]].filter((h): h is HoleKey => !!h);
}
const EARTH = 'EARTH';

export function computeBench(psu: PsuSettings, loadR: number, parts: BoardPart[], tsd: Record<string, boolean>, dev: DevState, chips: Record<string, ChipRt> = {}, fg: FgSource | null = null, earth: HoleKey[] = []): Bench {
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
  const sol = solveCircuit(els, GND);
  const di = devIssues(dev, sol, merged.net);
  const r = sol.el.psu;
  const mode = r.mode === 'CC' ? 'CC' : r.mode === 'CV' ? 'CV' : 'OFF';
  const overVoltage = parts
    .filter((p) => p.kind === 'ldo' && !p.burnt && (sol.el[p.id]?.vin ?? 0) > LDO_VIN_MAX)
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
  const key = [ps.psu, ps.loadIdx, ps.burnt, bs.parts, bs.tsd, ds.conf, cs.elec, bs.leads, bs.leads.fg ? wl.gen : null,
    ...DEV_KINDS.flatMap((k) => [ds.rt[k].pins, ds.rt[k].dead, ds.rt[k].tripped])];
  if (cache && cache.key.every((v, i) => v === key[i])) return cache.bench;
  const bench = computeBench(ps.psu, loadResistance(ps), bs.parts, bs.tsd, ds, cs.rt, fgDc(), earthHoles());
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
  return getBench();
}
