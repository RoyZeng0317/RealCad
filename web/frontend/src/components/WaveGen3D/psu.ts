// 直流電源供應器 + 電阻負載的電路計算（純函式）：定電壓 CV / 定電流 CC 自動切換、負載發熱
export interface PsuSettings {
  vSet: number; // V，0 ~ 30
  iSet: number; // A，限流 0 ~ 5
  output: boolean;
  power: boolean;
}

export const V_MAX = 30;
export const I_MAX = 5;

export type PsuMode = 'OFF' | 'CV' | 'CC';

export interface PsuReading {
  v: number; // 輸出端實際電壓
  i: number; // 實際輸出電流
  p: number; // 負載消耗功率
  mode: PsuMode;
}

/**
 * 電源接上電阻 R（Infinity = 開路）時的工作點：
 * 負載電流 V/R 未超過限流 → CV（電壓 = 設定值）；超過 → CC（電流被限制在 iSet，電壓降為 iSet·R）
 */
export function solvePsu(s: PsuSettings, r: number): PsuReading {
  if (!s.power || !s.output) return { v: 0, i: 0, p: 0, mode: 'OFF' };
  if (!isFinite(r)) return { v: s.vSet, i: 0, p: 0, mode: 'CV' };
  const iCv = s.vSet / r;
  if (iCv <= s.iSet) return { v: s.vSet, i: iCv, p: s.vSet * iCv, mode: 'CV' };
  const v = s.iSet * r;
  return { v, i: s.iSet, p: v * s.iSet, mode: 'CC' };
}

/** 負載電阻檔位（E6 系列 1 Ω ~ 1 kΩ，最後一檔為開路） */
export const LOAD_STEPS: number[] = [
  ...[0, 1, 2].flatMap((e) => [1, 1.5, 2.2, 3.3, 4.7, 6.8].map((m) => Number((m * 10 ** e).toPrecision(2)))),
  1000,
  Infinity,
];

// 功率電阻（鋁殼 25 W）的熱模型：一階系統，穩態溫升 = P × R_TH
export const AMBIENT = 25; // °C
export const R_TH = 4; // °C/W
export const TAU = 6; // s，熱時間常數
export const RATED_POWER = 25; // W
export const BURN_TEMP = 350; // °C，超過就燒斷變成開路

/** 溫度往穩態逼近 dt 秒後的新溫度 */
export function stepTemperature(temp: number, p: number, dt: number): number {
  const target = AMBIENT + p * R_TH;
  return target + (temp - target) * Math.exp(-dt / TAU);
}
