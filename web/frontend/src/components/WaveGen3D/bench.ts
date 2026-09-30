// 整張實驗桌的直流電路：電源供應器（+ = 麵包板 Va、− = GND）＋ 負載電阻 ＋ 麵包板上的零件
// 依輸入物件參照做快取，React 元件與 useFrame 都可以呼叫 getBench() 而不重複求解
import { useBoard } from './boardStore.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { netOf, postKey, type HoleKey } from './boardModel.js';
import { solveCircuit, type Element, type Solution } from './circuit.js';
import { DIODE_PIV, LDO_VIN_MAX, ledModel, type BoardPart } from './boardParts.js';
import type { PsuReading, PsuSettings } from './psu.js';
import { useDev, type Issue } from './devboards/devStore.js';
import { devElements, devIssues, type DevState, type Damage } from './devboards/devCircuit.js';
import { DEV_KINDS, type DevKind } from './devboards/boardDefs.js';

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

export function computeBench(psu: PsuSettings, loadR: number, parts: BoardPart[], tsd: Record<string, boolean>, dev: DevState): Bench {
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

export function getBench(): Bench {
  const ps = usePsuLab.getState();
  const bs = useBoard.getState();
  const ds = useDev.getState();
  // 只有會影響電路的開發板狀態才放進快取 key（序列埠輸出改變不用重算電路）
  const key = [ps.psu, ps.loadIdx, ps.burnt, bs.parts, bs.tsd, ds.conf,
    ...DEV_KINDS.flatMap((k) => [ds.rt[k].pins, ds.rt[k].dead, ds.rt[k].tripped])];
  if (cache && cache.key.every((v, i) => v === key[i])) return cache.bench;
  const bench = computeBench(ps.psu, loadResistance(ps), bs.parts, bs.tsd, ds);
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
  return getBench();
}
