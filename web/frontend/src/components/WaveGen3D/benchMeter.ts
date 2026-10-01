// 桌上型萬用電表 DM-5050 的讀值（50,000 count、雙顯示）
//   量的是紅棒（HI / 電流插座）對黑棒（LO / COM）：產生器接在麵包板上時，DC 取一個週期的平均、AC 取去掉直流後的真有效值（RMS）
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { usePsuLab } from './psuStore.js';
import { getBench, fgDc, meterV } from './bench.js';
import { transferOf, probeAt, probeConnected } from './scopeLink.js';
import { useDm, isCurrentMode, OHM_VT, OHM_RANGES, DIODE_VT, DIODE_R, SHUNT, FUSE, type DmMode } from './dmStore.js';

export interface DmReading {
  value: number | null; // SI 單位（V、A、Ω、Hz）；null = 不顯示數字
  main: string; // 主顯示：數字或 OL / -----
  unit: string; // 主顯示單位（mV、kΩ…）
  sub: string; // 副顯示（交流檔顯示頻率、其他顯示檔位）
  beep: boolean; // 導通檔：嗶
  note: string; // 給面板的說明（未接線、保險絲燒斷、量電阻要關電源…）
  blowFuse: boolean; // 電流超過保險絲額定
  ohmRange: number | null; // 電阻檔自動換檔：下一個檔位（跟現在一樣就是 null）
}

/** 50,000 count 的顯示：依大小選前綴與小數位數（最多 5 位數） */
export function fmtCount(v: number, unit: string): { main: string; unit: string } {
  const a = Math.abs(v);
  // 電壓最小到 mV 檔（500 mV 檔解析度 10 µV）、電流最小到 µA 檔
  const pre: [number, string][] = unit === 'Ω' || unit === 'Hz' ? [[1e6, 'M'], [1e3, 'k'], [1, '']]
    : unit === 'V' ? [[1, ''], [1e-3, 'm']] : [[1, ''], [1e-3, 'm'], [1e-6, 'µ']];
  const [k, p] = pre.find(([m]) => a >= m * 0.05) ?? pre[pre.length - 1];
  const x = v / k, ax = Math.abs(x);
  const dec = ax < 5 ? 4 : ax < 50 ? 3 : ax < 500 ? 2 : ax < 5000 ? 1 : 0;
  return { main: x.toFixed(dec), unit: p + unit };
}

/** 紅棒對黑棒電壓：平均值與交流有效值 */
function stats(a: string, b: string): { mean: number; ac: number; connected: boolean } {
  const tr = transferOf(a, b);
  const connected = probeConnected(tr);
  if (!fgDc()) return { mean: meterV(getBench(), a, b) ?? 0, ac: 0, connected };
  const gen = useWaveLab.getState().gen;
  const N = 256, T = 1 / gen.frequency;
  const xs = Array.from({ length: N }, (_, i) => probeAt(tr, ((i + 0.5) / N) * T));
  const mean = xs.reduce((s, x) => s + x, 0) / N;
  const ac = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / N);
  return { mean, ac, connected };
}

const OHM_RANGE_NAME = ['500 Ω', '5 kΩ', '50 kΩ', '500 kΩ', '5 MΩ', '50 MΩ'];

const blank = (main: string, note = ''): DmReading =>
  ({ value: null, main, unit: '', sub: '', beep: false, note, blowFuse: false, ohmRange: null });

export function dmRead(): DmReading {
  const s = useDm.getState().dm;
  if (!s.power) return blank('');
  const lead = useBoard.getState().leads.dm;
  if (!lead) return blank('-----', '紅黑測試線還沒接到麵包板：左側「工具 → 桌上型萬用電表測試線」');
  const mode: DmMode = s.mode;
  const { mean, ac, connected } = stats(lead[0], lead[1]);
  const gen = useWaveLab.getState().gen;
  const freq = fgDc() && gen.power && gen.output && ac > 0.005 ? gen.frequency : 0;
  const out = (value: number, unit: string, extra: Partial<DmReading> = {}): DmReading => {
    const v = s.rel !== null ? value - s.rel : value;
    return { value: v, ...fmtCount(v, unit), sub: '', beep: false, note: '', blowFuse: false, ohmRange: null, ...extra };
  };

  if (isCurrentMode(mode)) {
    if (s.jack === 'mA' && !s.fuseOk) return { ...out(0, 'A'), note: 'mA 插座的 0.5 A 保險絲已燒斷：電流檔量不到電流（更換保險絲）', sub: 'FUSE' };
    const r = SHUNT[s.jack];
    const i = mode === 'dci' ? mean / r : ac / r;
    const peak = Math.abs(mean / r) + (ac / r) * Math.SQRT2;
    return out(i, 'A', {
      sub: mode === 'aci' && freq ? `${fmtCount(freq, 'Hz').main} ${fmtCount(freq, 'Hz').unit}` : `${s.jack} 插座`,
      blowFuse: s.jack === 'mA' && peak > FUSE.mA,
      note: '電流檔：電表要「串聯」在電路裡（把線路斷開，紅棒接電流流進來那端）。並聯在電源兩端會短路燒保險絲！',
    });
  }
  if (mode === 'dcv') return out(mean, 'V', { sub: 'AUTO' });
  if (mode === 'acv') return out(ac, 'V', { sub: freq ? `${fmtCount(freq, 'Hz').main} ${fmtCount(freq, 'Hz').unit}` : 'AC' });
  if (mode === 'freq') return out(freq, 'Hz', { sub: ac > 0.005 ? `${fmtCount(ac, 'V').main} ${fmtCount(ac, 'V').unit}rms` : '' });

  const psu = usePsuLab.getState().psu;
  const live = psu.power && psu.output ? '電源供應器輸出開著：量電阻 / 二極體前要先關閉電路電源，否則讀值不準' : '';
  if (mode === 'diode') {
    if (!connected || mean > DIODE_VT * 0.93) return { ...blank('OL', live), unit: 'V', sub: '⊣▷' };
    return out(mean, 'V', { sub: `${((DIODE_VT - mean) / DIODE_R * 1000).toFixed(2)} mA`, note: live || '紅棒接陽極、黑棒接陰極：矽二極體約 0.5–0.7 V，LED 約 1.8–3 V' });
  }
  // 電阻 / 導通：R = 內阻 × V / (Vt − V)
  const rIn = mode === 'cont' ? 1e3 : OHM_RANGES[s.ohmRange];
  const top = mode === 'ohm' && s.ohmRange === OHM_RANGES.length - 1;
  const R = mean < OHM_VT * 0.999 ? (rIn * mean) / (OHM_VT - mean) : Infinity;
  let next: number | null = null;
  if (mode === 'ohm') {
    if (mean > OHM_VT * 0.9 && !top) next = s.ohmRange + 1;
    else if (mean < OHM_VT * 0.08 && s.ohmRange > 0) next = s.ohmRange - 1;
  }
  if (!connected || R < -1 || !isFinite(R) || (mode === 'ohm' && top && mean > OHM_VT * 0.95) || (mode === 'cont' && R > 50e3)) {
    return { ...blank('OL', live), unit: mode === 'cont' ? 'Ω' : 'MΩ', sub: mode === 'cont' ? '•)))' : 'AUTO', ohmRange: next };
  }
  return out(Math.max(0, R), 'Ω', {
    sub: mode === 'cont' ? '•)))' : `${OHM_RANGE_NAME[s.ohmRange]} 檔`,
    beep: mode === 'cont' && R < 50, ohmRange: next, note: live,
  });
}
