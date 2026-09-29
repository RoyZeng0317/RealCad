// 電源供應器與電阻負載的狀態（旋鈕拖曳旗標仍用 waveStore 的 dragging/knobHover）
import { create } from 'zustand';
import { type PsuSettings, V_MAX, I_MAX, LOAD_STEPS, AMBIENT } from './psu.js';

interface PsuLabState {
  psu: PsuSettings;
  loadIdx: number; // LOAD_STEPS 的索引
  loadTemp: number; // °C
  burnt: boolean;
  resistorNonce: number; // 每次更換電阻 +1，讓 3D 負載把溫度歸零

  setPsu: (patch: Partial<PsuSettings>) => void;
  stepV: (steps: number, fine?: boolean) => void;
  stepI: (steps: number, fine?: boolean) => void;
  stepLoad: (d: number) => void;
  setLoadIdx: (i: number) => void;
  setThermal: (temp: number, burnt: boolean) => void;
  replaceResistor: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function clampPsu(p: PsuSettings): PsuSettings {
  return {
    ...p,
    vSet: clamp(Math.round(p.vSet * 100) / 100, 0, V_MAX),
    iSet: clamp(Math.round(p.iSet * 1000) / 1000, 0, I_MAX),
  };
}

export const usePsuLab = create<PsuLabState>((set) => ({
  psu: { vSet: 5, iSet: 1, output: false, power: true },
  loadIdx: LOAD_STEPS.indexOf(10),
  loadTemp: AMBIENT,
  burnt: false,
  resistorNonce: 0,

  setPsu: (patch) => set((s) => ({ psu: clampPsu({ ...s.psu, ...patch }) })),
  stepV: (steps, fine = false) => set((s) => ({
    psu: clampPsu({ ...s.psu, vSet: s.psu.vSet + steps * (fine ? 0.01 : 0.1) }),
  })),
  stepI: (steps, fine = false) => set((s) => ({
    psu: clampPsu({ ...s.psu, iSet: s.psu.iSet + steps * (fine ? 0.001 : 0.01) }),
  })),
  stepLoad: (d) => set((s) => ({ loadIdx: clamp(s.loadIdx + d, 0, LOAD_STEPS.length - 1) })),
  setLoadIdx: (loadIdx) => set({ loadIdx }),
  setThermal: (loadTemp, burnt) => set({ loadTemp, burnt }),
  replaceResistor: () => set((s) => ({ burnt: false, loadTemp: AMBIENT, resistorNonce: s.resistorNonce + 1 })),
}));

/** 目前實際的負載電阻（燒斷 = 開路） */
export const loadResistance = (s: { loadIdx: number; burnt: boolean }) =>
  s.burnt ? Infinity : LOAD_STEPS[s.loadIdx];
