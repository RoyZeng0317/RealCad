// 頻譜分析儀 SA-1010 的設定（跟著專案檔存）
import { create } from 'zustand';
import type { SaSettings } from './spectrum.js';
import { SA_FMAX } from './spectrum.js';

export const SA_DEFAULT: SaSettings = {
  center: 5e3, span: 10e3, ref: 20, rbw: 0, unit: 'dBm', z50: true, running: true, marker: null,
};

interface SaState {
  sa: SaSettings;
  setSa: (p: Partial<SaSettings>) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const useSa = create<SaState>((set) => ({
  sa: SA_DEFAULT,
  setSa: (p) => set((s) => {
    const n = { ...s.sa, ...p };
    // 換單位時參考準位跟著換算（50 Ω 下 dBV = dBm − 13），畫面上的訊號位置不會跳
    if (p.unit && p.unit !== s.sa.unit && p.ref === undefined) n.ref = Math.round(n.ref + (p.unit === 'dBV' ? -13 : 13));
    n.span = clamp(n.span, 10, SA_FMAX);
    n.center = clamp(n.center, n.span / 2 >= SA_FMAX ? SA_FMAX / 2 : 0, SA_FMAX);
    n.ref = clamp(n.ref, -80, 40);
    return { sa: n };
  }),
}));
