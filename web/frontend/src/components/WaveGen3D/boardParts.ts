// 麵包板零件定義：電阻（色碼）、1N4001–1N4007、LT1117-3.3（TO-220）、ATmega328P／CH340G（DIP）、跳線
// 類比零件：可變電阻（1k/10k/100k）、電解電容（100µF/50V、47µF/25V）、電感、電晶體 2N3904 / 2N3906
import type { HoleKey } from './boardModel.js';

export type PartKind = 'resistor' | 'diode' | 'led' | 'ldo' | 'wire' | 'atmega' | 'ch340' | 'pot' | 'cap' | 'ind' | 'bjt';

export interface BoardPart {
  id: string;
  kind: PartKind;
  pins: HoleKey[]; // 電阻 [a,b]、二極體 [陽極,陰極]、LDO [1 GND, 2 VOUT, 3 VIN]、跳線 [a,b]、可變電阻 [1, W, 3]、電解電容 [+, −]、電晶體 [E, B, C]
  value?: number; // 電阻 Ω；可變電阻總阻值 Ω；電感 H
  pos?: number; // 可變電阻的旋鈕位置 0（腳 1 端）~ 1（腳 3 端）
  capModel?: CapModel;
  bjtModel?: BjtModel;
  model?: DiodeModel;
  ledColor?: LedColor;
  color?: string; // 跳線顏色
  code?: string; // ATmega328P：編輯中的程式
  flash?: string; // ATmega328P：已經燒進 Flash 的程式（斷電不會消失）
  burnt?: boolean;
  gen: number; // 更換零件時 +1（讓溫度重新從室溫開始）
}

// 1N400x 系列：差別只在反向耐壓 PIV
export const DIODE_MODELS = ['1N4001', '1N4002', '1N4003', '1N4004', '1N4005', '1N4006', '1N4007'] as const;
export type DiodeModel = (typeof DIODE_MODELS)[number];
export const DIODE_PIV: Record<DiodeModel, number> = {
  '1N4001': 50, '1N4002': 100, '1N4003': 200, '1N4004': 400, '1N4005': 600, '1N4006': 800, '1N4007': 1000,
};

// 5 mm LED：Vf 為 20 mA 時的順向電壓；牛頓法用的理想因子依 Vf 縮放，讓各色 LED 都落在指數模型的有效範圍
export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];
export const LED_SPEC: Record<LedColor, { name: string; vf: number; hex: string }> = {
  red: { name: '紅', vf: 2.0, hex: '#ff2a1a' },
  yellow: { name: '黃', vf: 2.1, hex: '#ffc21a' },
  green: { name: '綠', vf: 2.2, hex: '#2aff4a' },
  blue: { name: '藍', vf: 3.1, hex: '#2a7aff' },
  white: { name: '白', vf: 3.2, hex: '#f4f7ff' },
};
export const ledModel = (c: LedColor) => ({ nvt: LED_SPEC[c].vf / 32, is: 0.02 / Math.exp(32), bv: 5 });
export const LED_IMAX = 0.03; // 連續最大電流 30 mA

// E12 系列 10 Ω ~ 1 MΩ
export const RESISTOR_VALUES: number[] = [1, 2, 3, 4, 5].flatMap((e) =>
  [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2].map((m) => Number((m * 10 ** e).toPrecision(2))),
).concat([1e6]);

export const RESISTOR_RATING = 0.25; // W（1/4 W 碳膜電阻）
export const R_MIN = 0.1, R_MAX = 10e6; // 可輸入的電阻範圍

/**
 * 解析使用者輸入的電阻值：330、4.7k、4k7、2.2 kΩ、1M、0.5、1R5（= 1.5 Ω）；大小寫都可以
 * 回傳 Ω，看不懂或超出範圍回傳 null
 */
export function parseOhm(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(/(ohms?|Ω|歐姆|欧姆)$/i, '');
  const mult: Record<string, number> = { r: 1, k: 1e3, m: 1e6 };
  let v: number;
  let m = /^(\d+(?:\.\d+)?)([rkm])?$/i.exec(t);
  if (m) v = Number(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
  else if ((m = /^(\d+)([rkm])(\d+)$/i.exec(t))) v = Number(`${m[1]}.${m[3]}`) * mult[m[2].toLowerCase()]; // 4k7 寫法
  else return null;
  // M 在電子業是 mega；避免把 1m 當成 milli
  return isFinite(v) && v >= R_MIN && v <= R_MAX ? Number(v.toPrecision(6)) : null;
}

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

// ---- 可變電阻（3 腳，中間是滑動端 W）----
export const POT_VALUES = [1e3, 10e3, 100e3];
export const POT_RATING = 0.5; // W
export const POT_END_R = 0.5; // 轉到底時滑動端與端腳之間仍有的接觸電阻 Ω

// ---- 電解電容（有極性：腳 1 是 +，長腳；外殼白色條紋那邊是 −）----
export const CAP_MODELS = {
  '100u50': { c: 100e-6, v: 50, name: '100 µF / 50 V', d: 8, h: 11.5, color: '#1d3f8a' },
  '47u25': { c: 47e-6, v: 25, name: '47 µF / 25 V', d: 6.3, h: 11, color: '#121418' },
} as const;
export type CapModel = keyof typeof CAP_MODELS;
export const CAP_MODEL_IDS = Object.keys(CAP_MODELS) as CapModel[];
export const CAP_REVERSE_MAX = 1; // 反接超過 1 V 就會損壞

// ---- 電感（色碼電感 / 工字電感；直流電阻 DCR 隨電感量變大）----
export const IND_VALUES = [100e-6, 1e-3, 10e-3];
export const indDcr = (l: number) => Number((0.03 + 300 * l ** 0.8).toPrecision(2)); // 100 µH ≈ 0.2 Ω、1 mH ≈ 1.2 Ω、10 mH ≈ 7.6 Ω
export const IND_IMAX = 0.5; // A

// ---- 電晶體（TO-92，平面朝自己時腳位由左到右 E、B、C）----
// Ebers-Moll 參數（取自常見 SPICE 模型、BF 取典型 hFE）；pMax / icMax 為額定功率 / 集極電流
// S9013 / S9012：常見的中功率對管（IC 500 mA），腳位一樣是 E、B、C
export const BJT_MODELS = {
  '2N3904': { pol: 1 as const, is: 6.73e-15, bf: 200, br: 0.74, name: '2N3904（NPN）', pMax: 0.625, icMax: 0.2 },
  '2N3906': { pol: -1 as const, is: 1.41e-15, bf: 180, br: 4.98, name: '2N3906（PNP）', pMax: 0.625, icMax: 0.2 },
  S9013: { pol: 1 as const, is: 3.4e-14, bf: 144, br: 3.4, name: 'S9013（NPN）', pMax: 0.625, icMax: 0.5 },
  S9012: { pol: -1 as const, is: 3.0e-14, bf: 144, br: 4.0, name: 'S9012（PNP）', pMax: 0.625, icMax: 0.5 },
};
export type BjtModel = keyof typeof BJT_MODELS;
export const BJT_MODEL_IDS = Object.keys(BJT_MODELS) as BjtModel[];
export const BJT_PMAX = 0.625, BJT_ICMAX = 0.2; // W、A（2N3904 / 2N3906；各型號的額定值在 BJT_MODELS 的 pMax / icMax）

// 熱模型參數：穩態溫升 = P × Rth，燒毀溫度
export const THERMAL: Record<Exclude<PartKind, 'wire'>, { rth: number; tau: number; burn: number }> = {
  resistor: { rth: 280, tau: 4, burn: 330 }, // 1/4 W：約 1 W 以上會燒
  diode: { rth: 60, tau: 5, burn: 260 }, // 1N400x：約 4 W 以上會燒
  led: { rth: 1200, tau: 1.5, burn: 300 }, // 5 mm LED：約 0.23 W（~100 mA）以上會燒
  ldo: { rth: 50, tau: 8, burn: Infinity }, // TO-220 無散熱片：150 °C 熱關斷，不會燒
  atmega: { rth: 60, tau: 10, burn: Infinity }, // DIP-28
  ch340: { rth: 80, tau: 8, burn: Infinity },
  pot: { rth: 110, tau: 6, burn: 280 }, // 0.5 W：約 2.3 W 以上會燒
  cap: { rth: 1, tau: 1, burn: Infinity }, // 電容不發熱；過壓 / 反接由電路判斷損壞
  ind: { rth: 60, tau: 6, burn: 250 }, // 電流流過 DCR 發熱
  bjt: { rth: 200, tau: 3, burn: 200 }, // TO-92：約 0.9 W 以上會燒
};
export const LDO_TSD_ON = 150, LDO_TSD_OFF = 130; // 熱關斷 / 恢復溫度
export const LDO_VIN_MAX = 15; // 超過就損壞

export function partLabel(p: BoardPart): string {
  if (p.kind === 'resistor') return `電阻 ${fmtOhm(p.value!)}`;
  if (p.kind === 'diode') return `二極體 ${p.model}`;
  if (p.kind === 'led') return `${LED_SPEC[p.ledColor ?? 'red'].name}色 LED`;
  if (p.kind === 'ldo') return 'LT1117-3.3 穩壓 IC';
  if (p.kind === 'atmega') return 'ATmega328P-PU';
  if (p.kind === 'ch340') return 'CH340G USB 轉序列';
  if (p.kind === 'pot') return `可變電阻 ${fmtOhm(p.value!)}`;
  if (p.kind === 'cap') return `電解電容 ${CAP_MODELS[p.capModel ?? '100u50'].name}`;
  if (p.kind === 'ind') return `電感 ${fmtHenry(p.value!)}`;
  if (p.kind === 'bjt') return `電晶體 ${BJT_MODELS[p.bjtModel ?? '2N3904'].name}`;
  return '杜邦線';
}

export function fmtOhm(r: number): string {
  if (r >= 1e6) return `${+(r / 1e6).toPrecision(3)} MΩ`;
  if (r >= 1e3) return `${+(r / 1e3).toPrecision(3)} kΩ`;
  return `${+r.toPrecision(3)} Ω`;
}

export function fmtHenry(l: number): string {
  if (l >= 1) return `${+l.toPrecision(3)} H`;
  if (l >= 1e-3) return `${+(l * 1e3).toPrecision(3)} mH`;
  return `${+(l * 1e6).toPrecision(3)} µH`;
}
