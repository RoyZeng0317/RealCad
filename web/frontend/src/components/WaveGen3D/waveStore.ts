// 3D 函數波產生器實驗桌的狀態：產生器設定、示波器設定、視角與旋鈕拖曳狀態
import { create } from 'zustand';
import {
  type GenSettings, type Waveform, FREQ_MIN, FREQ_MAX, OUTPUT_LIMIT,
  TIME_DIVS, VOLT_DIVS, H_DIVS,
} from './waveform.js';

export type GenParam = 'frequency' | 'amplitude' | 'offset' | 'duty';
export type ViewPreset = 'overview' | 'generator' | 'scope';

export interface ScopeSettings {
  timeDivIdx: number;
  voltDivIdx: number;
  position: number; // 垂直位置（格）
  trigLevel: number; // V
  running: boolean;
  coupling: 'DC' | 'AC';
}

interface WaveLabState {
  gen: GenSettings;
  selected: GenParam;
  scope: ScopeSettings;
  view: ViewPreset;
  viewNonce: number; // 每次按視角按鈕都 +1，即使是同一個視角也會重新飛過去
  dragging: boolean;
  knobHover: boolean;

  setGen: (patch: Partial<GenSettings>) => void;
  setWaveform: (w: Waveform) => void;
  setSelected: (p: GenParam) => void;
  stepSelected: (steps: number, fine?: boolean) => void;
  setScope: (patch: Partial<ScopeSettings>) => void;
  stepTimeDiv: (d: number) => void;
  stepVoltDiv: (d: number) => void;
  autoSet: () => void;
  setView: (v: ViewPreset) => void;
  setDragging: (v: boolean) => void;
  setKnobHover: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** 參數的合法範圍（振幅＋偏移不可超過 ±10 V 輸出上限） */
export function clampGen(g: GenSettings): GenSettings {
  const frequency = clamp(Number(g.frequency.toPrecision(4)), FREQ_MIN, FREQ_MAX);
  const amplitude = clamp(round(g.amplitude, 0.001), 0.002, 2 * OUTPUT_LIMIT);
  const maxOffset = OUTPUT_LIMIT - amplitude / 2;
  const offset = clamp(round(g.offset, 0.001), -maxOffset, maxOffset);
  const duty = clamp(Math.round(g.duty), 1, 99);
  return { ...g, frequency, amplitude, offset, duty };
}

export const useWaveLab = create<WaveLabState>((set, get) => ({
  gen: {
    waveform: 'sine', frequency: 1000, amplitude: 4, offset: 0, duty: 25,
    output: true, power: true,
  },
  selected: 'frequency',
  scope: {
    timeDivIdx: TIME_DIVS.indexOf(0.0002), voltDivIdx: VOLT_DIVS.indexOf(1),
    position: 0, trigLevel: 0, running: true, coupling: 'DC',
  },
  view: 'overview',
  viewNonce: 0,
  dragging: false,
  knobHover: false,

  setGen: (patch) => set((s) => ({ gen: clampGen({ ...s.gen, ...patch }) })),
  setWaveform: (waveform) => set((s) => ({ gen: { ...s.gen, waveform } })),
  setSelected: (selected) => set({ selected }),

  // ADJUST 旋鈕每一格的變化量；fine（按住 Shift）時更細
  stepSelected: (steps, fine = false) => {
    const { gen, selected } = get();
    const g = { ...gen };
    switch (selected) {
      case 'frequency': g.frequency *= 10 ** (steps / (fine ? 200 : 24)); break;
      case 'amplitude': g.amplitude += steps * (fine ? 0.01 : 0.1); break;
      case 'offset': g.offset += steps * (fine ? 0.01 : 0.1); break;
      case 'duty': g.duty += steps; break;
    }
    set({ gen: clampGen(g) });
  },

  setScope: (patch) => set((s) => ({ scope: { ...s.scope, ...patch } })),
  stepTimeDiv: (d) => set((s) => ({
    scope: { ...s.scope, timeDivIdx: clamp(s.scope.timeDivIdx + d, 0, TIME_DIVS.length - 1) },
  })),
  stepVoltDiv: (d) => set((s) => ({
    scope: { ...s.scope, voltDivIdx: clamp(s.scope.voltDivIdx + d, 0, VOLT_DIVS.length - 1) },
  })),

  // AUTO SET：畫面約顯示 2.5 個週期、峰值約佔 3.5 格、觸發準位放在直流準位
  autoSet: () => {
    const { gen, scope } = get();
    const target = 2.5 / (gen.frequency * H_DIVS);
    let timeDivIdx = TIME_DIVS.findIndex((t) => t >= target);
    if (timeDivIdx < 0) timeDivIdx = TIME_DIVS.length - 1;
    const on = gen.power && gen.output;
    const ac = scope.coupling === 'AC';
    const peak = on ? (ac ? 0 : Math.abs(gen.offset)) + gen.amplitude / 2 : 0.5;
    let voltDivIdx = VOLT_DIVS.findIndex((v) => peak / v <= 3.5);
    if (voltDivIdx < 0) voltDivIdx = VOLT_DIVS.length - 1;
    set({
      scope: {
        ...scope, timeDivIdx, voltDivIdx, position: 0,
        trigLevel: on && !ac ? gen.offset : 0, running: true,
      },
    });
  },

  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
  setDragging: (dragging) => set({ dragging }),
  setKnobHover: (knobHover) => set({ knobHover }),
}));
