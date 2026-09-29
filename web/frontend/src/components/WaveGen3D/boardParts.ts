// 麵包板零件定義：電阻（色碼）、1N4001–1N4007、LT1117-3.3（TO-220）、跳線
import type { HoleKey } from './boardModel.js';

export type PartKind = 'resistor' | 'diode' | 'ldo' | 'wire';

export interface BoardPart {
  id: string;
  kind: PartKind;
  pins: HoleKey[]; // 電阻 [a,b]、二極體 [陽極,陰極]、LDO [1 GND, 2 VOUT, 3 VIN]、跳線 [a,b]
  value?: number; // 電阻 Ω
  model?: DiodeModel;
  color?: string; // 跳線顏色
  burnt?: boolean;
  gen: number; // 更換零件時 +1（讓溫度重新從室溫開始）
}

// 1N400x 系列：差別只在反向耐壓 PIV
export const DIODE_MODELS = ['1N4001', '1N4002', '1N4003', '1N4004', '1N4005', '1N4006', '1N4007'] as const;
export type DiodeModel = (typeof DIODE_MODELS)[number];
export const DIODE_PIV: Record<DiodeModel, number> = {
  '1N4001': 50, '1N4002': 100, '1N4003': 200, '1N4004': 400, '1N4005': 600, '1N4006': 800, '1N4007': 1000,
};

// E12 系列 10 Ω ~ 1 MΩ
export const RESISTOR_VALUES: number[] = [1, 2, 3, 4, 5].flatMap((e) =>
  [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2].map((m) => Number((m * 10 ** e).toPrecision(2))),
).concat([1e6]);

export const RESISTOR_RATING = 0.25; // W（1/4 W 碳膜電阻）

export const WIRE_COLORS = ['#d42a2a', '#1b1d20', '#2a6fd4', '#2aa84a', '#e0b010', '#e07a1a', '#f2f2f2'];

// 4 環色碼：第 1、2 位數、倍率、誤差（金 5%）
const BAND = ['#111111', '#7a4a1e', '#d42020', '#f08a1a', '#f2d21a', '#2aa84a', '#2a56d4', '#8a3ad4', '#8a8a8a', '#f5f5f5'];
export function colorBands(ohms: number): string[] {
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const two = Math.round(ohms / 10 ** exp);
  const d1 = Math.floor(two / 10), d2 = two % 10;
  const mult = exp >= 0 ? BAND[exp] : exp === -1 ? '#c9a24a' : '#c0c0c0';
  return [BAND[d1], BAND[d2], mult, '#c9a24a'];
}

// 熱模型參數：穩態溫升 = P × Rth，燒毀溫度
export const THERMAL: Record<Exclude<PartKind, 'wire'>, { rth: number; tau: number; burn: number }> = {
  resistor: { rth: 280, tau: 4, burn: 330 }, // 1/4 W：約 1 W 以上會燒
  diode: { rth: 60, tau: 5, burn: 260 }, // 1N400x：約 4 W 以上會燒
  ldo: { rth: 50, tau: 8, burn: Infinity }, // TO-220 無散熱片：150 °C 熱關斷，不會燒
};
export const LDO_TSD_ON = 150, LDO_TSD_OFF = 130; // 熱關斷 / 恢復溫度
export const LDO_VIN_MAX = 15; // 超過就損壞

export function partLabel(p: BoardPart): string {
  if (p.kind === 'resistor') return `電阻 ${fmtOhm(p.value!)}`;
  if (p.kind === 'diode') return `二極體 ${p.model}`;
  if (p.kind === 'ldo') return 'LT1117-3.3 穩壓 IC';
  return '跳線';
}

export function fmtOhm(r: number): string {
  if (r >= 1e6) return `${+(r / 1e6).toPrecision(3)} MΩ`;
  if (r >= 1e3) return `${+(r / 1e3).toPrecision(3)} kΩ`;
  return `${+r.toPrecision(3)} Ω`;
}
