// 桌上型萬用電表 DM-5050 的設定與「它接進電路時長什麼樣子」
//   電壓 / 頻率檔：輸入阻抗很高，不放任何元件
//   電流檔：HI 插頭插在 mA（1 Ω 分流電阻、0.5 A 保險絲）或 10A（0.01 Ω）插座，電表本身串進電路
//   電阻 / 二極體 / 導通檔：電表送出測試電流（戴維寧電壓源 + 內阻），由兩端電壓算出電阻
import { create } from 'zustand';
import { useBoard } from './boardStore.js';
import type { HoleKey } from './boardModel.js';

export type DmMode = 'dcv' | 'acv' | 'dci' | 'aci' | 'ohm' | 'diode' | 'cont' | 'freq';
export const DM_MODES: [DmMode, string][] = [
  ['dcv', 'DCV'], ['acv', 'ACV'], ['dci', 'DCI'], ['aci', 'ACI'], ['ohm', 'Ω'], ['diode', '⊣▷'], ['cont', '•)))'], ['freq', 'FREQ'],
];
export const DM_MODE_NAME: Record<DmMode, string> = {
  dcv: '直流電壓', acv: '交流電壓（真有效值）', dci: '直流電流', aci: '交流電流（真有效值）',
  ohm: '電阻', diode: '二極體測試', cont: '導通測試（嗶聲）', freq: '頻率',
};

export interface DmSettings {
  power: boolean;
  mode: DmMode;
  jack: 'mA' | '10A'; // 電流檔時紅色插頭插在哪個插座
  fuseOk: boolean; // mA 插座的 0.5 A 保險絲
  hold: boolean;
  rel: number | null; // REL（相對值）：記下的基準
  ohmRange: number; // 電阻檔自動換檔目前在第幾檔
}

export const DM_DEFAULT: DmSettings = { power: true, mode: 'dcv', jack: 'mA', fuseOk: true, hold: false, rel: null, ohmRange: 2 };

// 電阻檔：測試源開路電壓 1.2 V，內阻依檔位；導通檔固定 1 kΩ 檔；二極體檔 3 V / 3 kΩ（約 1 mA）
export const OHM_VT = 1.2;
export const OHM_RANGES = [100, 1e3, 10e3, 100e3, 1e6, 10e6];
export const DIODE_VT = 3, DIODE_R = 3e3;
export const SHUNT = { mA: 1, '10A': 0.01 } as const;
export const FUSE = { mA: 0.5, '10A': 10 } as const;

interface DmState {
  dm: DmSettings;
  setDm: (p: Partial<DmSettings>) => void;
}

export const useDm = create<DmState>((set) => ({
  dm: DM_DEFAULT,
  setDm: (p) => set((s) => {
    const n = { ...s.dm, ...p };
    // 換功能時清掉 HOLD / REL，電阻檔從中間檔開始自動換檔
    if (p.mode && p.mode !== s.dm.mode) { n.hold = false; n.rel = null; if (p.ohmRange === undefined) n.ohmRange = 2; }
    return { dm: n };
  }),
}));

export const isCurrentMode = (m: DmMode) => m === 'dci' || m === 'aci';

/** 電表接進電路的元件（給 bench.ts 蓋進電路）；null = 沒有元件（高阻抗量電壓 / 沒接線） */
export type MeterSpec =
  | { pins: [HoleKey, HoleKey]; kind: 'shunt'; r: number }
  | { pins: [HoleKey, HoleKey]; kind: 'test'; v: number; r: number };

export function dmSpec(): MeterSpec | null {
  const pins = useBoard.getState().leads.dm;
  if (!pins) return null;
  const s = useDm.getState().dm;
  // 分流電阻是被動元件：電表關機也還在；保險絲燒斷就是開路
  if (isCurrentMode(s.mode)) return s.jack === 'mA' && !s.fuseOk ? null : { pins, kind: 'shunt', r: SHUNT[s.jack] };
  if (!s.power) return null;
  if (s.mode === 'ohm') return { pins, kind: 'test', v: OHM_VT, r: OHM_RANGES[s.ohmRange] };
  if (s.mode === 'cont') return { pins, kind: 'test', v: OHM_VT, r: 1e3 };
  if (s.mode === 'diode') return { pins, kind: 'test', v: DIODE_VT, r: DIODE_R };
  return null;
}
