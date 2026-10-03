// 示波器接到麵包板：用「掃描」算出波形
//   麵包板上的零件（電阻、二極體、LED、LT1117、IC 腳位）都沒有電容電感，每一瞬間的電壓只由當下的產生器電壓決定，
//   所以把產生器電壓從最低掃到最高、每一點求一次直流解，得到「產生器電壓 → 探棒電壓」的轉換曲線，
//   示波器取樣時再依產生器波形查表（二極體削波、LED 導通這類非線性都會正確出現）
//   有電容 / 電感時電路有「記憶」，查表不成立 → 改用暫態模擬（transient.ts）算出一個週期的波形，依時間查
import { useBoard, type LeadKind } from './boardStore.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { useWaveLab } from './waveStore.js';
import { useDev } from './devboards/devStore.js';
import { useChips } from './chips/chipStore.js';
import { computeBench, benchElements, getBench, fgDc, earthHoles, meterV, type Bench } from './bench.js';
import { hasReactive, hasMains, simulatePeriodic, type Periodic } from './transient.js';
import { dmSpec } from './dmStore.js';
import { waveRange, sampleWave } from './waveform.js';
import type { HoleKey } from './boardModel.js';

const STEPS = 41;

export interface Transfer {
  xs: number[]; // 產生器電壓（掃描點）
  ys: (number | null)[]; // 探棒電壓；null = 探棒插的點沒有接到電路
  dc: number | null; // 產生器沒接麵包板時：探棒量到的直流電壓
  wave?: (number | null)[]; // 暫態模擬：一個週期內每個相位的電壓（有電容 / 電感時）
  period?: number;
}

/** 這個通道實際量的是哪兩點：有自己的探棒就用探棒；CH1 沒接探棒、產生器又接在麵包板上時，等於用 BNC T 頭看產生器輸出端 */
export function channelLead(ch: 'ch1' | 'ch2'): [HoleKey, HoleKey] | null {
  const { leads } = useBoard.getState();
  if (leads[ch]) return leads[ch];
  return ch === 'ch1' ? leads.fg : null;
}

// 掃描結果（每個產生器電壓一份直流解）只在電路或產生器設定改變時重算；getBench() 只有在會影響電路的狀態改變時才換新物件
let sweep: { key: unknown[]; xs: number[]; benches: Bench[]; per: Periodic | null; net: ((k: HoleKey) => string) | null } | null = null;
const pairCache = new Map<string, Transfer>();

function getSweep() {
  const bs = useBoard.getState(), ps = usePsuLab.getState(), ds = useDev.getState(), cs = useChips.getState();
  const gen = useWaveLab.getState().gen;
  const key = [getBench(), bs.leads, gen];
  if (!sweep || !sweep.key.every((v, i) => v === key[i])) {
    const fg = fgDc();
    let xs: number[] = [], benches: Bench[] = [];
    let per: Periodic | null = null, net: ((k: HoleKey) => string) | null = null;
    // 插著市電的電源變壓器：不用接產生器也有交流 → 一律做暫態模擬（週期 = 市電週期）
    if ((fg && hasReactive(bs.parts) && gen.waveform !== 'noise') || hasMains(bs.parts)) {
      const b = benchElements(ps.psu, loadResistance(ps), bs.parts, bs.tsd, ds, cs.rt, fg, earthHoles(), dmSpec());
      per = simulatePeriodic(b.els, b.GND, gen);
      net = b.net;
    } else if (fg) {
      const [lo, hi] = waveRange(gen);
      const n = hi - lo < 1e-9 ? 1 : STEPS;
      xs = Array.from({ length: n }, (_, i) => (n === 1 ? lo : lo + ((hi - lo) * i) / (n - 1)));
      const earth = earthHoles();
      const meter = dmSpec();
      benches = xs.map((v) => computeBench(ps.psu, loadResistance(ps), bs.parts, bs.tsd, ds, cs.rt, { ...fg, v }, earth, meter));
    }
    sweep = { key, xs, benches, per, net };
    pairCache.clear();
  }
  return sweep;
}

/** 任兩點之間的轉換曲線（產生器沒接麵包板時是直流） */
export function transferOf(a: HoleKey, b: HoleKey): Transfer {
  const sw = getSweep();
  const id = `${a}|${b}`;
  let tr = pairCache.get(id);
  if (!tr) {
    const per = sw.per, net = sw.net;
    tr = per && net
      ? {
        xs: [], ys: [], dc: null, period: per.period,
        wave: per.sols.map((s) => { const va = s.nodeV[net(a)], vb = s.nodeV[net(b)]; return va === undefined || vb === undefined ? null : va - vb; }),
      }
      : sw.benches.length
      ? { xs: sw.xs, ys: sw.benches.map((bn) => meterV(bn, a, b)), dc: null }
      : { xs: [], ys: [], dc: meterV(getBench(), a, b) };
    pairCache.set(id, tr);
  }
  return tr;
}

/** 暫態模擬中某個元件一個週期的結果（每個相位一份，給變壓器這類只在交流下有意義的零件看 RMS）；沒有暫態模擬時回傳 null */
export function elementWave(id: string) {
  const per = getSweep().per;
  return per ? per.sols.map((s) => s.el[id]) : null;
}

/** 麵包板上有沒有交流：產生器接在麵包板上，或有插著市電的電源變壓器 */
export const mainsLive = () => hasMains(useBoard.getState().parts);
export const acActive = () => !!fgDc() || mainsLive();
/** 一個訊號週期（有市電時 = 1/60 s，否則 = 產生器週期） */
export function signalPeriod(): number {
  if (mainsLive()) { const per = getSweep().per; if (per) return per.period; }
  return 1 / useWaveLab.getState().gen.frequency;
}

export function getTransfers(): Record<'ch1' | 'ch2', Transfer | null> {
  const l1 = channelLead('ch1'), l2 = channelLead('ch2');
  return { ch1: l1 ? transferOf(l1[0], l1[1]) : null, ch2: l2 ? transferOf(l2[0], l2[1]) : null };
}

/** 三用電表（DC V）讀值：產生器接在麵包板上時，是那兩點電壓在一個週期內的平均（跟真的電表一樣），不是用輸入平均去算 */
export function dmmReading(red: HoleKey | null, black: HoleKey | null): number | null {
  if (!red || !black) return null;
  if (!acActive()) return meterV(getBench(), red, black);
  const tr = transferOf(red, black);
  if (!probeConnected(tr)) return null;
  const T = signalPeriod();
  let sum = 0;
  const N = 200;
  for (let i = 0; i < N; i++) sum += probeAt(tr, ((i + 0.5) / N) * T);
  return sum / N;
}

/** 依產生器當下的電壓查轉換曲線（線性內插）；探棒沒接到電路時回傳 0（示波器看到一條平線） */
export function probeValue(tr: Transfer, vfg: number): number {
  if (!tr.xs.length) return tr.dc ?? 0;
  const { xs, ys } = tr;
  if (xs.length === 1) return ys[0] ?? 0;
  const t = Math.max(0, Math.min(xs.length - 1, ((vfg - xs[0]) / (xs[xs.length - 1] - xs[0])) * (xs.length - 1)));
  const i = Math.min(xs.length - 2, Math.floor(t));
  const a = ys[i], b = ys[i + 1];
  if (a === null || b === null) return 0;
  return a + (b - a) * (t - i);
}

/** 時間 t 的探棒電壓：暫態模擬的結果依相位查；沒有電容電感時依產生器當下電壓查轉換曲線 */
export function probeAt(tr: Transfer, t: number): number {
  if (tr.wave && tr.period) {
    const M = tr.wave.length;
    const ph = (((t / tr.period) % 1) + 1) % 1 * M;
    const i = Math.floor(ph) % M, f = ph - Math.floor(ph);
    const a = tr.wave[i], b = tr.wave[(i + 1) % M];
    return a === null || b === null ? 0 : a + (b - a) * f;
  }
  return probeValue(tr, sampleWave(useWaveLab.getState().gen, t));
}

/** 探棒插的點有沒有接到電路（給面板顯示提示） */
export const probeConnected = (tr: Transfer | null) =>
  !!tr && (tr.wave ? tr.wave.some((y) => y !== null) : tr.xs.length ? tr.ys.some((y) => y !== null) : tr.dc !== null);

export const LEAD_KINDS: LeadKind[] = ['fg', 'ch1', 'ch2'];
